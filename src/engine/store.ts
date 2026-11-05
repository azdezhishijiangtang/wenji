import type {
  AccumulationCard,
  CalibrationBin,
  CoachReport,
  DailyEntry,
  DB,
  ErrorFingerprint,
  ExamRecord,
  Item,
  ModelRecord,
  ModelStat,
  Queue,
  Rating,
  Review,
  ReviewResult,
  Settings,
  WeeklyReport,
} from './types'
import { ERROR_TAGS } from './types'
import { buildQueue } from './queue'
import { applyMastery, emptyModel } from './mastery'
import { initScheduler, reviewCard } from './fsrs'
import { biasOf, calibrationBins, calibratedModels, computeStreak, errorFingerprint, modelStats, weeklyReport } from './analytics'
import { addDays, dayKey, daysAgoIso, nowIso, startOfDay, uid } from './util'
import { buildSeedDB, DEFAULT_SETTINGS, LOCAL_USER_ID, SEED_VERSION } from '../content/seed'
import { MODEL_MAP } from '../content/models'
import { vault } from './byokVault'
import {
  buildAbilityProfile,
  dailyStreak,
  getDailyEntry,
  todayStats,
  type AbilityProfile,
  type TodayStats,
} from './diagnosis'

const KEY = 'wenyi.db.v1'

let db: DB | null = null
let version = 0
let initialized = false
const listeners = new Set<() => void>()

function emit() {
  version += 1
  for (const fn of listeners) fn()
}

function persist() {
  if (!db) return
  try {
    // 安全策略：密钥绝不落盘。运行时只保留句柄，写盘时把任何非句柄的明文清空。
    const ai = db.settings.ai
    const safe = {
      ...db,
      settings: {
        ...db.settings,
        ai: { ...ai, apiKey: vault.isHandle(ai.apiKey) ? ai.apiKey : '' },
      },
    }
    localStorage.setItem(KEY, JSON.stringify(safe))
  } catch {
    // 隐私模式或 file:// 下 localStorage 可能不可写：保留内存态，不阻断训练
  }
}

function fallbackDef(tag: string) {
  return {
    tag,
    name: tag,
    domain: '语文',
    definition: '未登记模型',
    keyPoints: [],
    commonErrors: [],
  }
}

function normalizeDB(input: DB): DB {
  const seed = buildSeedDB()
  const out: DB = {
    ...seed,
    ...input,
    version: 1,
    user: { ...seed.user, ...(input.user ?? {}) },
    settings: {
      ...DEFAULT_SETTINGS,
      ...(input.settings ?? {}),
      ai: { ...DEFAULT_SETTINGS.ai, ...(input.settings?.ai ?? {}) },
    },
    items: { ...seed.items, ...(input.items ?? {}) },
    models: { ...seed.models, ...(input.models ?? {}) },
    reviews: Array.isArray(input.reviews) ? input.reviews : [],
    annotations: Array.isArray(input.annotations) ? input.annotations : [],
    drafts: Array.isArray(input.drafts) ? input.drafts : [],
    mastery_events: Array.isArray(input.mastery_events) ? input.mastery_events : [],
    daily: Array.isArray(input.daily) ? input.daily : [],
    coach_reports: Array.isArray(input.coach_reports) ? input.coach_reports : [],
    exams: Array.isArray(input.exams) ? input.exams : [],
    accumulations: Array.isArray(input.accumulations) ? input.accumulations : [],
    last_group: input.last_group ?? null,
  }
  // 内容更新后，新条目补进来；旧条目的学习状态保留
  if (input.seed_version !== SEED_VERSION) out.seed_version = SEED_VERSION
  return out
}

