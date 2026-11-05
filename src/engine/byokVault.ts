/**
 * byok-vault.ts — 纯前端 BYOK 密钥保险库（零持久化优先）
 * =====================================================================
 * 适用场景：纯静态站点（GitHub Pages / Cloudflare Pages），用户在浏览器里
 * 填写自己的 API Key，由前端直连服务商（Bring Your Own Key）。
 *
 * 设计目标（无后端条件下可达到的最强防护）：
 *  1. 【默认零持久化】密钥只存在于模块私有 Map 中，页面刷新 / 关闭即消失。
 *     绝不写入 localStorage、Cookie、IndexedDB，绝不进入 URL、Referer、
 *     错误堆栈、备份文件、云同步载荷或任何可序列化对象。
 *  2. 【可选加密暂存】只有用户主动设置解锁口令并显式调用 persist() 才启用：
 *     PBKDF2-SHA256(310000 轮) 派生 + AES-256-GCM 加密，密文仅写入
 *     sessionStorage（标签页关闭即清）并带过期时间。口令与明文永不落盘，
 *     派生出的 CryptoKey 设为不可导出（extractable: false）。
 *  3. 【自动锁定】页面隐藏超时、空闲超时、pagehide / freeze 时擦除内存密钥。
 *  4. 【只读指纹】对外只暴露 SHA-256 前 8 位用于展示，不暴露明文。
 *  5. 【单一出口】组件层拿不到明文，只有请求层通过 get() / authHeaders() 取用。
 *
 * ⚠️ 已知边界（必须如实告知用户，不要宣称「绝对不会泄露」）：
 *  纯静态 BYOK 存在不可能三角：只要浏览器 JS 需要把明文 key 放进
 *  Authorization 头，同源执行的脚本就能读到它。因此若页面被 XSS 注入，
 *  攻击者仍可在密钥解锁期间 hook fetch 或读取内存。本模块能做的是把
 *  「长期可读的磁盘明文」变成「短暂存在的内存明文」，并配合严格 CSP
 *  把脚本注入这条路尽量堵死。要真正让浏览器永不持有明文 key，唯一根治
 *  方案是服务端代理 + HttpOnly 会话（本项目当前无后端，故未采用）。
 *
 * 配套要求（见 SECURITY.md）：站点必须部署 CSP、Referrer-Policy，且不得
 * 引入任何第三方可执行脚本；同时应引导用户使用「受限额度、可随时撤销」
 * 的专用子密钥，而非主账号密钥。
 */

const STORAGE_KEY = 'byok.vault.v1.blob'
const PBKDF2_ITERATIONS = 310000
const AES_BITS = 256
const SALT_BYTES = 16
const IV_BYTES = 12
const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000      // 加密暂存默认 8 小时
const IDLE_LOCK_MS = 15 * 60 * 1000            // 15 分钟无请求自动锁定
const HIDDEN_LOCK_MS = 3 * 60 * 1000           // 页面隐藏 3 分钟自动锁定
const FINGERPRINT_HEX = 8
const DEFAULT_SLOT = 'default'
/**
 * 「句柄」：运行时配置对象里代替明文 key 的标记，本身完全不能用于请求。
 * 形如 '@byok-vault:profile-0'。持久化、导出、日志里出现的永远是它，
 * 真正的密钥只存在于本模块的内存 Map 中。
 */
export const HANDLE_PREFIX = '@byok-vault:'
export const handleFor = (slot: string): string => `${HANDLE_PREFIX}${slot}`
export const isHandle = (v: unknown): v is string =>
  typeof v === 'string' && v.startsWith(HANDLE_PREFIX)
export const slotOf = (handleOrSlot: string): string =>
  isHandle(handleOrSlot)
    ? handleOrSlot.slice(HANDLE_PREFIX.length) || DEFAULT_SLOT
    : handleOrSlot || DEFAULT_SLOT

interface StoredBlob {
  v: 1
  alg: 'PBKDF2-SHA256/AES-256-GCM'
  iter: number
  salt: string
  iv: string
  ct: string
  exp: number
  slots: number
}

export interface VaultState {
  /** 内存中是否已有解锁的密钥 */
  unlocked: boolean
  /** 是否存在会话内加密暂存 */
  persisted: boolean
  /** 已解锁的槽位名（不含任何密钥内容） */
  slots: string[]
  /** 加密暂存的过期时间（无暂存时为 null） */
  expiresAt: number | null
}

/** 模块私有：唯一持有明文密钥的地方，不挂到 window / globalThis。 */
let memory = new Map<string, string>()
let idleTimer: ReturnType<typeof setTimeout> | null = null
let hiddenTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<(state: VaultState) => void>()
let guardsInstalled = false

