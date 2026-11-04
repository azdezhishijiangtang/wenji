import { beforeAll, describe, expect, it } from 'vitest'
import type { FsrsCard, Item, ModelDef, ModelRecord, Review, Settings } from './types'
import { ERROR_TAGS } from './types'
import { applyMastery, emptyModel } from './mastery'
import { buildQueue } from './queue'
import { initScheduler, newCard, reviewCard } from './fsrs'
import { biasOf, calibrationBins, computeStreak, errorFingerprint, weeklyReport } from './analytics'
import { addDays, dayKey, startOfDay } from './util'

const DEF: ModelDef = {
  tag: 'test.model',
  name: '测试模型',
  domain: '语文',
  definition: '',
  keyPoints: [],
  commonErrors: [],
}

const SETTINGS: Settings = {
  newItemCap: 12,
  dailyCap: 40,
  desiredRetention: 0.9,
  ai: { enabled: false, baseUrl: '', apiKey: '', model: '' },
}

let cardSeq = 0
function fsrsDue(due: Date): FsrsCard {
  cardSeq += 1
  return {
    cardId: `card-${cardSeq}`,
    dueAt: due.toISOString(),
    lastReviewAt: addDays(due, -1).toISOString(),
    stability: 1,
    difficulty: 5,
    state: 2,
    reps: 1,
    lapses: 0,
    scheduledDays: 1,
    learningStep: 0,
    scheduleStatus: 'review',
  }
}

function makeItem(
  id: string,
  group: string,
  order: number,
  opts: { due?: Date; model?: string; level?: number; type?: Item['item_type'] } = {},
): Item {
  return {
    item_id: id,
    user_id: 'u',
    source: 'chinese_site',
    item_type: opts.type ?? 'cloze_blank',
    model_tag: opts.model ?? 'test.model',
    content: { title: group, order },
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    first_review_at: opts.due ? addDays(opts.due, -1).toISOString() : null,
    group_id: group,
    variant_level: 1,
    fsrs: opts.due ? fsrsDue(opts.due) : null,
  }
}

function makeModel(tag: string, level = 0): ModelRecord {
  return {
    model_tag: tag,
    domain: '语文',
    name: tag,
    mastery_level: level,
    variant_streak: 0,
    streak_items: [],
    acc_last10: null,
    calib_bias: null,
    variant_level: 1 as const,
    updated_at: '2026-01-01T00:00:00.000Z',
    last_review_at: null,
  }
}

function makeReview(partial: Partial<Review> = {}): Review {
  return {
    review_id: `r-${Math.random()}`,
    item_id: 'i',
    model_tag: 'test.model',
    variant_level: 1,
    timestamp: new Date().toISOString(),
    rating: 'good',
    correct: true,
    confidence: 50,
    error_tag: null,
    time_spent: 10,
    fsrs_state: null,
    ...partial,
  }
}

const NOW = (() => {
  const d = new Date()
  d.setHours(10, 0, 0, 0)
  return d
})()

describe('掌握度：只由作答驱动', () => {
  it('同一模型 3 道不同条目连续答对，升一档', () => {
    let record = emptyModel(DEF)
    record = applyMastery(record, { correct: true, itemId: 'a', variantLevel: 1, bias: null }).record
    expect(record.mastery_level).toBe(1)
    record = applyMastery(record, { correct: true, itemId: 'b', variantLevel: 1, bias: null }).record
    expect(record.mastery_level).toBe(1)
    expect(record.variant_streak).toBe(2)
    const out = applyMastery(record, { correct: true, itemId: 'c', variantLevel: 1, bias: null })
    expect(out.level_after).toBe(2)
    expect(out.upgraded).toBe(true)
    expect(out.record.variant_streak).toBe(0)
  })

  it('同一条目重复答对，不计连对', () => {
    let record = emptyModel(DEF)
    record = applyMastery(record, { correct: true, itemId: 'a', variantLevel: 1, bias: null }).record
    const out = applyMastery(record, { correct: true, itemId: 'a', variantLevel: 1, bias: null })
    expect(out.record.variant_streak).toBe(1)
    expect(out.change).toContain('重复作答')
  })

  it('答错立即降一档，连对清零', () => {
    const record: ModelRecord = {
      ...emptyModel(DEF),
      mastery_level: 2,
      variant_streak: 2,
      streak_items: ['a', 'b'],
    }
    const out = applyMastery(record, { correct: false, itemId: 'c', variantLevel: 2, bias: null })
    expect(out.level_after).toBe(1)
    expect(out.downgraded).toBe(true)
    expect(out.record.variant_streak).toBe(0)
    expect(out.record.streak_items).toEqual([])
  })

  it('校准偏差 > +10 时只累计连对，不升级', () => {
    let record = emptyModel(DEF)
    for (const id of ['a', 'b', 'c']) {
      record = applyMastery(record, { correct: true, itemId: id, variantLevel: 1, bias: 20 }).record
    }
    expect(record.mastery_level).toBe(1)
    expect(record.variant_streak).toBe(3)
  })
})

