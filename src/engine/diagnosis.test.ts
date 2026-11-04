import { describe, expect, it } from 'vitest'
import type { DB, Review } from './types'
import { buildSeedDB } from '../content/seed'
import {
  abilityOf,
  buildAbilityProfile,
  dailyPicks,
  dailyStreak,
  explainItem,
  recentMistakes,
  todayStats,
} from './diagnosis'
import { dayKey } from './util'

const NOW = new Date('2026-11-03T12:00:00+08:00')

function review(partial: Partial<Review> & Pick<Review, 'item_id' | 'model_tag'>): Review {
  return {
    review_id: `rv-${Math.random().toString(36).slice(2)}`,
    variant_level: 1,
    timestamp: NOW.toISOString(),
    rating: 'good',
    correct: true,
    confidence: 50,
    error_tag: null,
    time_spent: 30,
    fsrs_state: null,
    ...partial,
  }
}

function dbWith(reviews: Review[]): DB {
  const db = buildSeedDB()
  db.reviews = reviews
  return db
}

describe('能力归属与空档案', () => {
  it('model_tag 能归到六个能力维度', () => {
    expect(abilityOf('cloze.程度.确定性')).toBe('cloze')
    expect(abilityOf('argument.fallacy.hasty')).toBe('argument')
    expect(abilityOf('classical.虚词.之')).toBe('classical')
    expect(abilityOf('appreciation.意象')).toBe('appreciation')
    expect(abilityOf('syntax.断句')).toBe('syntax')
    expect(abilityOf('writing.结构')).toBe('writing')
    expect(abilityOf('foundation.semantic')).toBe('cloze')
    expect(abilityOf('foundation.coherence')).toBe('argument')
    expect(abilityOf('unknown.tag')).toBeNull()
  })

  it('完全没有作答时不给综合分，六个维度都标证据不足', () => {
    const p = buildAbilityProfile(buildSeedDB(), NOW)
    expect(p.overall_index).toBeNull()
    expect(p.overall_label).toBe('证据不足')
    expect(p.focus).toBeNull()
    expect(p.dimensions).toHaveLength(6)
    expect(p.dimensions.every((d) => d.index === null)).toBe(true)
    expect(p.evidence_confidence).toBe('low')
  })
})

describe('能力指数', () => {
  it('单一维度有证据时只给单项指数，不伪造综合分', () => {
    const db = dbWith([
      review({ item_id: 'c-tech-attention-b1', model_tag: 'cloze.程度.确定性' }),
      review({ item_id: 'c-tech-attention-b6', model_tag: 'cloze.模态.义务', correct: false }),
      review({ item_id: 'c-short-video-b2', model_tag: 'cloze.否定.强度' }),
      review({ item_id: 'c-short-video-b5', model_tag: 'cloze.范围.边界' }),
    ])
    const p = buildAbilityProfile(db, NOW)
    const cloze = p.dimensions.find((d) => d.key === 'cloze')!
    expect(cloze.reviews_30).toBe(4)
    expect(cloze.accuracy_30).toBe(0.75)
    expect(cloze.models_touched).toBe(4)
    expect(cloze.index).not.toBeNull()
    expect(cloze.index!).toBeGreaterThan(0)
    expect(p.overall_index).toBeNull()
    expect(p.scored_dimensions).toBe(1)
  })

  it('两个维度有证据才出综合分，并能指出最弱项', () => {
    const db = dbWith([
      review({ item_id: 'c-tech-attention-b1', model_tag: 'cloze.程度.确定性' }),
      review({ item_id: 'c-tech-attention-b6', model_tag: 'cloze.模态.义务' }),
      review({ item_id: 'a-feedback-s1', model_tag: 'argument.structure', correct: false }),
      review({ item_id: 'a-feedback-s2', model_tag: 'argument.structure', correct: false }),
    ])
    for (const tag of ['cloze.程度.确定性', 'cloze.模态.义务']) {
      db.models[tag].mastery_level = 2
      db.models[tag].calib_bias = 0
    }
    for (const tag of ['argument.structure']) {
      db.models[tag].mastery_level = 1
      db.models[tag].calib_bias = 30
    }
    const p = buildAbilityProfile(db, NOW)
    expect(p.overall_index).not.toBeNull()
    expect(p.scored_dimensions).toBe(2)
    expect(p.weakest?.key).toBe('argument')
    expect(p.strongest?.key).toBe('cloze')
    expect(p.focus?.key).toBe('argument')
  })

  it('样本少于 5 条时偏差为 null', () => {
    const db = dbWith([
      review({ item_id: 'c-tech-attention-b1', model_tag: 'cloze.程度.确定性', confidence: 90 }),
      review({ item_id: 'c-tech-attention-b6', model_tag: 'cloze.模态.义务', confidence: 90, correct: false }),
    ])
    const p = buildAbilityProfile(db, NOW)
    expect(p.dimensions.find((d) => d.key === 'cloze')!.bias_30).toBeNull()
  })
})

describe('今日监测、日课与错题反查', () => {
  it('今日统计只算当天，minutes 四舍五入', () => {
    const db = dbWith([
      review({ item_id: 'c-tech-attention-b1', model_tag: 'cloze.程度.确定性', time_spent: 90 }),
      review({ item_id: 'c-tech-attention-b2', model_tag: 'cloze.范围.边界', correct: false, time_spent: 60 }),
      review({
        item_id: 'c-tech-attention-b3',
        model_tag: 'cloze.转折.让步',
        timestamp: '2026-11-02T12:00:00+08:00',
      }),
    ])
    db.daily.push({
      date: dayKey(NOW),
      word_id: 'x',
      imagery_id: 'y',
      technique_id: 'z',
      note: '今天注意到“未必”不是“不会”。',
      created_at: NOW.toISOString(),
    })
    const s = todayStats(db, NOW)
    expect(s.done).toBe(2)
    expect(s.correct).toBe(1)
    expect(s.accuracy).toBe(0.5)
    expect(s.minutes).toBe(3)
    expect(s.has_note).toBe(true)
    expect(dailyStreak(db, NOW)).toBe(1)
  })

  it('同一天的三样固定，换一天会变；日课连续天数只认写过一句的日子', () => {
    const a = dailyPicks(NOW)
    const b = dailyPicks(new Date('2026-11-03T23:00:00+08:00'))
    expect(a.word.id).toBe(b.word.id)
    const db = buildSeedDB()
    for (const date of ['2026-11-01', '2026-11-02', '2026-11-03']) {
      db.daily.push({
        date,
        word_id: a.word.id,
        imagery_id: a.imagery.id,
        technique_id: a.technique.id,
        note: '一句足够长的具体观察，用于测试连续日课。',
        created_at: NOW.toISOString(),
      })
    }
    expect(dailyStreak(db, NOW)).toBe(3)
  })

  it('错题能反查出题面、正确答案与模型名', () => {
    const db = buildSeedDB()
    const item = db.items['c-tech-attention-b1']
    const card = explainItem(db, item)
    expect(card?.question).toBeTruthy()
    expect(card?.correct).toBeTruthy()
    expect(card?.model_name).toBeTruthy()
    const r = review({ item_id: item.item_id, model_tag: item.model_tag, correct: false, answer: '也许' })
    db.reviews = [r]
    const list = recentMistakes(db)
    expect(list).toHaveLength(1)
    expect(list[0].review.answer).toBe('也许')
    expect(list[0].correct.length).toBeGreaterThan(0)
  })
})