/* ------------------------------------------------------------------ */
/* 编码工具                                                            */
/* ------------------------------------------------------------------ */

function subtle(): SubtleCrypto {
  const c = globalThis.crypto
  if (!c || !c.subtle) {
    throw new Error('当前环境不支持 Web Crypto：请用 HTTPS 或 localhost 打开站点。')
  }
  return c.subtle
}

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(n))
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: AES_BITS },
    false, // 不可导出：即使拿到 CryptoKey 也无法读出密钥材料
    ['encrypt', 'decrypt'],
  )
}

/* ------------------------------------------------------------------ */
/* 生命周期守卫                                                        */
/* ------------------------------------------------------------------ */

function emit(): void {
  const snapshot = state()
  for (const cb of listeners) {
    try { cb(snapshot) } catch { /* 订阅者异常不应影响保险库 */ }
  }
}

function clearTimers(): void {
  if (idleTimer !== null) { clearTimeout(idleTimer); idleTimer = null }
  if (hiddenTimer !== null) { clearTimeout(hiddenTimer); hiddenTimer = null }
}

function touch(): void {
  if (idleTimer !== null) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => lock(), IDLE_LOCK_MS)
}

function installGuards(): void {
  if (guardsInstalled || typeof window === 'undefined' || typeof document === 'undefined') return
  guardsInstalled = true

  document.addEventListener('visibilitychange', () => {
    if (hiddenTimer !== null) { clearTimeout(hiddenTimer); hiddenTimer = null }
    if (document.hidden) {
      hiddenTimer = setTimeout(() => lock(), HIDDEN_LOCK_MS)
    } else if (memory.size > 0) {
      touch()
    }
  })
  // 离开页面：擦除内存，但保留 sessionStorage 密文（刷新后可凭口令解锁）
  window.addEventListener('pagehide', () => lock())
  window.addEventListener('freeze', () => lock())
}

/* ------------------------------------------------------------------ */
/* 公开 API                                                            */
/* ------------------------------------------------------------------ */

/** 把一把密钥放进内存。不会持久化；如需刷新后可用，必须再显式调用 persist()。 */
export function set(slot: string, apiKey: string): void {
  const trimmed = (apiKey || '').trim()
  if (!trimmed) throw new Error('密钥不能为空')
  // 内存状态一旦变化，旧的加密暂存即作废，避免解锁出过期密钥
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(STORAGE_KEY)
  memory.set(slot || DEFAULT_SLOT, trimmed)
  installGuards()
  touch()
  emit()
}

/**
 * 取出密钥 —— 仅请求层调用。组件、日志、导出、同步逻辑都不应调用本函数。
 * 返回值用完即弃，不要赋给长期存活的变量 / state。
 */
export function get(slot: string = DEFAULT_SLOT): string | null {
  const key = memory.get(slotOf(slot)) ?? null
  if (key) { installGuards(); touch() }
  return key
}

export function has(slot: string = DEFAULT_SLOT): boolean {
  return (memory.get(slotOf(slot)) ?? '').length > 0
}

export function clearSlot(slot: string): void {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(STORAGE_KEY)
  memory.delete(slotOf(slot))
  emit()
}

/** 锁定：清空内存中的所有明文，保留 sessionStorage 密文。 */
export function lock(): void {
  clearTimers()
  memory = new Map<string, string>()
  emit()
}

/** 彻底销毁：清空内存 + 删除加密暂存，不可恢复。 */
export function purge(): void {
  clearTimers()
  memory = new Map<string, string>()
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(STORAGE_KEY)
  emit()
}

/** 是否存在可凭口令解锁的加密暂存（会顺手清掉过期项）。 */
export function hasPersisted(): boolean {
  if (typeof sessionStorage === 'undefined') return false
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return false
  try {
    const blob = JSON.parse(raw) as StoredBlob
    if (!blob.exp || Date.now() > blob.exp) {
      sessionStorage.removeItem(STORAGE_KEY)
      return false
    }
    return true
  } catch {
    sessionStorage.removeItem(STORAGE_KEY)
    return false
  }
}

/** 用口令把当前内存中的全部槽位加密暂存到 sessionStorage。 */
export async function persist(passphrase: string, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
  if (!passphrase || passphrase.length < 8) throw new Error('解锁口令至少 8 位')
  if (memory.size === 0) throw new Error('当前没有已解锁的密钥，无法暂存')
  if (typeof sessionStorage === 'undefined') throw new Error('当前环境不支持会话存储')

  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS)
  const plain = new TextEncoder().encode(JSON.stringify(Object.fromEntries(memory)))
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, plain)

  const blob: StoredBlob = {
    v: 1,
    alg: 'PBKDF2-SHA256/AES-256-GCM',
    iter: PBKDF2_ITERATIONS,
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(new Uint8Array(ct)),
    exp: Date.now() + ttlMs,
    slots: memory.size,
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(blob))
  emit()
}