describe('M1 队列：上限、整组、达标即停、夜间', () => {
  it('到期条目总量不超过 dailyCap，逾期最久的排最前', () => {
    const items: Item[] = []
    for (let i = 0; i < 50; i++) {
      items.push(makeItem(`d${i}`, 'g1', i, { due: addDays(NOW, -1 - (i % 7)) }))
    }
    const q = buildQueue({
      items,
      reviews: [],
      models: { 'test.model': makeModel('test.model') },
      settings: SETTINGS,
      now: NOW,
    })
    expect(q.total_due).toBe(40)
    expect(q.due[0].items.length).toBe(40)
    expect(q.due[0].items[0].content.order).toBe(6)
  })

  it('新卡按整组放行，不超新卡上限', () => {
    const items: Item[] = []
    for (let g = 0; g < 3; g++) {
      for (let i = 0; i < 5; i++) items.push(makeItem(`n${g}-${i}`, `g${g}`, g * 10 + i))
    }
    const q = buildQueue({
      items,
      reviews: [],
      models: { 'test.model': makeModel('test.model') },
      settings: SETTINGS,
      now: NOW,
    })
    expect(q.total_fresh).toBe(10)
    expect(q.fresh.length).toBe(2)
    expect(q.fresh.every((g) => g.items.length === 5)).toBe(true)
  })

  it('到期条目占满总量时，新卡不再越过 dailyCap', () => {
    const items: Item[] = []
    for (let i = 0; i < 38; i++) items.push(makeItem(`d${i}`, 'due-group', i, { due: addDays(NOW, -1) }))
    for (let i = 0; i < 5; i++) items.push(makeItem(`n${i}`, 'fresh-group', 100 + i))
    const q = buildQueue({
      items,
      reviews: [],
      models: { 'test.model': makeModel('test.model') },
      settings: SETTINGS,
      now: NOW,
    })
    expect(q.total_due).toBe(38)
    expect(q.total_fresh).toBe(0)
    expect(q.planned).toBeLessThanOrEqual(SETTINGS.dailyCap)
  })

  it('夜间返回空队列，只读', () => {
    const night = new Date(2026, 10, 3, 23, 45)
    const items: Item[] = []
    for (let i = 0; i < 20; i++) items.push(makeItem(`d${i}`, 'g1', i, { due: addDays(night, -1) }))
    const q = buildQueue({
      items,
      reviews: [],
      models: { 'test.model': makeModel('test.model') },
      settings: SETTINGS,
      now: night,
    })
    expect(q.night).toBe(true)
    expect(q.read_only).toBe(true)
    expect(q.total_due).toBe(0)
    expect(q.total_fresh).toBe(0)
    expect(q.due).toEqual([])
    expect(q.fresh).toEqual([])
  })

  it('LV.3 模型不再主动推送新条目，并计入 skipped_variants', () => {
    const items: Item[] = []
    for (let i = 0; i < 10; i++) items.push(makeItem(`n${i}`, 'g1', i))
    const q = buildQueue({
      items,
      reviews: [],
      models: { 'test.model': makeModel('test.model', 3) },
      settings: SETTINGS,
      now: NOW,
    })
    expect(q.total_fresh).toBe(0)
    expect(q.skipped_variants).toBe(10)
  })

  it('今天已作答的条目不再入队', () => {
    const due = addDays(NOW, -1)
    const items = [makeItem('a', 'g1', 1, { due })]
    const reviews = [makeReview({ item_id: 'a', timestamp: new Date(startOfDay(NOW).getTime() + 3600_000).toISOString() })]
    const q = buildQueue({
      items,
      reviews,
      models: { 'test.model': makeModel('test.model') },
      settings: SETTINGS,
      now: NOW,
    })
    expect(q.total_due).toBe(0)
  })
})