function load(): DB {
  if (db) return db
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DB
      if (parsed && parsed.version === 1) {
        db = normalizeDB(parsed)
        // 升级迁移：旧版明文密钥搬进内存保险库，并立即覆写磁盘抹掉明文
        const legacy = parsed.settings?.ai?.apiKey
        if (typeof legacy === 'string' && legacy.length > 0 && !vault.isHandle(legacy)) {
          vault.set('ai', legacy)
          db.settings.ai.apiKey = vault.handleFor('ai')
          persist()
        }
        return db
      }
    }
  } catch {
    // 损坏就重建，学习记录在导出文件里另存
  }
  db = buildSeedDB()
  persist()
  return db
}

export function getDB(): DB {
  return load()
}

export function getVersion(): number {
  return version
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function initEngine(): Promise<void> {
  const data = load()
  await initScheduler(data.settings.desiredRetention)
  initialized = true
}

export function engineReady(): boolean {
  return initialized
}

export function getQueue(now = new Date()): Queue {
  const data = load()
  return buildQueue({
    items: Object.values(data.items),
    reviews: data.reviews,
    models: data.models,
    settings: data.settings,
    now,
  })
}

function autoRating(correct: boolean, confidence: number, seconds: number): Rating {
  if (!correct) return 'again'
  if (confidence <= 30 && seconds > 25) return 'hard'
  if (confidence >= 70 && seconds <= 20) return 'easy'
  return 'good'
}

export interface SubmitInput {
  itemId: string
  correct: boolean
  confidence: number
  timeSpent: number
  answer?: string
  rating?: Rating
}

export interface SubmitOutput extends ReviewResult {
  review_id: string
  rating: Rating
}

/**
 * 唯一写入口：写 reviews（只增）、推进 FSRS、更新 models、记升档事件。
 * 场景层不接触这三张表的写逻辑。
 */
export function submitReview(input: SubmitInput, now = new Date()): SubmitOutput {
  const data = load()
  const item = data.items[input.itemId]
  if (!item) throw new Error('条目不存在')
  if (!initialized) throw new Error('引擎尚未初始化')

  const def = MODEL_MAP.get(item.model_tag) ?? fallbackDef(item.model_tag)
  const beforeRecord: ModelRecord = data.models[item.model_tag] ?? emptyModel(def)
  const prior = data.reviews.filter((r) => r.model_tag === item.model_tag)
  const prior30 = prior.filter((r) => r.timestamp >= daysAgoIso(30, now))
  const bias = biasOf(prior30).bias

  const confidence = Math.max(0, Math.min(100, Math.round(input.confidence)))
  const rating = input.rating ?? autoRating(input.correct, confidence, input.timeSpent)
  const fsrs = reviewCard(item.fsrs, rating, now)

  const review: Review = {
    review_id: uid('rv'),
    item_id: item.item_id,
    model_tag: item.model_tag,
    variant_level: item.variant_level,
    timestamp: now.toISOString(),
    rating,
    correct: input.correct,
    confidence,
    error_tag: null,
    time_spent: Math.max(0, Math.round(input.timeSpent)),
    answer: input.answer,
    fsrs_state: fsrs,
  }
  data.reviews.push(review)

  item.fsrs = fsrs
  if (!item.first_review_at) item.first_review_at = review.timestamp

  // T1 的错空延迟 48 小时再回队。FSRS 仍照常记状态，这里只加一道产品门：
  // 不伪造“不同挖空位”，但至少不让刚错的空在当天被反复刷到。
  if (input.correct) {
    item.available_at = null
  } else if (item.item_type === 'cloze_blank') {
    item.available_at = addDays(now, 2).toISOString()
  }

  const outcome = applyMastery(beforeRecord, {
    correct: input.correct,
    itemId: item.item_id,
    variantLevel: item.variant_level,
    bias,
  })

  const after30 = data.reviews.filter(
    (r) => r.model_tag === item.model_tag && r.timestamp >= daysAgoIso(30, now),
  )
  outcome.record.calib_bias = biasOf(after30).bias
  const last10 = prior.slice(-9).concat(review)
  outcome.record.acc_last10 = last10.length
    ? last10.filter((r) => r.correct).length / last10.length
    : null
  data.models[item.model_tag] = outcome.record

  if (outcome.level_after > outcome.level_before) {
    data.mastery_events.push({
      tag: item.model_tag,
      name: outcome.record.name,
      from: outcome.level_before,
      to: outcome.level_after,
      at: review.timestamp,
    })
  }

  persist()
  emit()

  return {
    review_id: review.review_id,
    rating,
    next_due: fsrs.dueAt,
    mastery_change: outcome.change,
    level_before: outcome.level_before,
    level_after: outcome.level_after,
    streak: outcome.record.variant_streak,
    bias: outcome.record.calib_bias,
  }
}

/** 隔日打标：只允许给“今天之前”的错题补错因（冷静期）。 */
export function setErrorTag(reviewId: string, tag: Review['error_tag']): boolean {
  const data = load()
  if (!tag || !ERROR_TAGS.some((t) => t.value === tag)) return false
  const review = data.reviews.find((r) => r.review_id === reviewId)
  if (!review || review.correct) return false
  if (review.timestamp >= startOfDay(new Date()).toISOString()) return false
  review.error_tag = tag
  persist()
  emit()
  return true
}

export function pendingErrorTags(now = new Date()): { review: Review; item: Item }[] {
  const data = load()
  const cutoff = startOfDay(now).toISOString()
  return data.reviews
    .filter((r) => !r.correct && !r.error_tag && r.timestamp < cutoff)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .map((review) => ({ review, item: data.items[review.item_id] }))
    .filter((x): x is { review: Review; item: Item } => Boolean(x.item))
}

export function getCalibration(now = new Date()): {
  bins: CalibrationBin[]
  stats: ModelStat[]
  over: ModelStat[]
  under: ModelStat[]
  bias: number | null
  streak: number
} {
  const data = load()
  const stats = modelStats(data.models, data.reviews, now)
  return {
    bins: calibrationBins(data.reviews, now),
    stats,
    over: calibratedModels(stats, 'over'),
    under: calibratedModels(stats, 'under'),
    bias: biasOf(data.reviews.filter((r) => r.timestamp >= daysAgoIso(30, now))).bias,
    streak: computeStreak(data.reviews, now),
  }
}

export function getErrorFingerprint(now = new Date()): ErrorFingerprint[] {
  return errorFingerprint(load().reviews, now)
}

export function getWeekly(now = new Date()): WeeklyReport {
  const data = load()
  return weeklyReport(
    { reviews: data.reviews, models: data.models, mastery_events: data.mastery_events },
    now,
  )
}

export function updateSettings(patch: Partial<Settings>): Promise<void> {
  const data = load()
  const ai = { ...data.settings.ai, ...(patch.ai ?? {}) }
  // 任何传入的明文密钥都先送进内存保险库，运行时只留句柄
  if (typeof ai.apiKey === 'string' && ai.apiKey.length > 0 && !vault.isHandle(ai.apiKey)) {
    vault.set('ai', ai.apiKey)
    ai.apiKey = vault.handleFor('ai')
  }
  data.settings = {
    ...data.settings,
    ...patch,
    ai,
  }
  persist()
  emit()
  return initScheduler(data.settings.desiredRetention)
}

export function addAnnotation(readingId: string, text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 10) return false
  const data = load()
  data.annotations.push({
    id: uid('an'),
    reading_id: readingId,
    text: trimmed,
    created_at: nowIso(),
  })
  persist()
  emit()
  return true
}