/** 用口令解密暂存并恢复到内存。口令错误 / 密文被篡改 / 已过期均返回 false。 */
export async function unlock(passphrase: string): Promise<boolean> {
  if (typeof sessionStorage === 'undefined' || !passphrase) return false
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return false
  let blob: StoredBlob
  try {
    blob = JSON.parse(raw) as StoredBlob
  } catch {
    purge()
    return false
  }
  if (blob.v !== 1 || !blob.exp || Date.now() > blob.exp) {
    purge()
    return false
  }
  try {
    const key = await deriveKey(passphrase, fromB64(blob.salt), blob.iter || PBKDF2_ITERATIONS)
    const pt = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromB64(blob.iv) },
      key,
      fromB64(blob.ct),
    )
    const obj = JSON.parse(new TextDecoder().decode(pt)) as Record<string, unknown>
    const restored = new Map<string, string>()
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.length > 0) restored.set(k, v)
    }
    if (restored.size === 0) return false
    memory = restored
    installGuards()
    touch()
    emit()
    return true
  } catch {
    // AES-GCM 认证失败 = 口令错误或密文被改动，绝不放行
    return false
  }
}

export function state(): VaultState {
  let expiresAt: number | null = null
  if (typeof sessionStorage !== 'undefined') {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      try { expiresAt = (JSON.parse(raw) as StoredBlob).exp ?? null } catch { expiresAt = null }
    }
  }
  return {
    unlocked: memory.size > 0,
    persisted: hasPersisted(),
    slots: [...memory.keys()],
    expiresAt,
  }
}

/** 订阅状态变化，供 UI 刷新「已解锁 / 已锁定」提示。返回取消订阅函数。 */
export function subscribe(cb: (s: VaultState) => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** 不可逆的短指纹，仅用于 UI 展示「当前用的是哪把 key」，不含明文。 */
export async function fingerprint(slot: string = DEFAULT_SLOT): Promise<string | null> {
  const key = memory.get(slotOf(slot))
  if (!key) return null
  const digest = await subtle().digest('SHA-256', new TextEncoder().encode(key))
  return [...new Uint8Array(digest).slice(0, 4)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, FINGERPRINT_HEX)
}

/** 脱敏展示，如 sk-••••••••3f2a。用于任何需要「显示」密钥的场合。 */
export function mask(apiKey: string): string {
  const s = (apiKey || '').trim()
  if (!s) return ''
  if (s.length <= 8) return '••••••••'
  return `${s.slice(0, 3)}••••••••${s.slice(-4)}`
}

/* ------------------------------------------------------------------ */
/* 请求层安全工具                                                      */
/* ------------------------------------------------------------------ */

/**
 * 拒绝明文 HTTP 端点，防止 API Key 以明文过网。
 * localhost / 127.0.0.1 仅用于本地开发，放行。
 */
export function assertSecureEndpoint(url: string): string {
  const u = (url || '').trim()
  let parsed: URL
  try { parsed = new URL(u) } catch { throw new Error('API 地址不是合法的 URL') }
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  if (parsed.protocol !== 'https:' && !local) {
    throw new Error('安全策略：API 地址必须使用 HTTPS，禁止通过明文 HTTP 发送密钥。')
  }
  return u
}

/**
 * 生成 Authorization 头。只在发起请求的瞬间调用，不要缓存返回值到组件状态。
 */
export function authHeaders(handleOrSlot: string = DEFAULT_SLOT): Record<string, string> {
  const key = get(slotOf(handleOrSlot))
  if (!key) throw new Error('密钥已锁定，请在设置中重新输入 API Key。')
  return { Authorization: `Bearer ${key}` }
}

/**
 * 安全 fetch：强制 credentials: omit、referrerPolicy: no-referrer、
 * cache: no-store，避免密钥经 Referer / 缓存 / 第三方凭据链路外泄。
 */
export function secureFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(assertSecureEndpoint(url), {
    ...init,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  })
}

/**
 * 递归脱敏：导出、备份、日志、云同步、埋点之前一律调用，
 * 把任何名字像密钥的字段清空。返回新对象，不改动原对象。
 */
export function redact<T>(value: T): T {
  const SENSITIVE = /(apikey|api_key|passphrase|password|secret|token|pat|authorization|bearer)/i
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = SENSITIVE.test(k) ? '' : walk(val)
      }
      return out
    }
    return v
  }
  return walk(value) as T
}