describe('FSRS 由库计算间隔', () => {
  beforeAll(async () => {
    await initScheduler(0.9)
  })

  it('新卡评 good 后有稳定度和未来到期日', () => {
    const c = newCard(NOW)
    expect(c.dueAt).toBeTruthy()
    const next = reviewCard(c, 'good', NOW)
    expect(next.stability).toBeGreaterThan(0)
    expect(new Date(next.dueAt).getTime()).toBeGreaterThan(NOW.getTime())
    expect(next.reps).toBeGreaterThanOrEqual(1)
  })

  it('已学卡评 again 会记一次 lapse 并缩短间隔', () => {
    const learned = reviewCard(newCard(NOW), 'good', NOW)
    const next = reviewCard(learned, 'again', addDays(NOW, 3))
    expect(next.lapses).toBeGreaterThanOrEqual(1)
    expect(next.scheduledDays).toBeLessThanOrEqual(1)
  })
})

describe('M2/M3 校准、错因与连续天数', () => {
  it('bias 在样本 <5 时不出结论；≥5 时按公式计算', () => {
    const four = Array.from({ length: 4 }, () => makeReview({ confidence: 80, correct: true }))
    expect(biasOf(four).bias).toBeNull()
    const five = [
      ...Array.from({ length: 3 }, () => makeReview({ confidence: 80, correct: true })),
      ...Array.from({ length: 2 }, () => makeReview({ confidence: 80, correct: false })),
    ]
    expect(biasOf(five).bias).toBeCloseTo(20, 5)
  })

  it('校准分箱 5 档，按 confidence 落桶', () => {
    const reviews = [10, 30, 50, 70, 90].map((c) => makeReview({ confidence: c, correct: true }))
    const bins = calibrationBins(reviews, NOW)
    expect(bins.length).toBe(5)
    expect(bins.map((b) => b.n)).toEqual([1, 1, 1, 1, 1])
  })

  it('错误指纹只统计有标签的错题，并按数量降序', () => {
    const reviews = [
      makeReview({ correct: false, error_tag: 'misread' }),
      makeReview({ correct: false, error_tag: 'misread' }),
      makeReview({ correct: false, error_tag: 'concept' }),
      makeReview({ correct: true, error_tag: 'concept' }),
      makeReview({ correct: false, error_tag: null }),
    ]
    const fp = errorFingerprint(reviews, NOW)
    expect(fp[0].tag).toBe('misread')
    expect(fp[0].count).toBe(2)
    expect(fp.reduce((n, e) => n + e.count, 0)).toBe(3)
    expect(ERROR_TAGS.length).toBe(6)
  })

  it('连续学习天数从今天（或昨天）往前数', () => {
    const reviews = [
      makeReview({ timestamp: NOW.toISOString() }),
      makeReview({ timestamp: addDays(NOW, -1).toISOString() }),
      makeReview({ timestamp: addDays(NOW, -2).toISOString() }),
    ]
    expect(computeStreak(reviews, NOW)).toBe(3)
    expect(computeStreak([makeReview({ timestamp: addDays(NOW, -4).toISOString() })], NOW)).toBe(0)
  })

  it('周报有四个信号，且不出现 NaN', () => {
    const reviews = [makeReview({ timestamp: NOW.toISOString(), correct: false, error_tag: 'misread' })]
    const report = weeklyReport(
      { reviews, models: { 'test.model': makeModel('test.model') }, mastery_events: [] },
      NOW,
    )
    expect(report.four_signals.length).toBe(4)
    expect(report.reviews).toBe(1)
    expect(report.suggestions.length).toBeGreaterThan(0)
    expect(JSON.stringify(report)).not.toContain('NaN')
  })
})

