import { describe, expect, it } from 'vitest'
import { CLOZE_TEXTS } from './cloze'
import { ARGUMENT_PASSAGES } from './argument'
import { CLASSICAL_ENTRIES } from './classical'
import { IMAGERY, READINGS, TECHNIQUES } from './appreciation'
import { PUNCTUATION_SENTENCES, SYNTAX_SENTENCES } from './syntax'
import { WRITING_PROMPTS } from './writing'
import { FOUNDATION_COHERENCE, FOUNDATION_SEMANTIC } from './foundation'
import { MODEL_MAP, MODELS } from './models'
import { buildSeedDB, unknownModelTags } from './seed'
import { FALLACIES, STRUCTURE_TAGS } from '../engine/types'

const CLASSICAL_WORDS_18 = ['而', '何', '乎', '乃', '其', '且', '若', '所', '为', '焉', '也', '以', '因', '于', '与', '则', '者', '之']

describe('T1 挖词内容', () => {
  it('每段都有 6–8 空，标记与 blank 一一对应', () => {
    expect(CLOZE_TEXTS.length).toBe(5)
    for (const text of CLOZE_TEXTS) {
      expect(text.blanks.length).toBeGreaterThanOrEqual(6)
      expect(text.blanks.length).toBeLessThanOrEqual(8)
      const markers = [...text.text.matchAll(/\{\{(.+?)\}\}/g)].map((m) => m[1])
      expect(markers.sort()).toEqual(text.blanks.map((b) => b.id).sort())
      expect(new Set(markers).size).toBe(markers.length)
    }
  })

  it('每空 5 个不重复候选，含正确答案且正确项标“原文”', () => {
    for (const text of CLOZE_TEXTS) {
      for (const blank of text.blanks) {
        expect(blank.candidates.length).toBe(5)
        const words = blank.candidates.map((c) => c.text)
        expect(new Set(words).size).toBe(5)
        expect(words).toContain(blank.word)
        const correct = blank.candidates.filter((c) => c.text === blank.word)
        expect(correct.length).toBe(1)
        expect(correct[0].transform).toBe('原文')
      }
    }
  })

  it('evidence 必须在“填回答案后的原文”里逐字出现', () => {
    for (const text of CLOZE_TEXTS) {
      const filled = text.text.replace(/\{\{(.+?)\}\}/g, (_, id: string) => {
        const blank = text.blanks.find((b) => b.id === id)
        return blank?.word ?? `{{${id}}}`
      })
      for (const blank of text.blanks) {
        expect(filled).toContain(blank.evidence)
        expect(blank.why.length).toBeGreaterThan(10)
        expect(MODEL_MAP.get(blank.model_tag)).toBeTruthy()
        if (blank.axis) expect(blank.axis.length).toBeGreaterThanOrEqual(2)
      }
    }
  })
})

describe('T2 论证内容', () => {
  it('5 篇、每篇 4 个判断句、至少 2 类谬误', () => {
    expect(ARGUMENT_PASSAGES.length).toBe(5)
    for (const passage of ARGUMENT_PASSAGES) {
      expect(passage.sentences.length).toBeGreaterThanOrEqual(5)
      expect(passage.options.length).toBe(4)
      const fallacies = new Set(passage.options.filter((o) => !o.is_correct).map((o) => o.fallacy))
      expect(fallacies.size).toBeGreaterThanOrEqual(2)
      expect(passage.options.filter((o) => o.is_correct).length).toBeLessThanOrEqual(2)
    }
  })

  it('逐句结构标签合法，选项 evidence 能回指原文', () => {
    for (const passage of ARGUMENT_PASSAGES) {
      const full = passage.sentences.map((s) => s.text).join('')
      for (const s of passage.sentences) {
        expect(STRUCTURE_TAGS).toContain(s.tag)
        expect(s.note.length).toBeGreaterThan(2)
      }
      for (const o of passage.options) {
        expect(full).toContain(o.evidence)
        if (o.is_correct) expect(o.fallacy).toBeNull()
        else {
          expect(o.fallacy).not.toBeNull()
          expect(FALLACIES).toContain(o.fallacy)
        }
        expect(o.explain.length).toBeGreaterThan(8)
      }
    }
  })

  it('六类谬误全部出现在干扰项里', () => {
    const used = new Set(ARGUMENT_PASSAGES.flatMap((p) => p.options.filter((o) => !o.is_correct).map((o) => o.fallacy)))
    for (const f of FALLACIES) expect(used.has(f)).toBe(true)
  })
})

describe('T3 文言内容', () => {
  it('42 条：18 个虚词全覆盖 + 18 个实词', () => {
    expect(CLASSICAL_ENTRIES.length).toBe(42)
    const xu = CLASSICAL_ENTRIES.filter((e) => e.type === '虚词')
    const shi = CLASSICAL_ENTRIES.filter((e) => e.type === '实词')
    expect(shi.length).toBe(18)
    for (const w of CLASSICAL_WORDS_18) expect(xu.some((e) => e.word === w)).toBe(true)
  })

  it('每条都有出处、例句、翻译，例句含目标词，回译含空位', () => {
    for (const e of CLASSICAL_ENTRIES) {
      expect(e.source.trim().length).toBeGreaterThan(0)
      expect(e.example).toContain(`{{${e.word}}}`)
      expect(e.translation.length).toBeGreaterThan(3)
      expect(e.question.length).toBeGreaterThan(3)
      expect(e.answer.length).toBeGreaterThan(0)
      expect(MODEL_MAP.get(e.model_tag)).toBeTruthy()
      if (e.production) {
        expect(e.production).toContain('____')
        expect(e.production_answer?.length ?? 0).toBeGreaterThan(0)
      }
    }
  })
})

