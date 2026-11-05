import { beforeAll, describe, expect, it } from 'vitest'
import type { ExamRecord, FsrsCard, Item, ModelDef, ModelRecord, Review, Settings } from './types'
import { ERROR_TAGS } from './types'
import { applyMastery, emptyModel } from './mastery'
import { buildQueue } from './queue'
import { buildExamPool } from './exam'
import { initScheduler, newCard, reviewCard } from './fsrs'
import { lintVariantDraft, makeVariantItem, type VariantDraft } from './variant'
import { MODELS as MODELS_LIST } from '../content/models'
import { kindOf } from './practice'
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

  it('到期题组装得下就整组放行；放不下且组不超上限时整组跳过，不拆组', () => {
    // 组 A 逾期 5 天排前，组 B 逾期 1 天排后；cap=3 装不下 A+B（4 条）
    const items: Item[] = [
      makeItem('da0', 'ga', 0, { due: addDays(NOW, -5) }),
      makeItem('da1', 'ga', 1, { due: addDays(NOW, -5) }),
      makeItem('db0', 'gb', 0, { due: addDays(NOW, -1) }),
      makeItem('db1', 'gb', 1, { due: addDays(NOW, -1) }),
    ]
    const q = buildQueue({
      items,
      reviews: [],
      models: { 'test.model': makeModel('test.model') },
      settings: { ...SETTINGS, dailyCap: 3 },
      now: NOW,
    })
    // 旧行为会把 B 拆出 1 条凑满 cap=3；新行为保 B 完整，留到下次到期
    expect(q.total_due).toBe(2)
    expect(q.due).toHaveLength(1)
    expect(q.due[0].items.map((i) => i.item_id)).toEqual(['da0', 'da1'])
  })

  it('装满后遇到超过剩余空间的大组：组本身超 dailyCap 才截断，否则整组跳过', () => {
    // A 30 条整组装入后剩 10 空间；B 50 条超 dailyCap=40 → 截断 10 条
    const items: Item[] = []
    for (let i = 0; i < 30; i++) items.push(makeItem(`a${i}`, 'ga', i, { due: addDays(NOW, -3) }))
    for (let i = 0; i < 50; i++) items.push(makeItem(`b${i}`, 'gb', i, { due: addDays(NOW, -1) }))
    const q = buildQueue({
      items,
      reviews: [],
      models: { 'test.model': makeModel('test.model') },
      settings: { ...SETTINGS, dailyCap: 40 },
      now: NOW,
    })
    expect(q.total_due).toBe(40)
    const ga = q.due.find((g) => g.items[0].item_id.startsWith('a'))
    const gb = q.due.find((g) => g.items[0].item_id.startsWith('b'))
    expect(ga?.items.length).toBe(30)
    expect(gb?.items.length).toBe(10)
  })

  it('放不下的整组计入 deferred_groups/deferred_items，静默顺延可被统计', () => {
    const items: Item[] = [
      makeItem('da0', 'ga', 0, { due: addDays(NOW, -5) }),
      makeItem('da1', 'ga', 1, { due: addDays(NOW, -5) }),
      makeItem('db0', 'gb', 0, { due: addDays(NOW, -1) }),
      makeItem('db1', 'gb', 1, { due: addDays(NOW, -1) }),
    ]
    const q = buildQueue({
      items,
      reviews: [],
      models: { 'test.model': makeModel('test.model') },
      settings: { ...SETTINGS, dailyCap: 3 },
      now: NOW,
    })
    expect(q.deferred_groups).toBe(1)
    expect(q.deferred_items).toBe(2)
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

describe('变式：质检与入库', () => {
  const good: VariantDraft = {
    model_tag: 'test.model',
    question: '下列哪一句在“范围”这个维度上偏了？',
    options: [
      { text: '甲（原文）', is_correct: true, explain: '与原文范围一致。' },
      { text: '乙（扩大）', is_correct: false, explain: '把“多数”换成了“全部”，范围扩大。' },
      { text: '丙（缩小）', is_correct: false, explain: '把“多数”换成了“某几个”，范围缩小。' },
      { text: '丁（无关）', is_correct: false, explain: '偷换了话题。' },
    ],
    insight: '考“范围扩大/缩小”这条要点',
  }

  it('合法草稿通过质检', () => {
    expect(lintVariantDraft(good)).toBeNull()
  })

  it('候选不唯一 / 无正确项 / 多正确项 / 题干自曝，全部拦下', () => {
    const dup = { ...good, options: good.options.map((o) => ({ ...o, text: '同样的话' })) }
    expect(lintVariantDraft(dup)).toContain('重复')
    const none = { ...good, options: good.options.map((o) => ({ ...o, is_correct: false })) }
    expect(lintVariantDraft(none)).toContain('恰好一个')
    const many = { ...good, options: good.options.map((o, i) => ({ ...o, is_correct: i < 2 })) }
    expect(lintVariantDraft(many)).toContain('恰好一个')
    const leak = { ...good, question: '正确答案是下面哪一项？' }
    expect(lintVariantDraft(leak)).toContain('自曝')
  })

  it('入库条目挂变式组、variant_level=2，kindOf 归入 variant', () => {
    const model = MODELS_LIST[0]
    const item = makeVariantItem(good, model)
    expect(item.group_id.startsWith(`variant:${good.model_tag}:`)).toBe(true)
    expect(item.variant_level).toBe(2)
    expect(item.item_type).toBe('model_variant')
    expect(kindOf(item)).toBe('variant')
    expect(item.content.options).toHaveLength(4)
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

  it('夜间不派队列，但自选练习仍可写入', () => {
    const item = Object.values(store.getDB().items)[0]
    const before = store.getDB().reviews.length
    const out = store.submitReview(
      { itemId: item.item_id, correct: true, confidence: 50, timeSpent: 5 },
      new Date(2026, 10, 3, 23, 45),
    )
    expect(out.next_due).toBeTruthy()
    expect(store.getDB().reviews.length).toBe(before + 1)
  })

  it('删除本机数据后 localStorage 真正清空，不被种子库写回', () => {
    // 前面的测试已触发过 persist，存档应当存在
    expect(localStorage.getItem('wenyi.db.v1')).not.toBeNull()
    store.deleteEverything()
    // 旧行为：removeItem 后 persist 又把种子库写回，删除变成空操作
    expect(localStorage.getItem('wenyi.db.v1')).toBeNull()
    // 内存里仍有种子库，页面不崩；刷新后 load() 重新出厂
    expect(Object.keys(store.getDB().items).length).toBe(266)
  })

  it('导入带不同 desiredRetention 的备份后，调度器按备份参数工作', async () => {
    const backup = JSON.parse(store.exportJSON()) as {
      settings: { desiredRetention: number }
    }
    backup.settings.desiredRetention = 0.6
    await store.importJSON(JSON.stringify(backup))
    expect(store.getDB().settings.desiredRetention).toBe(0.6)

    // 行为级验证：同输入下 0.6 与 0.9 的首次复习间隔不同
    // （enableFuzz 对同卡是确定性的，已用探针验证）
    const fresh1 = Object.values(store.getDB().items).find((i) => !i.fsrs)!
    const out1 = store.submitReview(
      { itemId: fresh1.item_id, correct: true, confidence: 70, timeSpent: 12 },
      NOW,
    )
    await store.updateSettings({ desiredRetention: 0.9 })
    const fresh2 = Object.values(store.getDB().items).find((i) => !i.fsrs)!
    const out2 = store.submitReview(
      { itemId: fresh2.item_id, correct: true, confidence: 70, timeSpent: 12 },
      NOW,
    )
    expect(out1.next_due).not.toBe(out2.next_due)
  })

  it('组卷：池子只含已学条目，同日种子下两次抽卷一致', () => {
    const db = store.getDB()
    // 手动把 8 条不同条目标记为已学（有 FSRS 卡）
    const victims = Object.values(db.items).filter((i) => !i.fsrs).slice(0, 8)
    for (const v of victims) {
      v.fsrs = fsrsDue(addDays(NOW, -1))
    }
    const pool = buildExamPool(db, NOW, 6)
    expect(pool.items.length).toBeLessThanOrEqual(6)
    expect(pool.items.every((i) => i.fsrs)).toBe(true)
    expect(pool.poolSize).toBeGreaterThanOrEqual(8)
    const again = buildExamPool(db, NOW, 6)
    expect(again.items.map((i) => i.item_id)).toEqual(pool.items.map((i) => i.item_id))
  })

  it('组卷生命周期：开始 → 交卷出分 → 不能重复交/再作废', () => {
    const db = store.getDB()
    const victims = Object.values(db.items).filter((i) => i.fsrs).slice(0, 3)
    // 用一个晚于所有历史作答的时刻开卷，隔离前面测试留下的 review
    const examNow = addDays(NOW, 10)
    const started = store.startExam(victims.map((v) => v.item_id), examNow)
    expect(started).not.toBe('active-exists')
    const exam = started as ExamRecord
    expect(store.activeExam()?.id).toBe(exam.id)
    // 再开一张会被拒绝
    expect(store.startExam(victims.map((v) => v.item_id), examNow)).toBe('active-exists')
    // 模拟答对其中一条
    store.submitReview(
      { itemId: victims[0].item_id, correct: true, confidence: 70, timeSpent: 8 },
      new Date(examNow.getTime() + 60000),
    )
    const done = store.finishExam(exam.id, new Date(examNow.getTime() + 120000))
    expect(done?.score).toEqual({ answered: 1, correct: 1 })
    expect(store.activeExam()).toBeNull()
    expect(store.finishExam(exam.id)).toBeNull()
    expect(store.discardExam(exam.id)).toBe(false)
  })

  it('积累卡：日课建卡、当天不回看、到期出现、转化后顺延', () => {
    store.saveDaily({
      date: dayKey(NOW),
      word_id: 'w1',
      imagery_id: 'i1',
      technique_id: 't1',
      note: '“隐约”和“仿佛”都带不确定，但前者偏向视觉模糊，后者偏向比喻性类比。',
    })
    const db1 = store.getDB()
    const card = db1.accumulations.find((a) => a.source_date === dayKey(NOW))
    expect(card).toBeTruthy()
    expect(card?.fsrs?.dueAt).toBeTruthy()
    // 建卡即错开今天：due 至少在 2 天后，今天不该出现在回看队列
    expect(new Date(card!.fsrs!.dueAt).getTime()).toBeGreaterThan(addDays(NOW, 2).getTime())
    expect(store.dueAccumulations(NOW).some((a) => a.id === card?.id)).toBe(false)
    // 到期次日打开：卡进入回看队列
    const later = new Date(card!.fsrs!.dueAt)
    later.setTime(later.getTime() + 86400000)
    expect(store.dueAccumulations(later).some((a) => a.id === card!.id)).toBe(true)
    // 转化一次：history+1，good 评分把到期日推向更远
    const dueBefore = card!.fsrs!.dueAt
    expect(store.reviewAccumulation(card!.id, '变体', '换成反例：绝对确定的事就不适用“隐约”。', later)).toBe(true)
    const after = store.getDB().accumulations.find((a) => a.id === card!.id)!
    expect(after.history).toHaveLength(1)
    expect(after.history[0].mode).toBe('变体')
    expect(new Date(after.fsrs!.dueAt).getTime()).toBeGreaterThan(new Date(dueBefore).getTime())
  })
})
