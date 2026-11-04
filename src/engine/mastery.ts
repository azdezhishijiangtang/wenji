import type { ModelDef, ModelRecord } from './types'
import { nowIso } from './util'

export interface MasteryInput {
  correct: boolean
  itemId?: string
  variantLevel: 1 | 2 | 3
  /** 含本次作答在内的滚动 30 天校准偏差；样本不足时为 null。 */
  bias: number | null
}

export interface MasteryOutcome {
  record: ModelRecord
  level_before: number
  level_after: number
  change: string
  upgraded: boolean
  downgraded: boolean
}

export function emptyModel(def: ModelDef, at = nowIso()): ModelRecord {
  return {
    model_tag: def.tag,
    domain: def.domain,
    name: def.name,
    mastery_level: 0,
    variant_streak: 0,
    streak_items: [],
    acc_last10: null,
    calib_bias: null,
    variant_level: 1,
    updated_at: at,
    last_review_at: null,
  }
}

/**
 * 掌握度只由作答数据驱动（公理二）。
 *
 * 与 PRD 的一处偏离（已在 README 说明）：
 * 静态内容站没有真正的“变式生成器”，如果仍按 variant_level 门槛累计，
 * 大多数模型会永远卡在 LV.1。这里改成：**同一模型下 3 道不同条目**连续答对
 * 才升一档，同一条目重复作答不计入连对。语义仍是“新题连对”，但把
 * “新”落在条目而不是生成难度上；等引擎的变式生成上线后，再换回 variant_level 门槛。
 *
 * 降级：答错立即降一档（不低于 LV.1），连对清零。
 * 达标即停：LV.3 起不再主动推送新条目（见 queue.ts）。
 */
export function applyMastery(prev: ModelRecord, input: MasteryInput): MasteryOutcome {
  const before = prev.mastery_level
  let level = before
  let streak = prev.variant_streak
  let streakItems = prev.streak_items ?? []
  let repeated = false

  if (level === 0) level = 1

  if (!input.correct) {
    level = Math.max(1, level - 1)
    streak = 0
    streakItems = []
  } else {
    const itemId = input.itemId ?? ''
    const isNew = !itemId || !streakItems.includes(itemId)
    if (isNew) {
      streak += 1
      streakItems = [...streakItems, itemId]
      if (streakItems.length > 12) streakItems = streakItems.slice(-12)
    } else {
      repeated = true
    }
    const calibrated = input.bias == null || input.bias <= 10
    if (streak >= 3 && level < 4 && calibrated) {
      level += 1
      streak = 0
      streakItems = []
    }
  }

  const change =
    level > before
      ? before === 0
        ? `入档 · ${prev.name}`
        : `升档 · ${prev.name}`
      : level < before
        ? `降档 · ${prev.name}`
        : input.correct
          ? repeated
            ? '重复作答，不计连对'
            : `连对 ${streak}/3`
          : '连对清零'

  const record: ModelRecord = {
    ...prev,
    mastery_level: level,
    variant_streak: streak,
    streak_items: streakItems,
    variant_level: Math.min(3, Math.max(1, level)) as 1 | 2 | 3,
    updated_at: nowIso(),
    last_review_at: nowIso(),
  }

  return {
    record,
    level_before: before,
    level_after: level,
    change,
    upgraded: level > before && before > 0,
    downgraded: level < before,
  }
}

/** 变式难度只由掌握度决定，不由用户选择。 */
export function variantLevelFor(level: number): 1 | 2 | 3 {
  return Math.min(3, Math.max(1, level)) as 1 | 2 | 3
}