/**
 * 挂载通用的「密钥保险库」控制面板（原生 DOM，不依赖任何框架），返回卸载函数。
 * 各站点只需准备一个空容器并调用本函数即可获得完整的锁定/解锁/暂存能力。
 * 全程使用 textContent 与 createElement，不拼接 HTML 字符串。
 */
export function mountVaultControls(host: HTMLElement, onChange?: () => void): () => void {
  const root = document.createElement('div')
  root.setAttribute('data-byok-vault', '')
  root.style.cssText = 'border:1px solid rgba(127,127,127,.35);border-radius:10px;padding:12px;margin:10px 0;font-size:12px;line-height:1.6;'

  const title = document.createElement('div')
  title.style.cssText = 'font-weight:600;margin-bottom:4px;'
  title.textContent = '密钥保护'

  const status = document.createElement('div')
  const hint = document.createElement('div')
  hint.style.cssText = 'opacity:.75;margin:6px 0;'
  hint.textContent = '默认零持久化：密钥只存在内存中，刷新或关闭页面即消失，绝不写入 localStorage。仅当你主动设置口令并点「会话内记住」时，才会以 AES-256-GCM 密文暂存于本标签页。'

  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;'
  const input = document.createElement('input')
  input.type = 'password'
  input.autocomplete = 'new-password'
  input.style.cssText = 'flex:1 1 150px;min-width:120px;padding:6px 8px;border:1px solid rgba(127,127,127,.4);border-radius:6px;background:transparent;color:inherit;font-size:12px;'

  const msg = document.createElement('div')
  msg.style.cssText = 'margin-top:6px;min-height:1em;'

  const btn = (label: string, fn: () => void): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.style.cssText = 'padding:6px 10px;border:1px solid rgba(127,127,127,.4);border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:12px;'
    b.addEventListener('click', fn)
    return b
  }

  const say = (text: string): void => { msg.textContent = text }

  const bRemember = btn('会话内记住', () => {
    void persist(input.value).then(() => {
      input.value = ''
      say('已加密暂存于本标签页。刷新后输入同一口令即可解锁；关闭标签页自动失效。')
    }).catch((e: unknown) => say(e instanceof Error ? e.message : '暂存失败'))
  })
  const bUnlock = btn('解锁', () => {
    void unlock(input.value).then((ok) => {
      input.value = ''
      say(ok ? '已解锁，密钥已恢复到内存。' : '口令错误、暂存已过期或密文被改动。')
      if (ok) onChange?.()
    })
  })
  const bLock = btn('立即锁定', () => { lock(); say('已锁定：内存中的密钥已清除。'); onChange?.() })
  const bPurge = btn('彻底清除', () => { purge(); say('已彻底清除：内存与加密暂存均已销毁。'); onChange?.() })
  row.append(input, bRemember, bUnlock, bLock, bPurge)
  root.append(title, status, hint, row, msg)
  host.replaceChildren(root)

  const render = (s: VaultState): void => {
    const until = s.expiresAt ? new Date(s.expiresAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
    if (s.unlocked) {
      status.textContent = `● 已解锁（${s.slots.length} 把密钥在内存中）${s.persisted ? ` · 已加密暂存至 ${until}` : ''}`
      status.style.color = '#2e9e6b'
    } else if (s.persisted) {
      status.textContent = `● 已锁定 · 存在加密暂存（至 ${until}），输入口令解锁`
      status.style.color = '#c08a2e'
    } else {
      status.textContent = '● 已锁定 · 无暂存，请重新输入 API Key'
      status.style.color = '#b45b5b'
    }
    input.placeholder = s.persisted && !s.unlocked ? '输入解锁口令' : '设置解锁口令（至少 8 位）'
    bRemember.style.display = s.unlocked ? '' : 'none'
    bUnlock.style.display = s.persisted && !s.unlocked ? '' : 'none'
    bLock.style.display = s.unlocked ? '' : 'none'
    bPurge.style.display = s.unlocked || s.persisted ? '' : 'none'
  }
  const unsub = subscribe(render)
  render(state())
  return () => { unsub(); root.remove() }
}

/** 便捷默认导出对象，便于在非模块环境里按需取用。 */
export const vault = {
  set, get, has, clearSlot, lock, purge, hasPersisted, persist, unlock,
  state, subscribe, fingerprint, mask, assertSecureEndpoint, authHeaders,
  secureFetch, redact, HANDLE_PREFIX, handleFor, isHandle, slotOf,
  mountVaultControls,
}

export default vault
