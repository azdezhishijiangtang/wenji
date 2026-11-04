import { DefaultScheduler, Rating as FsrsRating } from 'ts-fsrs'
import type { FsrsCard, Rating } from './types'

type Scheduler = Awaited<ReturnType<typeof DefaultScheduler>>

let scheduler: Scheduler | null = null
let schedulerRetention = 0.9

/**
 * FSRS 只在这里初始化。调度间隔一律由库计算，业务代码里没有 1/2/4/7 天这类手写序列。
 * 采用 FSRS-6；开关短期步骤，避免同一天重复“学习步”把语文训练切成碎片。
 */
export async function initScheduler(desiredRetention = 0.9): Promise<void> {
  if (scheduler && Math.abs(schedulerRetention - desiredRetention) < 0.001) return
  scheduler = await DefaultScheduler({
    version: 'FSRS-6',
    desiredRetention,
    enableShortTerm: false,
    enableFuzz: true,
    maximumInterval: 3650,
  })
  schedulerRetention = desiredRetention
}

function requireScheduler(): Scheduler {
  if (!scheduler) throw new Error('FSRS 尚未初始化')
  return scheduler
}

const GRADE: Record<Rating, FsrsRating> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
}

function normalize(card: unknown): FsrsCard {
  const c = card as Record<string, unknown>
  const due = c.dueAt ?? c.due
  const last = c.lastReviewAt ?? c.last_review ?? null
  return {
    cardId: String(c.cardId ?? ''),
    dueAt: new Date(due as string | Date).toISOString(),
    lastReviewAt: last ? new Date(last as string | Date).toISOString() : null,
    stability: Number(c.stability ?? 0),
    difficulty: Number(c.difficulty ?? 0),
    state: Number(c.state ?? 0),
    reps: Number(c.reps ?? 0),
    lapses: Number(c.lapses ?? 0),
    scheduledDays: Number(c.scheduledDays ?? c.scheduled_days ?? 0),
    learningStep: Number(c.learningStep ?? c.learning_steps ?? 0),
    scheduleStatus: String(c.scheduleStatus ?? ''),
  }
}

export function newCard(now: Date): FsrsCard {
  return normalize(requireScheduler().newCard({ now }))
}

export function reviewCard(card: FsrsCard | null, rating: Rating, now: Date): FsrsCard {
  const s = requireScheduler()
  // ts-fsrs v6 的卡片在内存里要求 dueAt / lastReviewAt 是 Date 对象；
  // 我们的 DB 为了 JSON 持久化把它们存成 ISO 字符串，这里只在交给调度器前转回 Date。
  const base = card
    ? {
        ...card,
        dueAt: new Date(card.dueAt),
        lastReviewAt: card.lastReviewAt ? new Date(card.lastReviewAt) : null,
      }
    : s.newCard({ now })
  const result = s.review({
    card: base as never,
    grade: GRADE[rating] as 1 | 2 | 3 | 4,
    now,
  })
  return normalize(result.card)
}

export function retrievability(card: FsrsCard, now: Date): number {
  if (!scheduler) return 0
  try {
    const elapsed = (now.getTime() - new Date(card.lastReviewAt ?? now).getTime()) / 86400000
    return scheduler.model.forgettingCurve(card as never, elapsed)
  } catch {
    return 0
  }
}
