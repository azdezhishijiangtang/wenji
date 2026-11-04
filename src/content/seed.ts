import type { DB, Fallacy, Item, ItemType, ModelRecord, Settings } from '../engine/types'
import { emptyModel } from '../engine/mastery'
import { MODEL_MAP, MODELS } from './models'
import { CLOZE_TEXTS } from './cloze'
import { ARGUMENT_PASSAGES } from './argument'
import { CLASSICAL_ENTRIES } from './classical'
import { IMAGERY, TECHNIQUES } from './appreciation'
import { PUNCTUATION_SENTENCES, SYNTAX_SENTENCES } from './syntax'
import { FOUNDATION_COHERENCE, FOUNDATION_SEMANTIC } from './foundation'

export const SEED_VERSION = 1
export const SEED_AT = '2026-01-01T00:00:00.000Z'
export const LOCAL_USER_ID = 'local-user'

export const DEFAULT_SETTINGS: Settings = {
  newItemCap: 12,
  dailyCap: 40,
  desiredRetention: 0.9,
  ai: {
    enabled: false,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  },
}

export const FALLACY_TAG: Record<Fallacy, string> = {
  偷换概念: 'argument.fallacy.equivocation',
  以偏概全: 'argument.fallacy.hasty',
  强加因果: 'argument.fallacy.false_cause',
  无中生有: 'argument.fallacy.fabrication',
  绝对化: 'argument.fallacy.absolutize',
  混淆充要: 'argument.fallacy.necessary_sufficient',
}

function makeItem(
  id: string,
  type: ItemType,
  model_tag: string,
  content: Item['content'],
  group_id: string,
  order: number,
): Item {
  return {
    item_id: id,
    user_id: LOCAL_USER_ID,
    source: 'chinese_site',
    item_type: type,
    model_tag,
    content: { ...content, order },
    status: 'active',
    created_at: SEED_AT,
    first_review_at: null,
    group_id,
    variant_level: 1,
    available_at: null,
    fsrs: null,
  }
}

