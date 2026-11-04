import type { DB, Item, Review } from './types'
import { MASTERY_LABELS } from './types'
import { biasOf, withinDays } from './analytics'
import { dayKey, daysAgoIso, startOfDay } from './util'
import { IMAGERY, TECHNIQUES, READINGS } from '../content/appreciation'
import { CLASSICAL_ENTRIES } from '../content/classical'
import { CLOZE_TEXTS } from '../content/cloze'
import { ARGUMENT_PASSAGES } from '../content/argument'
import { PUNCTUATION_SENTENCES, SYNTAX_SENTENCES } from '../content/syntax'
import { MODEL_MAP as MODEL_DEFS } from '../content/models'
import type { DailyEntry } from './types'

export type AbilityKey = 'cloze' | 'argument' | 'classical' | 'writing' | 'appreciation' | 'syntax'

export interface AbilityMeta {
  key: AbilityKey
  name: string
  prefix: string
  ability: string
  /** 写作没有客观判分，只做过程记录，不折算成能力分。 */
  scored: boolean
}

export const ABILITIES: AbilityMeta[] = [
  {
    key: 'cloze',
    name: '语义分辨',
    prefix: 'cloze.',
    ability: '词义边界、语气、范围与预设',
    scored: true,
  },
  {
    key: 'argument',
    name: '篇章逻辑',
    prefix: 'argument.',
    ability: '句间关系、论证链与结构重组',
    scored: true,
  },
  {
    key: 'classical',
    name: '文言积累',
    prefix: 'classical.',
    ability: '虚词、实词、语境义与回译',
    scored: true,
  },
  {
    key: 'syntax',
    name: '句法控制',
    prefix: 'syntax.',
    ability: '主干、层次、文言断句依据',
    scored: true,
  },
  {
    key: 'appreciation',
    name: '文本感受',
    prefix: 'appreciation.',
    ability: '手法、意象、精读批注',
    scored: true,
  },
  {
    key: 'writing',
    name: '表达转化',
    prefix: 'writing.',
    ability: '观点—论据—推理的显性组织',
    scored: false,
  },
]

export interface AbilityDimension {
  key: AbilityKey
  name: string
  ability: string
  scored: boolean
  models_total: number
  models_touched: number
  coverage: number
  mastery_avg: number
  reviews_30: number
  accuracy_30: number | null
  bias_30: number | null
  trend: number | null
  evidence: number
  practice: number
  index: number | null
  label: string
  lowest_model: string | null
}

export interface AbilityProfile {
  dimensions: AbilityDimension[]
  overall_index: number | null
  overall_label: string
  total_models: number
  touched_models: number
  coverage: number
  reviews_30: number
  accuracy_30: number | null
  bias_30: number | null
  scored_dimensions: number
  evidence_confidence: 'low' | 'medium' | 'high'
  strongest: AbilityDimension | null
  weakest: AbilityDimension | null
  focus: AbilityDimension | null
  generated_at: string
}

export interface TodayStats {
  done: number
  correct: number
  accuracy: number | null
  minutes: number
  models_touched: number
  new_items: number
  drafts: number
  annotations: number
  note: string
  has_note: boolean
}

export interface DailyPicks {
  word: (typeof CLASSICAL_ENTRIES)[number]
  imagery: (typeof IMAGERY)[number]
  technique: (typeof TECHNIQUES)[number]
}

/** 基本功不另开维度，而是并入它训练的那项根本能力。 */
const FOUNDATION_ABILITY: Record<string, AbilityKey> = {
  'foundation.semantic': 'cloze',
  'foundation.coherence': 'argument',
}

export function abilityOf(tag: string): AbilityKey | null {
  const mapped = FOUNDATION_ABILITY[tag]
  if (mapped) return mapped
  const hit = ABILITIES.find((a) => tag.startsWith(a.prefix))
  return hit?.key ?? null
}