export function getAnimationsFor(readingId: string) {
  return load().annotations.filter((a) => a.reading_id === readingId)
}

export function saveDraft(promptId: string, body: string, diagnosis: unknown): string {
  const data = load()
  const draft = {
    id: uid('dr'),
    prompt_id: promptId,
    body,
    created_at: nowIso(),
    diagnosis,
  }
  data.drafts.push(draft)
  persist()
  emit()
  return draft.id
}

export function getDrafts(promptId: string) {
  return load().drafts.filter((d) => d.prompt_id === promptId)
}

export function setLastGroup(groupId: string | null) {
  const data = load()
  data.last_group = groupId
  persist()
}

export function exportJSON(): string {
  // 备份会离开这台设备：默认抹掉 API Key，避免把凭据写进网盘或聊天记录。
  const copy = JSON.parse(JSON.stringify(load())) as DB
  copy.settings.ai.apiKey = ''
  return JSON.stringify(copy, null, 2)
}

export async function importJSON(raw: string): Promise<void> {
  const parsed = JSON.parse(raw) as DB
  if (!parsed || parsed.version !== 1 || !parsed.items || !parsed.models) {
    throw new Error('不是有效的文几备份文件')
  }
  db = normalizeDB(parsed)
  // 备份文件不允许夹带密钥：一律丢弃，需用户在设置页重新输入
  db.settings.ai.apiKey = ''
  // 备份的 desiredRetention 可能与当前调度器不同：导入后必须重建 FSRS，
  // 否则界面显示新参数、实际间隔仍按旧参数计算（与 initEngine/updateSettings 对齐）。
  await initScheduler(db.settings.desiredRetention)
  persist()
  emit()
}

