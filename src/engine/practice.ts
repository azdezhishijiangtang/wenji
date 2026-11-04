import type { DB, Item } from './types'
import type { DrillKind, GroupView } from './practice-types'
import { dayKey } from './util'
import { getQueue } from './store'

export type { DrillKind, GroupView }

export const DRILLS: {
  kind: DrillKind
  path: string
  name: string
  ability: string
  tagline: string
}[] = [
  {
    kind: 'cloze',
    path: '/drills/cloze',
    name: '语义分辨 · 挖词',
    ability: '语义边界',
    tagline: '在一个词被换掉的地方停一下：它改变了范围、程度，还是预设？',
  },
  {
    kind: 'argument',
    path: '/drills/argument',
    name: '篇章逻辑 · 论证',
    ability: '结构与推理',
    tagline: '先把一段话拆成骨架，再看它如何成立，或在哪里偷换。',
  },
  {
    kind: 'classical',
    path: '/drills/classical',
    name: '文言积累',
    ability: '语言材料',
    tagline: '认读、回译两关，按词而不是按义项碎片复习。',
  },
  {
    kind: 'writing',
    path: '/drills/writing',
    name: '表达转化 · 写作',
    ability: '观点到文字',
    tagline: '先写，再看断点。没有范文，只有追问。',
  },
  {
    kind: 'appreciation',
    path: '/drills/appreciation',
    name: '文本感受 · 鉴赏',
    ability: '手法与意象',
    tagline: '手法与意象是入口；不可枚举的感受，留给每天的精读。',
  },
  {
    kind: 'syntax',
    path: '/drills/syntax',
    name: '句法控制',
    ability: '句级结构感',
    tagline: '删枝叶找主干，给每个断句位置一个理由。',
  },
  {
    kind: 'foundation',
    path: '/foundation',
    name: '基本功 · 辨异与重组',
    ability: '语义边界与篇章结构',
    tagline: '先选，再写一句为什么；先排序，再说出连接词的走向。',
  },
]

const KIND_LABEL: Record<DrillKind, string> = {
  cloze: '辨异',
  argument: '结构',
  classical: '文言',
  writing: '转化',
  appreciation: '感受',
  syntax: '句法',
  foundation: '基本功',
}

export function kindOf(item: Item): DrillKind | null {
  if (
    item.content.kind === 'foundation_semantic' ||
    item.content.kind === 'foundation_coherence'
  ) {
    return 'foundation'
  }
  switch (item.item_type) {
    case 'cloze_blank':
      return 'cloze'
    case 'argument_label':
    case 'argument_option':
      return 'argument'
    case 'classical_card':
    case 'classical_production':
      return 'classical'
    case 'technique_card':
      return 'appreciation'
    case 'syntax_chunk':
    case 'punctuation':
      return 'syntax'
    default:
      return null
  }
}

export function kindLabel(kind: DrillKind): string {
  return KIND_LABEL[kind]
}

export function groupKind(groupId: string): DrillKind | null {
  if (groupId.startsWith('cloze:')) return 'cloze'
  if (groupId.startsWith('argument:')) return 'argument'
  if (groupId.startsWith('classical.')) return 'classical'
  if (groupId.startsWith('appreciation.')) return 'appreciation'
  if (groupId === 'syntax.main' || groupId === 'syntax.punct') return 'syntax'
  if (groupId.startsWith('foundation.')) return 'foundation'
  return null
}

export function groupItems(db: DB, groupId: string): Item[] {
  return Object.values(db.items)
    .filter((i) => i.group_id === groupId)
    .sort((a, b) => Number(a.content.order ?? 0) - Number(b.content.order ?? 0))
}

export function allGroups(db: DB, kind: DrillKind): GroupView[] {
  const groups = new Map<string, Item[]>()
  for (const item of Object.values(db.items)) {
    if (kindOf(item) !== kind || item.status === 'suspended') continue
    const list = groups.get(item.group_id) ?? []
    list.push(item)
    groups.set(item.group_id, list)
  }
  return [...groups.entries()]
    .map(([id, items]) => {
      items.sort((a, b) => Number(a.content.order ?? 0) - Number(b.content.order ?? 0))
      const first = items[0]
      return {
        id,
        title: String(first.content.group_title ?? first.content.title ?? id),
        subtitle: String(first.content.group_subtitle ?? first.content.subtitle ?? ''),
        kind,
        items,
      }
    })
    .sort(
      (a, b) =>
        Number(a.items[0].content.order ?? 0) - Number(b.items[0].content.order ?? 0),
    )
}

export function reviewedTodayIds(db: DB, now = new Date()): Set<string> {
  const today = dayKey(now.toISOString())
  return new Set(
    db.reviews.filter((r) => dayKey(r.timestamp) === today).map((r) => r.item_id),
  )
}

export function remainingItems(group: GroupView, db: DB, now = new Date()): Item[] {
  const done = reviewedTodayIds(db, now)
  return group.items.filter((i) => !done.has(i.item_id))
}

const ACTIVE_KEY = 'wenyi.activeGroup'

export function setActiveGroup(groupId: string): void {
  try {
    sessionStorage.setItem(ACTIVE_KEY, groupId)
  } catch {
    // 隐私模式下忽略，页面会回退到队列/第一组
  }
}

export function takeActiveGroup(kind: DrillKind, db: DB, now = new Date()): GroupView | null {
  let id: string | null = null
  try {
    id = sessionStorage.getItem(ACTIVE_KEY)
  } catch {
    id = null
  }
  if (id) {
    const group = allGroups(db, kind).find((g) => g.id === id)
    if (group) return group
  }

  const queue = getQueue(now)
  const queued = [...queue.due, ...queue.fresh]
    .filter((g) => kindOf(g.items[0]) === kind)
    .map((g) => allGroups(db, kind).find((x) => x.id === g.group_id))
    .filter((g): g is GroupView => Boolean(g))
  const fromQueue = queued.find((g) => remainingItems(g, db, now).length > 0)
  if (fromQueue) return fromQueue

  return (
    allGroups(db, kind).find((g) => remainingItems(g, db, now).length > 0) ?? null
  )
}

export function todayDoneFor(db: DB, kind: DrillKind, now = new Date()): number {
  const done = reviewedTodayIds(db, now)
  return allGroups(db, kind).reduce(
    (n, g) => n + g.items.filter((i) => done.has(i.item_id)).length,
    0,
  )
}

/** 稳定洗牌：同一个 id 每次得到同一个顺序，便于测试与回看。 */
export function seededShuffle<T>(list: T[], seed: string): T[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    const j = Math.abs(h) % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
