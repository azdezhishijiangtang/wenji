/**
 * 浏览器兼容层 · Browser Compatibility Layer
 * ===================================================================
 * 目标：让 AI 接口在尽可能多的浏览器与系统上都能正常调用 ——
 * iOS Safari（含旧版）、各版本 Android WebView、鸿蒙/国产内核、桌面浏览器。
 *
 * 原则：只做「特性检测」（Web API 是否存在），绝不解析 UA。
 * 国产/定制内核的 UA 千变万化，白名单必然误伤；按 API 判断才覆盖未知内核。
 *
 * 覆盖的断点：
 *  1. ReadableStream / Response.body.getReader 缺失（iOS Safari < 14.1、
 *     部分定制 WebView）→ 流式不可用，改为一次性读回后解析 SSE 或完整 JSON。
 *  2. TextDecoder 缺失 → UTF-8 兜底解码。
 *  3. fetch 缺失（极老内核）→ XHR 兜底；AbortController 缺失 → 剥离 signal
 *     并补一个不依赖 AbortController 的超时保护。
 *  4. localStorage / sessionStorage 在隐私模式下抛异常 → 安全包装。
 *  5. Web Crypto 不完整 → 仅影响「会话内记住/口令解锁」，不影响直接填 Key 使用。
 *  6. 构建产物统一降到 ES2018（见 vite.config.ts 的 build.target）。
 *
 * 注意：本层不处理「服务商确实未放行 CORS」「网络被屏蔽」「HTTPS 页面调 HTTP」
 * 这三类浏览器安全策略限制 —— 它们无法由前端代码绕过，只能在错误提示里说明。
 */

/* ------------------------------------------------------------------ */
/* 能力检测（记录原生支持情况，polyfill 不改变这些值）                    */
/* ------------------------------------------------------------------ */

const g = globalThis as typeof globalThis & { crypto?: Crypto }

export const caps = {
  fetch: typeof fetch === 'function',
  xhr: typeof XMLHttpRequest !== 'undefined',
  abort: typeof AbortController !== 'undefined',
  readableStream: typeof ReadableStream !== 'undefined',
  textDecoder: typeof TextDecoder !== 'undefined',
  response: typeof Response !== 'undefined',
  subtle: !!g.crypto && !!g.crypto.subtle,
}

/* ------------------------------------------------------------------ */
/* AbortController 兜底：老内核没有该构造器，直接 new 会抛 TypeError      */
/* ------------------------------------------------------------------ */

if (!caps.abort) {
  class LegacyAbortSignal {
    aborted = false
    reason: unknown = undefined
    onabort: (() => void) | null = null
    addEventListener(): void { /* no-op */ }
    removeEventListener(): void { /* no-op */ }
    dispatchEvent(): boolean { return false }
    throwIfAborted(): void { /* no-op */ }
  }
  class LegacyAbortController {
    signal = new LegacyAbortSignal()
    abort(reason?: unknown): void {
      if (this.signal.aborted) return
      this.signal.aborted = true
      this.signal.reason = reason
      if (typeof this.signal.onabort === 'function') {
        try { this.signal.onabort() } catch { /* 订阅者异常不应影响中止流程 */ }
      }
    }
  }
  Object.defineProperty(globalThis, 'AbortController', {
    value: LegacyAbortController,
    configurable: true,
    writable: true,
  })
}

/* ------------------------------------------------------------------ */
/* 响应读取                                                            */
/* ------------------------------------------------------------------ */

/** 判断某个响应能否按流读取。部分内核有 body 但没有 getReader。 */
export function canReadStream(res: Response): boolean {
  if (!caps.readableStream || !caps.textDecoder) return false
  const body = res?.body as ReadableStream<Uint8Array> | null | undefined
  return !!body && typeof body.getReader === 'function'
}

/** TextDecoder 缺失时的 UTF-8 兜底解码（含 4 字节字符与代理对） */
export function decodeUtf8(bytes: Uint8Array): string {
  if (caps.textDecoder) return new TextDecoder().decode(bytes)
  let out = ''
  let i = 0
  while (i < bytes.length) {
    const b = bytes[i]
    if (b < 0x80) { out += String.fromCharCode(b); i += 1; continue }
    let n = 0
    let cp = 0
    if (b >= 0xc0 && b < 0xe0) { n = 2; cp = b & 0x1f }
    else if (b >= 0xe0 && b < 0xf0) { n = 3; cp = b & 0x0f }
    else if (b >= 0xf0 && b < 0xf8) { n = 4; cp = b & 0x07 }
    else { out += '\ufffd'; i += 1; continue }
    if (i + n > bytes.length) { out += '\ufffd'; break }
    for (let k = 1; k < n; k += 1) cp = (cp << 6) | (bytes[i + k] & 0x3f)
    i += n
    if (cp > 0xffff) {
      cp -= 0x10000
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff))
    } else {
      out += String.fromCharCode(cp)
    }
  }
  return out
}

