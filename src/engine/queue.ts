import type { Item, ItemType, ModelRecord, Queue, QueueGroup, Review, Settings } from './types'
import { byModel, biasOf, withinDays } from './analytics'
import { isNight, overdueDays, startOfDay } from './util'

export interface QueueInput {
  items: Item[]
  reviews: Review[]
  models: Record<string, ModelRecord>
  settings: Settings
  now: Date
}

function groupMeta(item: Item): { title: string; subtitle: string } {
  const title = item.content.group_title ?? item.content.title
  const subtitle = item.content.group_subtitle ?? item.content.subtitle
  return {
    title: typeof title === 'string' && title ? title : '训练',
    subtitle: typeof subtitle === 'string' ? subtitle : '',
  }
}

function makeGroup(id: string, items: Item[], now: Date): QueueGroup {
  const first = items[0]
  const meta = groupMeta(first)
  return {
    group_id: id,
    title: meta.title,
    subtitle: meta.subtitle,
    kind: first.item_type as ItemType,
    items,
    due_count: items.filter((i) => i.fsrs).length,
    new_count: items.filter((i) => !i.fsrs).length,
    urgent: items.some((i) => i.fsrs && overdueDays(i.fsrs.dueAt, now) >= 3),
  }
}

/**
 * M1 队列：
 * 1. 到期条目优先，逾期越久越靠前；
 * 2. 校准偏差大（高估）的模型往前排；
 * 3. 新卡每天上限（默认 12），总量上限（默认 40）；
 * 4. LV.3 起不再主动推送新变式（公理五，硬编码）。
 * 队列只决定“做什么”，不改变任何复习间隔；间隔全部由 FSRS 计算。
 */
export function buildQueue(input: QueueInput): Queue {
  const { items, reviews, models, settings, now } = input
  const night = isNight(now)
  const dayStart = startOfDay(now).toISOString()
  const today = reviews.filter((r) => r.timestamp >= dayStart)
  const reviewedToday = new Set(today.map((r) => r.item_id))
  const newToday = items.filter(
    (i) => i.first_review_at && i.first_review_at >= dayStart,
  ).length

  const active = items.filter((i) => i.status === 'active')
  const available = active.filter(
    (i) => !i.available_at || new Date(i.available_at).getTime() <= now.getTime(),
  )

  const biasMap = new Map<string, number>()
  const recent = withinDays(reviews, now, 30)
  for (const [tag, list] of byModel(recent)) {
    const b = biasOf(list)
    if (b.bias != null) biasMap.set(tag, b.bias)
  }
  const levelOf = (item: Item) => models[item.model_tag]?.mastery_level ?? 0

  const dueAll = available
    .filter((i) => i.fsrs && new Date(i.fsrs.dueAt).getTime() <= now.getTime())
    .filter((i) => !reviewedToday.has(i.item_id))
    .sort((a, b) => {
      const od = overdueDays(b.fsrs!.dueAt, now) - overdueDays(a.fsrs!.dueAt, now)
      if (Math.abs(od) > 0.5) return od
      const bias = (biasMap.get(b.model_tag) ?? 0) - (biasMap.get(a.model_tag) ?? 0)
      if (Math.abs(bias) > 0.5) return bias
      return Number(a.content.order ?? 0) - Number(b.content.order ?? 0)
    })

  // 到期队列的组感知装入：dailyCap 仍是硬上限，但正常大小的题组
  // 不再被截断拆碎（一篇挖词只推一半空位会破坏语境）——
  // 装得下整组就放，放不下就整组跳过；唯一例外是组本身比 dailyCap
  // 还大，此时截断该组，否则它会永远卡在队列外。
  const dueByGroupRaw = new Map<string, Item[]>()
  for (const item of dueAll) {
    const list = dueByGroupRaw.get(item.group_id)
    if (list) list.push(item)
    else dueByGroupRaw.set(item.group_id, [item])
  }
  const dueItems: Item[] = []
  let dueCount = 0
  let deferredGroups = 0
  let deferredItems = 0
  for (const list of dueByGroupRaw.values()) {
    const room = settings.dailyCap - dueCount
    if (room <= 0) {
      deferredGroups += 1
      deferredItems += list.length
      continue
    }
    if (list.length <= room) {
      dueItems.push(...list)
      dueCount += list.length
    } else if (list.length > settings.dailyCap) {
      dueItems.push(...list.slice(0, room))
      dueCount = settings.dailyCap
      deferredItems += list.length - room
    } else {
      deferredGroups += 1
      deferredItems += list.length
    }
  }
  const freshBudget = Math.max(0, settings.dailyCap - dueItems.length)
  // 新卡既要受“每日新卡上限”约束，也不能把总量顶过 dailyCap。
  const newBudget = Math.min(Math.max(0, settings.newItemCap - newToday), freshBudget)

  const freshAll = available.filter((i) => !i.fsrs && !reviewedToday.has(i.item_id))
  const skipped = freshAll.filter((i) => levelOf(i) >= 3)
  const freshPool = freshAll.filter((i) => levelOf(i) < 3)

  const freshGroups = new Map<string, Item[]>()
  for (const item of freshPool) {
    const list = freshGroups.get(item.group_id)
    if (list) list.push(item)
    else freshGroups.set(item.group_id, [item])
  }
  const ordered = [...freshGroups.entries()].sort((a, b) => {
    const ao = Math.min(...a[1].map((i) => Number(i.content.order ?? 0)))
    const bo = Math.min(...b[1].map((i) => Number(i.content.order ?? 0)))
    return ao - bo
  })

  const selected: [string, Item[]][] = []
  let newCount = 0
  if (newBudget > 0) {
    for (const entry of ordered) {
      if (selected.length >= 3) break
      if (newCount + entry[1].length <= newBudget) {
        selected.push(entry)
        newCount += entry[1].length
      }
    }
  }

  const dueByGroup = new Map<string, Item[]>()
  for (const item of dueItems) {
    const list = dueByGroup.get(item.group_id)
    if (list) list.push(item)
    else dueByGroup.set(item.group_id, [item])
  }
  const dueGroups = [...dueByGroup.entries()]
    .map(([id, list]) => makeGroup(id, list, now))
    .sort((a, b) => {
      const aMax = Math.max(...a.items.map((i) => overdueDays(i.fsrs!.dueAt, now)))
      const bMax = Math.max(...b.items.map((i) => overdueDays(i.fsrs!.dueAt, now)))
      if (Math.abs(bMax - aMax) > 0.5) return bMax - aMax
      const aBias = Math.max(...a.items.map((i) => biasMap.get(i.model_tag) ?? 0))
      const bBias = Math.max(...b.items.map((i) => biasMap.get(i.model_tag) ?? 0))
      return bBias - aBias
    })

  const fresh = selected
    .slice(0, freshBudget > 0 ? 3 : 0)
    .map(([id, list]) => makeGroup(id, list, now))

  return {
    now: now.toISOString(),
    read_only: night,
    night,
    due: night ? [] : dueGroups,
    fresh: night ? [] : fresh,
    total_due: night ? 0 : dueItems.length,
    total_fresh: night ? 0 : fresh.reduce((n, g) => n + g.items.length, 0),
    completed_today: reviewedToday.size,
    planned: night ? 0 : dueItems.length + fresh.reduce((n, g) => n + g.items.length, 0),
    skipped_variants: skipped.length,
    deferred_groups: night ? 0 : deferredGroups,
    deferred_items: night ? 0 : deferredItems,
  }
}
