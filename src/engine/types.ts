/**
 * 引擎层与场景层的共享类型。
 * 场景层只通过 EngineAPI 读写，不直接碰这里的数据表。
 */

export type ItemType =
  | 'cloze_blank'
  | 'argument_label'
  | 'argument_option'
  | 'classical_card'
  | 'classical_production'
  | 'punctuation'
  | 'technique_card'
  | 'syntax_chunk'
  | 'model_probe'

export type Source = 'chinese_site' | 'manual'

export type Rating = 'again' | 'hard' | 'good' | 'easy'

export type ErrorTag =
  | 'concept'
  | 'method'
  | 'calculation'
  | 'misread'
  | 'recall_failure'
  | 'time_pressure'

export type Fallacy =
  | '偷换概念'
  | '以偏概全'
  | '强加因果'
  | '无中生有'
  | '绝对化'
  | '混淆充要'

export type StructureTag = '论点' | '论据' | '推理' | '让步' | '反驳' | '结论'

export const ERROR_TAGS: { value: ErrorTag; label: string; desc: string }[] = [
  { value: 'concept', label: '概念不清', desc: '定义没吃透就上场' },
  { value: 'method', label: '方法缺失', desc: '知道要做什么，但没有可用的方法' },
  { value: 'calculation', label: '粗心失误', desc: '会，但手上滑了（写错字、漏看限制）' },
  { value: 'misread', label: '审题偏差', desc: '答的不是问的' },
  { value: 'recall_failure', label: '提取失败', desc: '会，但当场想不起来' },
  { value: 'time_pressure', label: '时间压力', desc: '会做，但没做完' },
]

export const FALLACIES: Fallacy[] = [
  '偷换概念',
  '以偏概全',
  '强加因果',
  '无中生有',
  '绝对化',
  '混淆充要',
]

export const STRUCTURE_TAGS: StructureTag[] = ['论点', '论据', '推理', '让步', '反驳', '结论']

export const MASTERY_LABELS = ['未接触', '初识', '会用', '熟练', '自动'] as const
export const MASTERY_LABELS_DESC = [
  '还没有作答记录',
  '见过、能认出，但不能独立使用',
  '标准情境下能独立使用',
  '换壳情境仍能识别和使用（达标线）',
  '接近反射，可迁移讲解',
] as const

/** ts-fsrs v6 卡片里我们实际依赖的字段。 */
export interface FsrsCard {
  cardId: string
  dueAt: string
  lastReviewAt: string | null
  stability: number
  difficulty: number
  state: number
  reps: number
  lapses: number
  scheduledDays: number
  learningStep: number
  scheduleStatus: string
}

export interface ItemContent {
  /** 题组标题（今日队列用） */
  title?: string
  subtitle?: string
  /** 题组内顺序 */
  order?: number
  /** 场景层自定义字段 */
  [key: string]: unknown
}

export interface Item {
  item_id: string
  user_id: string
  source: Source
  item_type: ItemType
  model_tag: string
  content: ItemContent
  status: 'active' | 'suspended' | 'mastered'
  created_at: string
  first_review_at: string | null
  /** 同一题组（一段文本 / 一个牌组） */
  group_id: string
  /** 同构 1 / 换壳 2 / 综合 3 */
  variant_level: 1 | 2 | 3
  /** 48 小时重测等产品规则，不参与 FSRS 间隔计算 */
  available_at?: string | null
  retest_of?: string
  fsrs: FsrsCard | null
}

export interface Review {
  review_id: string
  item_id: string
  model_tag: string
  variant_level: 1 | 2 | 3
  timestamp: string
  rating: Rating
  correct: boolean
  confidence: number
  error_tag: ErrorTag | null
  time_spent: number
  /** 用户答案快照，便于隔日打标时看到当时写了什么 */
  answer?: string
  fsrs_state: FsrsCard | null
}

export interface ModelRecord {
  model_tag: string
  domain: string
  name: string
  mastery_level: number
  variant_streak: number
  /** 本轮连对里已经计过数的条目，防止同一道题刷连对 */
  streak_items?: string[]
  acc_last10: number | null
  calib_bias: number | null
  variant_level: 1 | 2 | 3
  updated_at: string
  last_review_at: string | null
}

export interface ModelDef {
  tag: string
  name: string
  domain: string
  definition: string
  keyPoints: string[]
  commonErrors: string[]
}

export interface AISettings {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
}

export interface Settings {
  newItemCap: number
  dailyCap: number
  desiredRetention: number
  ai: AISettings
}

export interface Annotation {
  id: string
  reading_id: string
  text: string
  created_at: string
}

export interface MasteryEvent {
  tag: string
  name: string
  from: number
  to: number
  at: string
}

export interface Draft {
  id: string
  prompt_id: string
  body: string
  created_at: string
  diagnosis: unknown | null
}

/** 每天一条“日课”：一字、一象、一技 + 自己写的一句。 */
export interface DailyEntry {
  date: string
  word_id: string
  imagery_id: string
  technique_id: string
  note: string
  created_at: string
  ai_comment?: string
  ai_focus?: string
  ai_at?: string
}

/** AI 深度诊断的落库快照；没有 AI 时页面用本地规则生成。 */
export interface CoachReport {
  id: string
  created_at: string
  overall: number | null
  summary: string
  strengths: string[]
  gaps: string[]
  actions: string[]
  data_note: string
  ai: boolean
}

export interface DB {
  version: 1
  seed_version: number
  user: { id: string; name: string; created_at: string }
  items: Record<string, Item>
  reviews: Review[]
  models: Record<string, ModelRecord>
  settings: Settings
  annotations: Annotation[]
  drafts: Draft[]
  mastery_events: MasteryEvent[]
  daily: DailyEntry[]
  coach_reports: CoachReport[]
  last_group: string | null
}

export interface QueueGroup {
  group_id: string
  title: string
  subtitle: string
  kind: ItemType
  items: Item[]
  due_count: number
  new_count: number
  /** 组内是否有逾期 3 天以上的条目 */
  urgent: boolean
}

export interface Queue {
  now: string
  read_only: boolean
  night: boolean
  due: QueueGroup[]
  fresh: QueueGroup[]
  total_due: number
  total_fresh: number
  completed_today: number
  planned: number
  skipped_variants: number
}

export interface ReviewResult {
  next_due: string
  mastery_change: string
  level_before: number
  level_after: number
  streak: number
  bias: number | null
}

export interface CalibrationBin {
  label: string
  low: number
  high: number
  n: number
  accuracy: number | null
}

export interface ModelStat {
  model_tag: string
  name: string
  n: number
  accuracy: number
  mean_confidence: number
  bias: number
  level: number
  last_review_at: string | null
}

export interface ErrorFingerprint {
  tag: ErrorTag
  label: string
  count: number
  share: number
}

export interface WeeklyReport {
  from: string
  to: string
  days_studied: number
  minutes: number
  accuracy: number | null
  reviews: number
  calib_abs_before: number | null
  calib_abs_now: number | null
  mastered_models: number
  level_ups: { name: string; from: number; to: number }[]
  top_errors: ErrorFingerprint[]
  suggestions: string[]
  four_signals: { label: string; value: string; ok: boolean | null }[]
}
