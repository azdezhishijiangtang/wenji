/**
 * 变式生成器：AI 按模型定义出新壳，本模块负责质检与入库。
 *
 * 设计约束（对应 mastery.ts 的欠账）：
 * - 掌握度升级原本要求 variant_level 门槛，静态站没有变式生成器只能用
 *   “3 道不同条目”近似；这里补上真正的换壳条目（variant_level: 2）。
 * - AI 生成的一切都必须过 lintVariantDraft 才允许预览，人工确认后才入库；
 *   入库条目走正常队列（FSRS / 掌握度 / 校准全自动），与种子条目无差别。
 */
import type { Item, ModelDef } from './types'
import { uid } from './util'
import { LOCAL_USER_ID } from '../content/seed'

export interface VariantOption {
  text: string
  is_correct: boolean
  explain: string
}

export interface VariantDraft {
  model_tag: string
  question: string
  options: VariantOption[]
  /** 出题人视角：这道变式在考模型的哪一条要点 */
  insight: string
}

/** 红线：题干里不得自曝答案或代写句式（与 ai.ts 的诊断红线同源）。 */
const FORBIDDEN_IN_QUESTION = /答案是|正确答案|应选|解析如下|可以这样写/

export function lintVariantDraft(draft: VariantDraft): string | null {
  if (!draft || typeof draft.question !== 'string') return '题干缺失'
  const q = draft.question.trim()
  if (q.length < 8) return '题干过短'
  if (q.length > 220) return '题干过长（>220 字）'
  if (FORBIDDEN_IN_QUESTION.test(q)) return '题干自曝答案或越过代写红线'
  if (!Array.isArray(draft.options) || draft.options.length < 2 || draft.options.length > 6) {
    return '候选数量不合法（2–6）'
  }
  const texts = draft.options.map((o) => String(o?.text ?? '').trim())
  if (texts.some((t) => !t)) return '存在空候选'
  if (texts.some((t) => t.length > 80)) return '候选过长（>80 字）'
  if (new Set(texts).size !== texts.length) return '候选重复'
  const correct = draft.options.filter((o) => o?.is_correct === true)
  if (correct.length !== 1) return '正确项必须恰好一个'
  if (draft.options.some((o) => typeof o?.explain !== 'string' || !o.explain.trim())) {
    return '存在没有解析的候选'
  }
  if (typeof draft.insight !== 'string' || !draft.insight.trim()) return '缺少考查要点'
  return null
}

export function makeVariantItem(
  draft: VariantDraft,
  model: ModelDef,
  now = new Date(),
): Item {
  return {
    item_id: uid('v'),
    user_id: LOCAL_USER_ID,
    source: 'manual',
    item_type: 'model_variant',
    model_tag: draft.model_tag,
    content: {
      kind: 'variant',
      title: `${model.name} · 变式`,
      subtitle: draft.insight,
      question: draft.question.trim(),
      options: draft.options.map((o) => ({
        text: o.text.trim(),
        is_correct: o.is_correct === true,
        explain: o.explain.trim(),
      })),
      origin: 'ai_generated',
      order: 0,
    },
    status: 'active',
    created_at: now.toISOString(),
    first_review_at: null,
    // 每批一个组：AI 一轮生成 3 道同模型变式，队列里整组出现
    group_id: `variant:${draft.model_tag}:${uid('b')}`,
    variant_level: 2,
    available_at: null,
    fsrs: null,
  }
}