export function resetLearning(): void {
  const data = load()
  data.reviews = []
  data.mastery_events = []
  data.items = buildSeedDB().items
  data.models = buildSeedDB().models
  data.last_group = null
  persist()
  emit()
}

export function resetAll(): void {
  db = buildSeedDB()
  persist()
  emit()
}

export function deleteEverything(): void {
  db = buildSeedDB()
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  // 不 persist：本函数的语义是“删除本机全部数据”，persist 会立刻把种子库
  // 写回存储，让删除变成空操作（与 resetAll 无异）。内存里保留种子库只为
  // 页面不崩；下次刷新 load() 找不到存档，会重新落盘一份全新出厂状态。
  emit()
}

export function userName(): string {
  return load().user.name || '你'
}

/** 变式入库：AI 生成 + 人工确认后的条目才允许走这里。 */
export function addVariantItems(items: Item[]): number {
  const data = load()
  let added = 0
  for (const item of items) {
    if (data.items[item.item_id]) continue
    data.items[item.item_id] = item
    added += 1
  }
  if (added) {
    persist()
    emit()
  }
  return added
}

/* ================= 限时抽样卷 ================= */

export function startExam(itemIds: string[], now = new Date()): ExamRecord | 'active-exists' {
  const data = load()
  if (data.exams.some((e) => e.finished_at == null)) return 'active-exists'
  const exam: ExamRecord = {
    id: uid('ex'),
    created_at: now.toISOString(),
    item_ids: itemIds,
    started_at: now.toISOString(),
    finished_at: null,
    score: null,
  }
  data.exams.push(exam)
  data.exams = data.exams.slice(-20)
  persist()
  emit()
  return exam
}

export function activeExam(): ExamRecord | null {
  return load().exams.find((e) => e.finished_at == null) ?? null
}

export function discardExam(id: string): boolean {
  const data = load()
  const exam = data.exams.find((e) => e.id === id)
  if (!exam || exam.finished_at) return false
  exam.finished_at = nowIso()
  exam.score = { answered: 0, correct: 0 }
  persist()
  emit()
  return true
}

export function finishExam(id: string, now = new Date()): ExamRecord | null {
  const data = load()
  const exam = data.exams.find((e) => e.id === id)
  if (!exam || exam.finished_at) return null
  // 同一条目多次作答取最后一次；只认开卷之后的作答
  const relevant = data.reviews
    .filter((r) => exam.item_ids.includes(r.item_id) && r.timestamp >= exam.started_at)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const perItem = new Map<string, boolean>()
  for (const r of relevant) perItem.set(r.item_id, r.correct)
  exam.score = {
    answered: perItem.size,
    correct: [...perItem.values()].filter(Boolean).length,
  }
  exam.finished_at = now.toISOString()
  persist()
  emit()
  return exam
}