describe('引擎唯一写入口（假 localStorage 端到端）', () => {
  class MemoryStorage {
    private map = new Map<string, string>()
    getItem(k: string) {
      return this.map.get(k) ?? null
    }
    setItem(k: string, v: string) {
      this.map.set(k, v)
    }
    removeItem(k: string) {
      this.map.delete(k)
    }
    clear() {
      this.map.clear()
    }
    key(i: number) {
      return [...this.map.keys()][i] ?? null
    }
    get length() {
      return this.map.size
    }
  }

  let store: typeof import('./store')

  beforeAll(async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    })
    store = await import('./store')
    await store.initEngine()
  })

  it('初始化后是本地用户与 266 条内容', () => {
    const db = store.getDB()
    expect(db.user.id).toBe('local-user')
    expect(Object.keys(db.items).length).toBe(266)
    expect(db.reviews.length).toBe(0)
  })

  it('取队列 → 提交作答 → 写 reviews / FSRS / 掌握度', () => {
    const q = store.getQueue(NOW)
    expect(q.total_fresh).toBeGreaterThan(0)
    const item = q.fresh[0].items[0]
    const out = store.submitReview(
      { itemId: item.item_id, correct: true, confidence: 70, timeSpent: 12 },
      NOW,
    )
    expect(out.level_before).toBe(0)
    expect(out.level_after).toBe(1)
    expect(out.mastery_change).toContain('入档')
    expect(new Date(out.next_due).getTime()).toBeGreaterThan(NOW.getTime())

    const db = store.getDB()
    expect(db.reviews.length).toBe(1)
    expect(db.reviews[0].item_id).toBe(item.item_id)
    expect(db.reviews[0].confidence).toBe(70)
    expect(db.items[item.item_id].fsrs).not.toBeNull()
    expect(db.items[item.item_id].first_review_at).toBeTruthy()
    expect(db.models[item.model_tag].mastery_level).toBe(1)

    const after = store.getQueue(NOW)
    expect(after.total_fresh).toBe(q.total_fresh - 1)
  })

  it('日课只认写过的一句，AI 复盘与诊断快照能落库', () => {
    const date = dayKey(NOW)
    expect(
      store.saveDaily({
        date,
        word_id: 'x',
        imagery_id: 'y',
        technique_id: 'z',
        note: '太短',
      }),
    ).toBe(false)
    expect(
      store.saveDaily({
        date,
        word_id: 'x',
        imagery_id: 'y',
        technique_id: 'z',
        note: '今天注意到“未必”只是降低必然性，不等于“不会”。',
      }),
    ).toBe(true)
    expect(store.getDaily(NOW)?.note).toContain('未必')
    expect(store.setDailyAI(date, '今天只完成了一组，但句子写得具体。明天先把论证结构的一组做完。', '明天先做一组论证')).toBe(true)
    expect(store.getDaily(NOW)?.ai_focus).toContain('论证')

    const report = store.saveCoachReport({
      overall: 42,
      summary: '测试摘要',
      strengths: ['词义'],
      gaps: ['论证'],
      actions: ['每天一组'],
      data_note: '依据测试数据',
      ai: false,
    })
    expect(store.getCoachReports()[0].id).toBe(report.id)
    expect(store.getCoachReports()[0].summary).toBe('测试摘要')
  })

  it('导出备份不包含 API Key', async () => {
    await store.updateSettings({
      ai: { enabled: true, baseUrl: 'https://example.com/v1', apiKey: 'sk-secret-test', model: 'x' },
    })
    const raw = store.exportJSON()
    expect(raw).not.toContain('sk-secret-test')
    expect(JSON.parse(raw).settings.ai.apiKey).toBe('')
  })

  it('夜间拒绝写入', () => {
    const q = store.getQueue(NOW)
    const item = q.fresh.flatMap((g) => g.items)[0]
    if (!item) return
    expect(() =>
      store.submitReview(
        { itemId: item.item_id, correct: true, confidence: 50, timeSpent: 5 },
        new Date(2026, 10, 3, 23, 45),
      ),
    ).toThrow(/夜间模式/)
  })
})
