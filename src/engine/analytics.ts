import type {
  CalibrationBin,
  ErrorFingerprint,
  MasteryEvent,
  ModelRecord,
  ModelStat,
  Review,
  WeeklyReport,
} from './types'
import { ERROR_TAGS, MASTERY_LABELS } from './types'
import { addDays, dayKey, startOfDay, sum } from './util'

export interface BiasSummary {
  n: number
  accuracy: number | null
  mean_confidence: number | null
  /** mean(confidence) - accuracy × 100，样本 < 5 时不出结论。 */
  bias: number | null
}

export function biasOf(reviews: Review[]): BiasSummary {
  const n = reviews.length
  if (!n) return { n: 0, accuracy: null, mean_confidence: null, bias: null }
  const correct = reviews.filter((r) => r.correct).length
  const mean = sum(reviews.map((r) => r.confidence)) / n
  const accuracy = correct / n
  return {
    n,
    accuracy,
    mean_confidence: mean,
    bias: n >= 5 ? mean - accuracy * 100 : null,
  }
}

export function withinDays(reviews: Review[], now: Date, days: number): Review[] {
  const from = addDays(now, -days).getTime()
  return reviews.filter((r) => new Date(r.timestamp).getTime() >= from)
}

export function byModel(reviews: Review[]): Map<string, Review[]> {
  const map = new Map<string, Review[]>()
  for (const r of reviews) {
    const list = map.get(r.model_tag)
    if (list) list.push(r)
    else map.set(r.model_tag, [r])
  }
  return map
}

export function calibrationBins(reviews: Review[], now: Date, days = 30): CalibrationBin[] {
  const list = withinDays(reviews, now, days)
  const edges = [0, 20, 40, 60, 80, 100]
  return edges.slice(0, -1).map((low, i) => {
    const high = edges[i + 1]
    const bin = list.filter((r) => {
      const c = r.confidence
      return i === 0 ? c >= low && c <= high : c > low && c <= high
    })
    const acc = bin.length ? bin.filter((r) => r.correct).length / bin.length : null
    return { label: `${low}–${high}`, low, high, n: bin.length, accuracy: acc }
  })
}

export function modelStats(models: Record<string, ModelRecord>, reviews: Review[], now: Date): ModelStat[] {
  const recent = withinDays(reviews, now, 30)
  const grouped = byModel(recent)
  return Object.values(models)
    .map((m) => {
      const list = grouped.get(m.model_tag) ?? []
      const b = biasOf(list)
      return {
        model_tag: m.model_tag,
        name: m.name,
        n: list.length,
        accuracy: b.accuracy ?? 0,
        mean_confidence: b.mean_confidence ?? 0,
        bias: b.bias ?? 0,
        level: m.mastery_level,
        last_review_at: m.last_review_at,
      }
    })
    .sort((a, b) => b.n - a.n || b.level - a.level)
}

export function calibratedModels(stats: ModelStat[], direction: 'over' | 'under'): ModelStat[] {
  return stats
    .filter((s) => s.n >= 5 && (direction === 'over' ? s.bias > 20 : s.bias < -20))
    .sort((a, b) => (direction === 'over' ? b.bias - a.bias : a.bias - b.bias))
}

export function errorFingerprint(reviews: Review[], now: Date, days = 30): ErrorFingerprint[] {
  const list = withinDays(reviews, now, days).filter((r) => !r.correct && r.error_tag)
  const counts = new Map<string, number>()
  for (const r of list) counts.set(r.error_tag as string, (counts.get(r.error_tag as string) ?? 0) + 1)
  return ERROR_TAGS.map((t) => ({
    tag: t.value,
    label: t.label,
    count: counts.get(t.value) ?? 0,
    share: list.length ? (counts.get(t.value) ?? 0) / list.length : 0,
  })).sort((a, b) => b.count - a.count)
}