/* ================= 积累簿转化卡 ================= */

export function dueAccumulations(now = new Date()): AccumulationCard[] {
  const key = dayKey(now)
  return load().accumulations
    .filter((a) => a.source_date !== key)
    .filter((a) => !a.fsrs || new Date(a.fsrs.dueAt).getTime() <= now.getTime())
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export function reviewAccumulation(
  id: string,
  mode: AccumulationCard['history'][number]['mode'],
  text: string,
  now = new Date(),
): boolean {
  const data = load()
  const card = data.accumulations.find((a) => a.id === id)
  const clean = text.trim()
  if (!card || clean.length < 4) return false
  card.history.push({ at: now.toISOString(), mode, text: clean })
  card.fsrs = reviewCard(card.fsrs, 'good', now)
  persist()
  emit()
  return true
}

export function userId(): string {
  return load().user.id || LOCAL_USER_ID
}

export function updateUserName(name: string): void {
  const clean = name.trim().slice(0, 24)
  if (!clean) return
  const current = load()
  current.user.name = clean
  persist()
  emit()
}


/* ---------- 日课与能力诊断 ---------- */

export function getAbilityProfile(now = new Date()): AbilityProfile {
  return buildAbilityProfile(load(), now)
}

export function getTodayStats(now = new Date()): TodayStats {
  return todayStats(load(), now)
}

export function getDaily(now = new Date()): DailyEntry | null {
  return getDailyEntry(load(), now)
}

export function getDailyStreak(now = new Date()): number {
  return dailyStreak(load(), now)
}

export function getDailyHistory(): DailyEntry[] {
  return load().daily.slice().sort((a, b) => b.date.localeCompare(a.date))
}

export interface SaveDailyInput {
  date: string
  word_id: string
  imagery_id: string
  technique_id: string
  note: string
}

/** 日课只认“写出来的一句”，不认点开看过。 */
export function saveDaily(input: SaveDailyInput): boolean {
  const note = input.note.trim()
  if (note.length < 10) return false
  const data = load()
  const existing = data.daily.find((d) => d.date === input.date)
  if (existing) {
    existing.note = note
    existing.word_id = input.word_id
    existing.imagery_id = input.imagery_id
    existing.technique_id = input.technique_id
  } else {
    data.daily.push({
      date: input.date,
      word_id: input.word_id,
      imagery_id: input.imagery_id,
      technique_id: input.technique_id,
      note,
      created_at: nowIso(),
    })
  }
  // 积累簿转化卡：当天首次写下句子时建卡（快照），约 3 天后进入回看队列。
  // 之后编辑日课不影响此卡——转化的对象是“当时写下的那句话”。
  if (!data.accumulations.some((a) => a.source_date === input.date)) {
    const base = new Date()
    const card: AccumulationCard = {
      id: uid('acc'),
      source_date: input.date,
      text: note,
      created_at: nowIso(),
      // 用“3 天后的首次复习”初始化 FSRS，让转化回看天然错开今天
      fsrs: reviewCard(null, 'hard', new Date(base.getTime() + 3 * 86400000)),
      history: [],
    }
    data.accumulations.push(card)
  }
  persist()
  emit()
  return true
}

export function setDailyAI(date: string, comment: string, focus: string): boolean {
  const data = load()
  const entry = data.daily.find((d) => d.date === date)
  if (!entry) return false
  entry.ai_comment = comment
  entry.ai_focus = focus
  entry.ai_at = nowIso()
  persist()
  emit()
  return true
}

export function saveCoachReport(report: Omit<CoachReport, 'id' | 'created_at'>): CoachReport {
  const data = load()
  const full: CoachReport = { ...report, id: uid('cr'), created_at: nowIso() }
  data.coach_reports.push(full)
  data.coach_reports = data.coach_reports.slice(-10)
  persist()
  emit()
  return full
}

export function getCoachReports(): CoachReport[] {
  return load().coach_reports.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))
}