/** 每 6 张一组，保证“每日新卡 12”不会因为组太大而永远排不进队列。 */
function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function buildItems(): Item[] {
  const items: Item[] = []

  // T1 挖词：每空一个条目，同一段共享 group_id
  CLOZE_TEXTS.forEach((text, ti) => {
    text.blanks.forEach((blank, bi) => {
      items.push(
        makeItem(
          `c-${text.id}-${blank.id}`,
          'cloze_blank',
          blank.model_tag,
          {
            kind: 'cloze',
            textId: text.id,
            blankId: blank.id,
            title: text.title,
            subtitle: `${blank.word_type} · 第 ${bi + 1} 空`,
            group_title: `挖词精读 · ${text.title}`,
            group_subtitle: `${text.blanks.length} 空 · ${text.genre}`,
          },
          `cloze:${text.id}`,
          100 + ti * 10 + bi,
        ),
      )
    })
  })

  // T2 论证：逐句标注 + 干扰项判定，同篇一组
  ARGUMENT_PASSAGES.forEach((passage, pi) => {
    passage.sentences.forEach((s, si) => {
      items.push(
        makeItem(
          `a-${passage.id}-${s.id}`,
          'argument_label',
          'argument.structure',
          {
            kind: 'argument_label',
            passageId: passage.id,
            sentenceId: s.id,
            title: passage.title,
            subtitle: `第 ${si + 1} 句 · 结构标注`,
            group_title: `论证透视 · ${passage.title}`,
            group_subtitle: '先拆结构，再判谬误',
          },
          `argument:${passage.id}`,
          300 + pi * 20 + si,
        ),
      )
    })
    passage.options.forEach((o, oi) => {
      items.push(
        makeItem(
          `ao-${passage.id}-${o.id}`,
          'argument_option',
          o.is_correct ? 'argument.fallacy.faithful' : FALLACY_TAG[o.fallacy!],
          {
            kind: 'argument_option',
            passageId: passage.id,
            optionId: o.id,
            title: passage.title,
            subtitle: `判断句 ${oi + 1} · 谬误判定`,
            group_title: `论证透视 · ${passage.title}`,
            group_subtitle: '先拆结构，再判谬误',
          },
          `argument:${passage.id}`,
          300 + pi * 20 + passage.sentences.length + oi,
        ),
      )
    })
  })

  // T3 文言：认读 + 回译双卡；每 3 个词（6 张）一组
  const classicalPairs: Item[] = CLASSICAL_ENTRIES.map((entry) => {
    const common = {
      kind: 'classical',
      entryId: entry.id,
      word: entry.word,
      sense: entry.sense,
      type: entry.type,
      title: `${entry.word} · ${entry.sense}`,
      group_subtitle: '认读 + 回译 · 每词两卡',
    }
    return [
      makeItem(
        `cl-${entry.id}-rec`,
        'classical_card',
        entry.model_tag,
        { ...common, mode: 'recognition', subtitle: '认读：这句里的它是什么意思？' },
        'pending',
        0,
      ),
      makeItem(
        `cl-${entry.id}-prod`,
        'classical_production',
        entry.model_tag,
        { ...common, mode: 'production', subtitle: '回译：把原词填回去' },
        'pending',
        0,
      ),
    ]
  }).flat()

  chunk(classicalPairs, 6).forEach((group, gi) => {
    const gid = `classical.${String(gi + 1).padStart(2, '0')}`
    group.forEach((item, ii) => {
      item.group_id = gid
      item.content.group_title = `文言词卡 · 第 ${gi + 1} 组`
      item.content.order = 500 + gi * 10 + ii
      items.push(item)
    })
  })

  // T5 鉴赏：手法/意象卡片，每 5 张一组
  const appreciationItems: Item[] = [
    ...TECHNIQUES.map((t) =>
      makeItem(
        `t-${t.id}`,
        'technique_card',
        'appreciation.手法',
        {
          kind: 'technique',
          refId: t.id,
          title: t.name,
          subtitle: '手法卡',
          group_title: '鉴赏积累',
          group_subtitle: '手法与意象',
        },
        'pending',
        0,
      ),
    ),
    ...IMAGERY.map((im) =>
      makeItem(
        `i-${im.id}`,
        'technique_card',
        'appreciation.意象',
        {
          kind: 'imagery',
          refId: im.id,
          title: im.image,
          subtitle: '意象卡',
          group_title: '鉴赏积累',
          group_subtitle: '手法与意象',
        },
        'pending',
        0,
      ),
    ),
  ]

  chunk(appreciationItems, 5).forEach((group, gi) => {
    const gid = `appreciation.${String(gi + 1).padStart(2, '0')}`
    group.forEach((item, ii) => {
      item.group_id = gid
      item.content.group_title = `鉴赏积累 · 第 ${gi + 1} 组`
      item.content.order = 700 + gi * 10 + ii
      items.push(item)
    })
  })

  // 基本功：辨异 10（每 5 个一组） + 重组 6（一组）
  FOUNDATION_SEMANTIC.forEach((s, i) => {
    const g = Math.floor(i / 5) + 1
    items.push(
      makeItem(
        `f-${s.id}`,
        'model_probe',
        s.model_tag,
        {
          kind: 'foundation_semantic',
          refId: s.id,
          title: s.title,
          subtitle: '先选，再写一句为什么',
          group_title: `基本功 · 辨异 ${g}`,
          group_subtitle: '一个词改变句子的边界',
        },
        `foundation.semantic.${g}`,
        20 + i,
      ),
    )
  })
  FOUNDATION_COHERENCE.forEach((c, i) => {
    items.push(
      makeItem(
        `f-${c.id}`,
        'model_probe',
        c.model_tag,
        {
          kind: 'foundation_coherence',
          refId: c.id,
          title: c.title,
          subtitle: '把句子排成一条思路',
          group_title: '基本功 · 重组',
          group_subtitle: '顺序就是思路',
        },
        'foundation.coherence',
        40 + i,
      ),
    )
  })

  // T6 句法：主干 6 + 断句 5，各成一组
  SYNTAX_SENTENCES.forEach((s, i) => {
    items.push(
      makeItem(
        `sy-${s.id}`,
        'syntax_chunk',
        'syntax.主干',
        {
          kind: 'syntax',
          sentenceId: s.id,
          title: s.title,
          subtitle: '找出句子主干',
          group_title: '句法 · 主干',
          group_subtitle: '先删枝叶，再找主谓宾',
        },
        'syntax.main',
        900 + i,
      ),
    )
  })
  PUNCTUATION_SENTENCES.forEach((p, i) => {
    items.push(
      makeItem(
        `pu-${p.id}`,
        'punctuation',
        'syntax.断句',
        {
          kind: 'punctuation',
          punctuationId: p.id,
          title: p.title,
          subtitle: '文言断句',
          group_title: '句法 · 断句',
          group_subtitle: '每个断点都要有依据',
        },
        'syntax.punct',
        960 + i,
      ),
    )
  })

  return items
}

export function buildSeedDB(): DB {
  const items = buildItems()
  const models: Record<string, ModelRecord> = {}
  for (const def of MODELS) models[def.tag] = emptyModel(def, SEED_AT)
  return {
    version: 1,
    seed_version: SEED_VERSION,
    user: { id: LOCAL_USER_ID, name: '你', created_at: SEED_AT },
    items: Object.fromEntries(items.map((i) => [i.item_id, i])),
    reviews: [],
    models,
    settings: { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_SETTINGS.ai } },
    annotations: [],
    drafts: [],
    mastery_events: [],
    daily: [],
    coach_reports: [],
    last_group: null,
  }
}

/** 内容自检用：确保条目挂的 model_tag 都有定义。 */
export function unknownModelTags(items: Item[]): string[] {
  return [...new Set(items.map((i) => i.model_tag).filter((t) => !MODEL_MAP.get(t)))]
}