function modelInAbility(tag: string, key: AbilityKey): boolean {
  return abilityOf(tag) === key
}

function pct(n: number) {
  return Math.round(n * 100)
}

function labelFor(index: number | null, scored: boolean): string {
  if (!scored) return '过程记录'
  if (index == null) return '证据不足'
  if (index < 25) return '未形成'
  if (index < 45) return '起步'
  if (index < 65) return '形成中'
  if (index < 80) return '较稳定'
  return '稳定'
}

function avg(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}

/**
 * 能力指数不是考试分数，而是“当前可验证的行为证据”的压缩：
 * 掌握度 35% + 近 30 天正确率 25% + 覆盖面 20% + 校准 20%。
 * 样本不足时宁可返回 null，也不给一个看起来精确的假数字。
 */
export function buildAbilityProfile(db: DB, now = new Date()): AbilityProfile {
  const allModels = Object.values(db.models)
  const since30 = daysAgoIso(30, now)

  const dimensions: AbilityDimension[] = ABILITIES.map((meta) => {
    const models = allModels.filter((m) => modelInAbility(m.model_tag, meta.key))
    const modelTags = new Set(models.map((m) => m.model_tag))
    const all = db.reviews.filter((r) => modelTags.has(r.model_tag))
    const seen = new Set(all.map((r) => r.model_tag))
    const touched = models.filter((m) => m.mastery_level > 0 || seen.has(m.model_tag))
    const r30 = all.filter((r) => r.timestamp >= since30)
    const practice =
      meta.key === 'writing'
        ? db.drafts.length
        : meta.key === 'appreciation'
          ? db.annotations.length
          : 0
    const evidence = all.length + practice
    const accuracy = r30.length ? r30.filter((r) => r.correct).length / r30.length : null
    const bias = biasOf(r30).bias
    const coverage = models.length ? touched.length / models.length : 0
    const masteryAvg = avg(models.map((m) => m.mastery_level))

    let index: number | null = null
    if (meta.scored && all.length >= 1) {
      const masteryPart = (masteryAvg / 4) * 100
      const accuracyPart = (accuracy ?? 0) * 100
      const coveragePart = coverage * 100
      const calibPart = bias == null ? 50 : Math.max(0, 100 - Math.abs(bias))
      index = Math.round(
        masteryPart * 0.35 + accuracyPart * 0.25 + coveragePart * 0.2 + calibPart * 0.2,
      )
    }

    const recent = all.filter((r) => r.timestamp >= daysAgoIso(7, now))
    const prior = all.filter(
      (r) => r.timestamp >= daysAgoIso(14, now) && r.timestamp < daysAgoIso(7, now),
    )
    const trend =
      recent.length >= 3 && prior.length >= 3
        ? Math.round(
            (recent.filter((r) => r.correct).length / recent.length -
              prior.filter((r) => r.correct).length / prior.length) *
              100,
          )
        : null

    const lowest =
      touched
        .slice()
        .sort((a, b) => a.mastery_level - b.mastery_level || (a.acc_last10 ?? 0) - (b.acc_last10 ?? 0))[0]
        ?.name ?? null

    return {
      key: meta.key,
      name: meta.name,
      ability: meta.ability,
      scored: meta.scored,
      models_total: models.length,
      models_touched: touched.length,
      coverage,
      mastery_avg: masteryAvg,
      reviews_30: r30.length,
      accuracy_30: accuracy,
      bias_30: bias,
      trend,
      evidence,
      practice,
      index,
      label: labelFor(index, meta.scored),
      lowest_model: lowest,
    }
  })

  const scored = dimensions.filter((d) => d.scored && d.index != null)
  const overall = scored.length >= 2 ? Math.round(avg(scored.map((d) => d.index as number))) : null
  const ranked = scored.slice().sort((a, b) => (a.index as number) - (b.index as number))
  const weakest = ranked[0] ?? null
  const strongest = ranked.length ? ranked[ranked.length - 1] : null
  const totalModels = allModels.length
  const touchedTags = new Set(db.reviews.map((r) => r.model_tag))
  const touchedModels = allModels.filter(
    (m) => m.mastery_level > 0 || touchedTags.has(m.model_tag),
  ).length
  const all30 = withinDays(db.reviews, now, 30)
  const bias30 = biasOf(all30).bias
  const scoredEvidence = dimensions
    .filter((d) => d.scored)
    .reduce((sum, d) => sum + d.reviews_30, 0)

  return {
    dimensions,
    overall_index: overall,
    overall_label:
      overall == null ? '证据不足' : overall < 45 ? '起步' : overall < 65 ? '形成中' : overall < 80 ? '较稳定' : '稳定',
    total_models: totalModels,
    touched_models: touchedModels,
    coverage: totalModels ? touchedModels / totalModels : 0,
    reviews_30: all30.length,
    accuracy_30: all30.length ? all30.filter((r) => r.correct).length / all30.length : null,
    bias_30: bias30,
    scored_dimensions: scored.length,
    evidence_confidence: scoredEvidence >= 60 ? 'high' : scoredEvidence >= 15 ? 'medium' : 'low',
    strongest,
    weakest,
    focus: weakest,
    generated_at: now.toISOString(),
  }
}

