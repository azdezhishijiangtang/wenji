/**
 * 限时抽样卷：把 README 里“考试只是它们的抽样”从口号变成动作。
 *
 * 设计约束：
 * - 卷子只做三件事：抽题（按六维配比 + 当日种子稳定）、计时、追踪完成度。
 * - 作答不另造交互：卷面条目跳转到对应训练页，走现有 submitReview 链路，
 *   掌握度 / FSRS / 校准 / 错因全自动，卷子只回收“正确率”做验收快照。
 * - 抽样池 = 已学过的条目（有 FSRS 卡）：组卷是“限时二刷”，不是新卡首学。
 */
import type { DB, ExamRecord, Item } from './types'
import { dayKey } from './util'
import { kindOf, seededShuffle, type DrillKind } from './practice'

export const EXAM_SIZES = [6, 10, 14] as const

export interface ExamPoolResult {
  items: Item[]
  /** 每个维度抽了几条，用于展示配比 */
  mix: { kind: DrillKind; count: number }[]
  /** 池子总量（已学条目总数），供提示 */
  poolSize: number
}

export function buildExamPool(db: DB, now: Date, size: number): ExamPoolResult {
  const studied = Object.values(db.items).filter((i) => i.status === 'active' && i.fsrs)
  const buckets = new Map<DrillKind, Item[]>()
  for (const item of studied) {
    const kind = kindOf(item)
    if (!kind) continue
    const list = buckets.get(kind)
    if (list) list.push(item)
    else buckets.set(kind, [item])
  }
  // 当日种子：同一天重复开卷得到同一份卷面，跨天换卷
  const date = dayKey(now)
  const shuffled = new Map<DrillKind, Item[]>()
  for (const [kind, list] of buckets) {
    shuffled.set(kind, seededShuffle(list, `${date}:${kind}`))
  }
  // 轮转抽题：先保证每个维度至少一条，再按轮次补齐到 size
  const picked: Item[] = []
  const seen = new Set<string>()
  let progress = true
  while (picked.length < size && progress) {
    progress = false
    for (const kind of [...shuffled.keys()].sort()) {
      if (picked.length >= size) break
      const list = shuffled.get(kind)!
      const next = list.find((i) => !seen.has(i.item_id))
      if (next) {
        picked.push(next)
        seen.add(next.item_id)
        progress = true
      }
    }
  }
  const mix = [...buckets.keys()].sort().map((kind) => ({
    kind,
    count: picked.filter((i) => kindOf(i) === kind).length,
  }))
  return { items: picked, mix, poolSize: studied.length }
}

/** 卷内条目的完成状态：started_at 之后有没有作答记录。 */
export function examItemStatus(
  db: DB,
  exam: ExamRecord,
): Record<string, { answered: boolean; correct: boolean | null }> {
  const status: Record<string, { answered: boolean; correct: boolean | null }> = {}
  for (const id of exam.item_ids) status[id] = { answered: false, correct: null }
  const relevant = db.reviews
    .filter((r) => status[r.item_id] && r.timestamp >= exam.started_at)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  for (const r of relevant) {
    status[r.item_id] = { answered: true, correct: r.correct }
  }
  return status
}