/** 安全读取完整响应文本（兼容 XHR 兜底返回的伪 Response） */
export async function readResponseText(res: Response): Promise<string> {
  if (typeof res.text === 'function') {
    try { return await res.text() } catch { /* 继续走兜底字段 */ }
  }
  return (res as Response & { _compatText?: string })._compatText ?? ''
}

/**
 * 从完整响应文本中提取可供 JSON.parse 的载荷。
 * 兼容三种情况：标准 SSE 文本、CRLF 换行、服务商忽略 stream 参数直接返回完整 JSON。
 */
export function parsePayloads(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return [trimmed]
  const out: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (data && data !== '[DONE]') out.push(data)
  }
  return out
}

/* ------------------------------------------------------------------ */
/* 安全存储：隐私模式 / 容量超限 / 安全策略下访问不抛异常                  */
/* ------------------------------------------------------------------ */

export interface SafeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function safeStorage(kind: 'local' | 'session'): SafeStorage {
  let store: Storage | null = null
  try {
    const candidate = kind === 'local' ? localStorage : sessionStorage
    // 真实读写一次：iOS 无痕模式下 getItem 可用但 setItem 会抛 QuotaExceededError
    const probe = '__compat_probe__'
    candidate.setItem(probe, '1')
    candidate.removeItem(probe)
    store = candidate
  } catch { store = null }
  return {
    getItem: (key) => { try { return store?.getItem(key) ?? null } catch { return null } },
    setItem: (key, value) => { try { store?.setItem(key, value) } catch { /* 隐私模式下静默降级为内存态 */ } },
    removeItem: (key) => { try { store?.removeItem(key) } catch { /* 同上 */ } },
  }
}

export const safeLocal = safeStorage('local')
export const safeSession = safeStorage('session')

/* ------------------------------------------------------------------ */
/* fetch 兜底                                                          */
/* ------------------------------------------------------------------ */

/** 极老内核没有 fetch 时用 XHR 返回一个「只实现本项目所需接口」的 Response 兼容对象 */
export function legacyFetch(url: string, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (!caps.xhr) {
      reject(new Error('当前浏览器缺少 fetch 与 XMLHttpRequest，无法发起网络请求，请升级系统浏览器后重试。'))
      return
    }
    try {
      const xhr = new XMLHttpRequest()
      xhr.open((init.method as string) || 'GET', url, true)
      const headers = init.headers as Record<string, string> | undefined
      if (headers && typeof headers === 'object') {
        for (const key of Object.keys(headers)) {
          try { xhr.setRequestHeader(key, headers[key]) } catch { /* 禁止设置的头直接跳过 */ }
        }
      }
      xhr.timeout = 45000
      xhr.onload = () => {
        const text = xhr.responseText || ''
        const fake = {
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          statusText: xhr.statusText,
          body: null,
          headers: { get: (name: string) => xhr.getResponseHeader(name) },
          json: () => Promise.resolve(JSON.parse(text)),
          text: () => Promise.resolve(text),
          clone: function () { return this },
          _compatText: text,
        } as unknown as Response
        resolve(fake)
      }
      xhr.onerror = () => reject(new Error('网络请求失败：请检查接口地址、网络，以及服务商是否允许浏览器跨域（CORS）。'))
      xhr.ontimeout = () => reject(new Error('连接超时（45 秒）：请检查接口地址与网络。'))
      xhr.send((init.body as string | null | undefined) ?? null)
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

/** 供设置页/错误提示展示当前环境能力，便于远程定位问题 */
export function describeEnvironment(): string {
  const list = [
    `fetch=${caps.fetch ? 'yes' : 'no'}`,
    `stream=${caps.readableStream ? 'yes' : 'no'}`,
    `textDecoder=${caps.textDecoder ? 'yes' : 'no'}`,
    `abort=${caps.abort ? 'yes' : 'no'}`,
    `webCrypto=${caps.subtle ? 'yes' : 'no'}`,
  ]
  return list.join(' · ')
}