export function todayStats(db: DB, now = new Date()): TodayStats {
  const start = startOfDay(now).toISOString()
  const next = new Date(startOfDay(now).getTime() + 86400000).toISOString()
  const today = db.reviews.filter((r) => r.timestamp >= start && r.timestamp < next)
  const note = db.daily.find((d) => d.date === dayKey(now))?.note ?? ''
  const firstSeen = new Set<string>()
  for (const r of today) {
    const item = db.items[r.item_id]
    if (item?.first_review_at && item.first_review_at >= start) firstSeen.add(item.item_id)
  }
  const date = dayKey(now)
  return {
    done: today.length,
    correct: today.filter((r) => r.correct).length,
    accuracy: today.length ? today.filter((r) => r.correct).length / today.length : null,
    minutes: Math.round(today.reduce((s, r) => s + (r.time_spent ?? 0), 0) / 60),
    models_touched: new Set(today.map((r) => r.model_tag)).size,
    new_items: firstSeen.size,
    drafts: db.drafts.filter((d) => dayKey(new Date(d.created_at)) === date).length,
    annotations: db.annotations.filter((a) => dayKey(new Date(a.created_at)) === date).length,
    note,
    has_note: note.trim().length >= 10,
  }
}

export function dailyStreak(db: DB, now = new Date()): number {
  const days = new Set(db.daily.filter((d) => d.note.trim().length >= 10).map((d) => d.date))
  if (days.size === 0) return 0
  const cursor = new Date(startOfDay(now))
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let n = 0
  while (days.has(dayKey(cursor))) {
    n += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/** 每天固定三样，不随刷新变化；换一天才换。 */
export function dailyPicks(now = new Date()): DailyPicks {
  const key = dayKey(now)
  return {
    word: CLASSICAL_ENTRIES[hash(`${key}:word`) % CLASSICAL_ENTRIES.length],
    imagery: IMAGERY[hash(`${key}:image`) % IMAGERY.length],
    technique: TECHNIQUES[hash(`${key}:tech`) % TECHNIQUES.length],
  }
}

export function getDailyEntry(db: DB, now = new Date()): DailyEntry | null {
  return db.daily.find((d) => d.date === dayKey(now)) ?? null
}

function segments(raw: string, breaks: number[]): string {
  const out: string[] = []
  let last = 0
  for (const b of breaks) {
    out.push(raw.slice(last, b))
    last = b
  }
  out.push(raw.slice(last))
  return out.join(' / ')
}

export interface MistakeCard {
  review: Review
  item: Item
  question: string
  correct: string
  model_name: string
  definition: string
  advice: string
}

/** 把 item 反查成可读题面，供错题复盘和 AI 追问使用。 */
export function explainItem(db: DB, item: Item, review?: Review): MistakeCard | null {
  const modelRecord = db.models[item.model_tag]
  const modelName = modelRecord?.name ?? item.model_tag
  let question = String(item.content.title ?? '')
  let correct = ''
  let advice = ''

  switch (item.item_type) {
    case 'cloze_blank': {
      const text = CLOZE_TEXTS.find((t) => t.id === item.content.textId)
      const blank = text?.blanks.find((b) => b.id === item.content.blankId)
      if (!blank) return null
      question = blank.evidence
      correct = blank.word
      advice = blank.why
      break
    }
    case 'argument_label': {
      const p = ARGUMENT_PASSAGES.find((x) => x.id === item.content.passageId)
      const s = p?.sentences.find((x) => x.id === item.content.sentenceId)
      if (!s) return null
      question = s.text
      correct = s.tag
      advice = s.note
      break
    }
    case 'argument_option': {
      const p = ARGUMENT_PASSAGES.find((x) => x.id === item.content.passageId)
      const o = p?.options.find((x) => x.id === item.content.optionId)
      if (!o) return null
      question = o.text
      correct = o.is_correct ? '忠实原文' : `谬误：${o.fallacy ?? '未标'}`
      advice = o.explain
      break
    }
    case 'classical_card':
    case 'classical_production': {
      const e = CLASSICAL_ENTRIES.find((x) => x.id === item.content.entryId)
      if (!e) return null
      question = item.item_type === 'classical_card' ? e.question : e.production ?? e.question
      correct = item.item_type === 'classical_card' ? e.answer : e.production_answer ?? e.answer
      advice = e.note
      break
    }
    case 'syntax_chunk': {
      const s = SYNTAX_SENTENCES.find((x) => x.id === item.content.sentenceId)
      if (!s) return null
      question = s.sentence
      correct = s.trunk
      advice = s.explain
      break
    }
    case 'punctuation': {
      const p = PUNCTUATION_SENTENCES.find((x) => x.id === item.content.punctuationId)
      if (!p) return null
      question = p.raw
      correct = segments(p.raw, p.breaks)
      advice = p.reasons.join('；')
      break
    }
    case 'technique_card': {
      if (item.content.kind === 'imagery') {
        const img = IMAGERY.find((x) => x.id === item.content.refId)
        if (!img) return null
        question = `“${img.image}”通常承载什么情感？`
        correct = img.emotion
        advice = img.note
      } else {
        const tech = TECHNIQUES.find((x) => x.id === item.content.refId)
        if (!tech) return null
        question = `“${tech.name}”的表达效果是什么？`
        correct = tech.effect
        advice = tech.signals
      }
      break
    }
    default:
      return null
  }

  return {
    review: review ?? ({} as Review),
    item,
    question,
    correct,
    model_name: modelName,
    definition: MODEL_DEFS.get(item.model_tag)?.definition ?? '',
    advice,
  }
}


export function recentMistakes(db: DB, limit = 6): MistakeCard[] {
  return db.reviews
    .filter((r) => !r.correct)
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .map((r) => {
      const item = db.items[r.item_id]
      return item ? explainItem(db, item, r) : null
    })
    .filter((x): x is MistakeCard => Boolean(x))
    .slice(0, limit)
}

export function masteryText(level: number): string {
  return MASTERY_LABELS[Math.max(0, Math.min(4, level))]
}

export function dailyNotePrompt(): string {
  return '把今天这三样连成一句话，或写下你真正注意到的一处语言现象。不要写“今天学到了很多”，写具体的词、句或判断。'
}

export function readingOfTheDay(now = new Date()) {
  return READINGS[hash(dayKey(now)) % READINGS.length]
}