describe('T5 / T6 / T4 内容', () => {
  it('手法 30、意象 40、精读 4，字段齐全', () => {
    expect(TECHNIQUES.length).toBe(30)
    expect(IMAGERY.length).toBe(40)
    expect(READINGS.length).toBe(4)
    expect(new Set(TECHNIQUES.map((t) => t.id)).size).toBe(30)
    expect(new Set(IMAGERY.map((i) => i.id)).size).toBe(40)
    for (const t of TECHNIQUES) {
      expect(t.signals.length).toBeGreaterThan(3)
      expect(t.effect.length).toBeGreaterThan(5)
      expect(t.example.length).toBeGreaterThan(5)
    }
    for (const i of IMAGERY) {
      expect(i.emotion.length).toBeGreaterThan(1)
      expect(i.example.length).toBeGreaterThan(5)
    }
    for (const r of READINGS) {
      expect(r.text.length).toBeGreaterThan(20)
      expect(r.prompt.length).toBeGreaterThan(5)
    }
  })

  it('主干题 6 道，正确主干在选项里；断句 5 题，断点升序且依据等长', () => {
    expect(SYNTAX_SENTENCES.length).toBe(6)
    for (const s of SYNTAX_SENTENCES) {
      expect(s.options.length).toBe(4)
      expect(new Set(s.options).size).toBe(4)
      expect(s.options).toContain(s.trunk)
      expect(s.explain.length).toBeGreaterThan(8)
    }
    expect(PUNCTUATION_SENTENCES.length).toBe(5)
    for (const p of PUNCTUATION_SENTENCES) {
      expect(p.breaks.length).toBeGreaterThan(0)
      expect(p.breaks.length).toBe(p.reasons.length)
      expect([...p.breaks].sort((a, b) => a - b)).toEqual(p.breaks)
      for (const b of p.breaks) expect(b).toBeGreaterThan(0)
      for (const b of p.breaks) expect(b).toBeLessThan(p.raw.length)
      expect(p.translation.length).toBeGreaterThan(5)
      expect(p.source.length).toBeGreaterThan(2)
    }
  })

  it('写作 6 题，有材料、任务、意图，无范文字段', () => {
    expect(WRITING_PROMPTS.length).toBe(6)
    for (const p of WRITING_PROMPTS) {
      expect(p.material.length).toBeGreaterThan(20)
      expect(p.task.length).toBeGreaterThan(10)
      expect(p.intent.length).toBeGreaterThan(10)
      expect('sample' in p).toBe(false)
    }
  })
})

describe('基本功：辨异与重组', () => {
  it('辨异 10 题：两个词都能进句子，答案只有一个，语义轴说得清', () => {
    expect(FOUNDATION_SEMANTIC.length).toBe(10)
    expect(new Set(FOUNDATION_SEMANTIC.map((s) => s.id)).size).toBe(10)
    for (const s of FOUNDATION_SEMANTIC) {
      expect(s.context.split('____').length).toBe(2)
      expect(s.a).not.toBe(s.b)
      expect(['a', 'b']).toContain(s.answer)
      expect(s.axis.length).toBeGreaterThan(15)
      expect(s.aNote.length).toBeGreaterThan(8)
      expect(s.bNote.length).toBeGreaterThan(8)
      expect(s.title.length).toBeGreaterThan(2)
      expect(s.model_tag).toBe('foundation.semantic')
    }
  })

  it('重组 6 题：句子 id 唯一，正确顺序覆盖全部句子', () => {
    expect(FOUNDATION_COHERENCE.length).toBe(6)
    for (const c of FOUNDATION_COHERENCE) {
      const ids = c.sentences.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(c.sentences.length).toBeGreaterThanOrEqual(4)
      expect([...c.order].sort()).toEqual([...ids].sort())
      expect(c.logic.length).toBeGreaterThan(15)
      expect(c.model_tag).toBe('foundation.coherence')
    }
  })
})

describe('seed 与模型登记', () => {
  it('seed 条目全部有已登记的 model_tag', () => {
    const db = buildSeedDB()
    const items = Object.values(db.items)
    expect(items.length).toBe(266)
    expect(unknownModelTags(items)).toEqual([])
    expect(Object.keys(db.models).length).toBe(MODELS.length)
    expect(Object.keys(db.models).length).toBe(59)
    expect(new Set(MODELS.map((m) => m.tag)).size).toBe(MODELS.length)
  })

  it('每个条目都有分组、顺序与标题，不是 pending', () => {
    const db = buildSeedDB()
    for (const item of Object.values(db.items)) {
      expect(item.group_id).not.toBe('pending')
      expect(item.content.title).toBeTruthy()
      expect(typeof item.content.order).toBe('number')
      expect(item.model_tag.length).toBeGreaterThan(3)
    }
  })

  it('单条目模型仍能通过队列分区（cloze/argument/classical/appreciation/syntax 均有）', () => {
    const db = buildSeedDB()
    const groups = Object.values(db.items).map((i) => i.group_id)
    for (const g of ['cloze:', 'argument:', 'classical.', 'appreciation.', 'syntax.', 'foundation.']) {
      expect(groups.some((id) => id.startsWith(g))).toBe(true)
    }
  })
})