export function computeStreak(reviews: Review[], now: Date): number {
  if (!reviews.length) return 0
  const days = new Set(reviews.map((r) => dayKey(r.timestamp)))
  let cursor = startOfDay(now)
  if (!days.has(dayKey(cursor))) {
    cursor = addDays(cursor, -1)
    if (!days.has(dayKey(cursor))) return 0
  }
  let streak = 0
  while (days.has(dayKey(cursor))) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

export function reviewsOn(reviews: Review[], date: Date): Review[] {
  const key = dayKey(date)
  return reviews.filter((r) => dayKey(r.timestamp) === key)
}

function meanAbsBias(reviews: Review[]): number | null {
  const grouped = byModel(reviews)
  const values: number[] = []
  for (const list of grouped.values()) {
    const b = biasOf(list)
    if (b.bias != null) values.push(Math.abs(b.bias))
  }
  return values.length ? sum(values) / values.length : null
}

function accuracyAtVariant(reviews: Review[], level: number): { n: number; acc: number | null } {
  const list = reviews.filter((r) => r.variant_level === level)
  return {
    n: list.length,
    acc: list.length ? list.filter((r) => r.correct).length / list.length : null,
  }
}

export interface WeeklyInput {
  reviews: Review[]
  models: Record<string, ModelRecord>
  mastery_events: MasteryEvent[]
}

/**
 * 周报：只陈述数据，不做“你真棒”式评价。
 * 四信号对应使用说明里的效果自检，不用刷题量做成就（G4）。
 */
export function weeklyReport(input: WeeklyInput, now: Date): WeeklyReport {
  const start = startOfDay(addDays(now, -6))
  const prevStart = addDays(start, -7)
  const startMs = start.getTime()
  const prevStartMs = prevStart.getTime()
  const nowMs = now.getTime()

  const week = input.reviews.filter((r) => {
    const t = new Date(r.timestamp).getTime()
    return t >= startMs && t <= nowMs
  })
  const prev = input.reviews.filter((r) => {
    const t = new Date(r.timestamp).getTime()
    return t >= prevStartMs && t < startMs
  })

  const days = new Set(week.map((r) => dayKey(r.timestamp)))
  const accuracy = week.length ? week.filter((r) => r.correct).length / week.length : null
  const minutes = Math.round(sum(week.map((r) => r.time_spent)) / 60)

  const biasNow = biasOf(week)
  const biasPrev = biasOf(prev)
  const calibNow = biasNow.bias == null ? null : Math.abs(biasNow.bias)
  const calibBefore = biasPrev.bias == null ? null : Math.abs(biasPrev.bias)

  const statsNow = modelStats(input.models, input.reviews, now)
  const statsBefore = modelStats(input.models, input.reviews, prevStart)
  const overNow = calibratedModels(statsNow, 'over').length
  const overBefore = calibratedModels(statsBefore, 'over').length

  const inWeek = (iso: string) => {
    const t = new Date(iso).getTime()
    return t >= startMs && t <= nowMs
  }
  const events = input.mastery_events.filter((e) => inWeek(e.at))
  const levelUps = events
    .filter((e) => e.to > e.from)
    .map((e) => ({ name: e.name, from: e.from, to: e.to }))

  const topErrors = errorFingerprint(week, now, 7).filter((e) => e.count > 0).slice(0, 2)

  const variants2 = accuracyAtVariant(week, 2)
  const variants3 = accuracyAtVariant(week, 3)
  const variantLine =
    variants2.acc == null && variants3.acc == null
      ? '本周没有变式作答'
      : `换壳 ${variants2.acc == null ? '—' : Math.round(variants2.acc * 100) + '%'}（${variants2.n}）· 综合 ${
          variants3.acc == null ? '—' : Math.round(variants3.acc * 100) + '%'
        }（${variants3.n}）`

  const suggestions: string[] = []
  const over = calibratedModels(statsNow, 'over')
  if (over.length) {
    suggestions.push(
      `先处理高估榜：${over
        .slice(0, 2)
        .map((s) => s.name)
        .join('、')}。下次作答前，把把握度压到 60 以下再动笔。`,
    )
  }
  if (topErrors[0]?.tag === 'recall_failure') {
    suggestions.push('提取失败是本周第一错因：把复习放到睡前，第二天早上先默写再对照。')
  } else if (topErrors[0]?.tag === 'misread') {
    suggestions.push('审题偏差最多：每题落笔前用一句话写下“题目到底在问什么”。')
  } else if (topErrors[0]?.tag === 'method') {
    suggestions.push('方法缺失最多：错题入册时补一句“下次遇到同类题，第一步做什么”。')
  }
  if (!levelUps.length) {
    suggestions.push('本周没有升档。检查是不是总在校准偏差大于 +10 时硬冲新的变式。')
  }
  if (!suggestions.length) {
    suggestions.push('队列保持清空即可。周末挑一个已达标的模型，合上材料讲一遍。')
  }

  const signals = [
    {
      label: '校准偏差向对角线收敛',
      value:
        calibBefore == null || calibNow == null
          ? '样本不足'
          : `${calibBefore.toFixed(0)} → ${calibNow.toFixed(0)}`,
      ok: calibBefore != null && calibNow != null ? calibNow < calibBefore : null,
    },
    {
      label: '高估榜缩短',
      value: `${overBefore} → ${overNow} 个模型`,
      ok: overNow < overBefore,
    },
    {
      label: '达标模型数（LV.3+）',
      value: `${Object.values(input.models).filter((m) => m.mastery_level >= 3).length} 个`,
      ok: levelUps.some((e) => e.to >= 3) || null,
    },
    {
      label: '变式正确率随档位爬升',
      value: variantLine,
      ok: variants3.n >= 3 && variants3.acc != null ? variants3.acc >= 0.6 : null,
    },
  ]

  return {
    from: start.toISOString(),
    to: now.toISOString(),
    days_studied: days.size,
    minutes,
    accuracy,
    reviews: week.length,
    calib_abs_before: calibBefore,
    calib_abs_now: calibNow,
    mastered_models: Object.values(input.models).filter((m) => m.mastery_level >= 3).length,
    level_ups: levelUps,
    top_errors: topErrors,
    suggestions,
    four_signals: signals,
  }
}

export function masteryLabel(level: number): string {
  return MASTERY_LABELS[Math.max(0, Math.min(4, level))]
}
