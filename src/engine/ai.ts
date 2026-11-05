import type { AISettings } from './types'
import { vault } from './byokVault'

async function chat(
  ai: AISettings,
  messages: { role: 'system' | 'user'; content: string }[],
  json: boolean,
): Promise<string> {
  if (!ai.enabled || !vault.isHandle(ai.apiKey) || !vault.has(ai.apiKey)) throw new Error('AI 诊断未开启，或密钥已锁定：请在设置页重新输入 API Key / 输入解锁口令')
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 45000)
  try {
    const res = await vault.secureFetch(`${ai.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: vault.authHeaders(ai.apiKey).Authorization,
      },
      body: JSON.stringify({
        model: ai.model,
        temperature: 0.2,
        messages,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`AI 接口返回 ${res.status}${text ? `：${text.slice(0, 120)}` : ''}`)
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('AI 返回为空')
    return content
  } finally {
    window.clearTimeout(timer)
  }
}

/** 设置页的连通性测试：只发一条最小请求，不接触学习数据。 */
export async function testAI(ai: AISettings): Promise<string> {
  const content = await chat(
    ai,
    [
      { role: 'system', content: '你是一个接口连通性检查器。' },
      { role: 'user', content: '只回复“连接正常”四个字。' },
    ],
    false,
  )
  return content.trim().slice(0, 40)
}


/** 兼容部分 OpenAI 兼容网关：即使开了 json_object，也可能包一层 ```json。 */
function parseJSONLoose(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(text)
}

/** 点评批注：只指出抓住/遗漏并追问，不重写批注。 */
export async function aiCritiqueAnnotation(
  ai: AISettings,
  input: { title: string; text: string; annotation: string },
): Promise<string> {
  const content = await chat(
    ai,
    [
      {
        role: 'system',
        content:
          '你是语文精读教练。你只点评学生的批注，不重写批注、不提供“更好的批注”示范、不总结全文。' +
          '输出 100–160 字：先指出这条批注抓住了什么（引用批注里的词），再指出它遗漏或含糊的一点，最后提一个具体追问。' +
          '禁止出现“可以这样写”“建议改为”之类的代写句式。',
      },
      {
        role: 'user',
        content: `篇目：${input.title}\n原文：${input.text}\n学生批注：${input.annotation}`,
      },
    ],
    false,
  )
  if (/可以这样写|建议改为|改写为|更好的批注是/.test(content)) {
    throw new Error('AI 输出越过了“不代写”红线，已丢弃')
  }
  return content.trim()
}

export interface AIDiagnosis {
  sentence_tags: { text: string; tag: string; note?: string }[]
  breakpoints: { type: string; where: string; issue: string; probe: string }[]
  summary: { claim_clear: boolean; evidence_count: number; reasoning_steps: number }
}

function validateDiagnosis(raw: unknown): AIDiagnosis {
  const o = raw as AIDiagnosis
  if (!o || !Array.isArray(o.sentence_tags) || !Array.isArray(o.breakpoints) || !o.summary) {
    throw new Error('诊断 JSON 缺少字段')
  }
  const allowed = new Set(['观点', '论据', '推理', '让步', '反驳', '过渡', '结论'])
  for (const s of o.sentence_tags) {
    if (!s || typeof s.text !== 'string' || !allowed.has(s.tag)) throw new Error('逐句标注不合法')
  }
  for (const b of o.breakpoints) {
    if (!b || !b.type || !b.where || !b.issue || !b.probe) throw new Error('断点缺少追问')
    if (!/[？?]$/.test(b.probe.trim())) throw new Error('断点没有以追问结尾')
  }
  const forbidden = /可以这样写|建议改为|改写为|示范如下/
  const all = JSON.stringify(o)
  if (forbidden.test(all)) throw new Error('诊断越过了“不代写”红线')
  if (typeof o.summary.claim_clear !== 'boolean') throw new Error('summary 不合法')
  return o
}

/** 写作诊断：结构化 JSON，失败重试一次；仍失败就报错，不降级为自由文本。 */
export async function aiDiagnoseWriting(
  ai: AISettings,
  input: { prompt: string; material: string; body: string },
): Promise<AIDiagnosis> {
  const system =
    '你是议论文写作教练，职责是诊断，不是代写。逐句标注：观点/论据/推理/让步/反驳/过渡/结论。' +
    '找结构断点：论据未接住观点、推理跳跃、表述含糊、缺过渡；每条断点必须附一个以问号结尾的追问。' +
    '严禁输出完整改写句、严禁“可以这样写”示范。只输出 JSON，格式：' +
    '{"sentence_tags":[{"text":"原句","tag":"观点","note":"..."}],' +
    '"breakpoints":[{"type":"推理跳跃","where":"第2句后","issue":"...","probe":"..."}],' +
    '"summary":{"claim_clear":true,"evidence_count":1,"reasoning_steps":1}}'
  const user = `题目：${input.prompt}\n材料：${input.material}\n学生段落：${input.body}`
  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ]

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = await chat(ai, messages, true)
      return validateDiagnosis(parseJSONLoose(content))
    } catch (e) {
      if (attempt === 0) continue
      throw e instanceof Error ? e : new Error('诊断失败')
    }
  }
  throw new Error('诊断失败')
}

/* ---------- 学习监测与能力诊断 ---------- */

export interface AIDailyReview {
  comment: string
  focus: string
}

function validateDaily(raw: unknown): AIDailyReview {
  const o = raw as AIDailyReview
  if (!o || typeof o.comment !== 'string' || typeof o.focus !== 'string') {
    throw new Error('复盘 JSON 缺少字段')
  }
  const comment = o.comment.trim()
  const focus = o.focus.trim()
  if (comment.length < 20 || comment.length > 260) throw new Error('复盘长度不合法')
  if (focus.length < 4 || focus.length > 60) throw new Error('明日焦点不合法')
  if (/满分|一定能|保证|彻底解决/.test(comment + focus)) throw new Error('复盘出现了过度承诺')
  return { comment, focus }
}

/** 每日复盘：只根据当天数据说事实、一个观察、一个明日动作。 */
export async function aiDailyReview(
  ai: AISettings,
  input: {
    date: string
    done: number
    correct: number
    minutes: number
    note: string
    weakest: string
    queue_left: number
    streak: number
    drafts?: number
    annotations?: number
  },
): Promise<AIDailyReview> {
  const system =
    '你是学习监测器，不是鼓励师，也不是答题器。只根据用户给出的当天数据说话。' +
    '输出 90–150 字：第一句说今天实际完成了什么（引用数字）；第二句指出一个具体观察（完成度、正确率、时间或笔记质量）；' +
    '第三句给明天一个可执行动作。不要复述全部统计，不要空泛表扬，不要给题目答案，不要替用户总结知识。' +
    '如果完成很少，直接说少，不要用鼓励话补偿。只输出 JSON：{"comment":"...","focus":"明天的一个动作，20字内"}'
  const content = await chat(
    ai,
    [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(input) },
    ],
    true,
  )
  return validateDaily(parseJSONLoose(content))
}

export interface AIAbilityReport {
  summary: string
  strengths: string[]
  gaps: string[]
  actions: string[]
  data_note: string
}

function validateAbilityReport(raw: unknown): AIAbilityReport {
  const o = raw as AIAbilityReport
  if (!o || typeof o.summary !== 'string' || !Array.isArray(o.strengths) || !Array.isArray(o.gaps) || !Array.isArray(o.actions) || typeof o.data_note !== 'string') {
    throw new Error('能力诊断 JSON 缺少字段')
  }
  const clean = (xs: unknown[]) =>
    xs.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
  const strengths = clean(o.strengths).slice(0, 3)
  const gaps = clean(o.gaps).slice(0, 3)
  const actions = clean(o.actions).slice(0, 3)
  if (o.summary.trim().length < 40 || o.summary.trim().length > 500) throw new Error('诊断摘要长度不合法')
  if (!gaps.length || !actions.length) throw new Error('诊断缺少薄弱点或行动')
  if (o.data_note.trim().length < 6) throw new Error('诊断缺少证据说明')
  if (/满分|一定能|保证提分|智商|天赋/.test(JSON.stringify(o))) throw new Error('诊断出现了过度判断')
  return { summary: o.summary.trim(), strengths, gaps, actions, data_note: o.data_note.trim() }
}

/** 能力诊断：把本地算好的证据交给 AI 解释，不允许它发明数据。 */
export async function aiAbilityDiagnosis(
  ai: AISettings,
  input: {
    profile: unknown
    mistakes: { model: string; question: string; user_answer: string; correct: string }[]
    daily_notes: string[]
  },
): Promise<AIAbilityReport> {
  const payload = JSON.stringify(input).slice(0, 9000)
  const system =
    '你是语文能力诊断师。你只能解释输入里的数据，不能编造分数、排名、题目或个人经历。' +
    '能力指数是行为证据的压缩，不是考试分数；样本少时必须明说“证据不足”。' +
    '不要给完整范文、完整答案或知识点长篇总结；不要承诺提分。' +
    '输出 JSON：{"summary":"120–220字，指出当前能力结构与最主要矛盾",' +
    '"strengths":["最多3条，必须有数据依据"],"gaps":["最多3条，具体到能力维度或题型"],' +
    '"actions":["最多3条，每条是下周可执行的动作，15–40字"],' +
    '"data_note":"一句话说明这份诊断依据了多少条作答/多少天记录"}'
  const content = await chat(
    ai,
    [
      { role: 'system', content: system },
      { role: 'user', content: payload },
    ],
    true,
  )
  return validateAbilityReport(parseJSONLoose(content))
}

/** 错题追问：只指出冲突并追问，不给答案。 */
export async function aiProbe(
  ai: AISettings,
  input: { model: string; definition: string; question: string; userAnswer: string; correct: string },
): Promise<string> {
  const content = await chat(
    ai,
    [
      {
        role: 'system',
        content:
          '你是苏格拉底式语文教练。只做两件事：指出学生答案与题面或定义冲突的一个具体点；提一个能让他自己修正的问题。' +
          '禁止给出正确答案、完整解析、范文或总结。总长 60–120 字，最后必须是问句。',
      },
      { role: 'user', content: JSON.stringify(input) },
    ],
    false,
  )
  if (/正确答案是|答案是|应选|解析如下/.test(content)) {
    throw new Error('AI 输出越过了“不代输出”红线，已丢弃')
  }
  return content.trim()
}

/** 变式生成的 AI 输出结构 */
interface VariantRaw {
  variants?: {
    question?: unknown
    options?: { text?: unknown; is_correct?: unknown; explain?: unknown }[]
    insight?: unknown
  }[]
}

function validateVariantRaw(raw: unknown): { question: string; options: { text: string; is_correct: boolean; explain: string }[]; insight: string }[] {
  const o = raw as VariantRaw
  if (!o || !Array.isArray(o.variants) || o.variants.length === 0) {
    throw new Error('变式 JSON 缺少 variants')
  }
  return o.variants.map((v) => {
    if (!v || typeof v.question !== 'string' || !Array.isArray(v.options)) {
      throw new Error('变式题目结构不合法')
    }
    const options = v.options.map((opt) => ({
      text: String(opt?.text ?? ''),
      is_correct: opt?.is_correct === true,
      explain: String(opt?.explain ?? ''),
    }))
    return {
      question: v.question,
      options,
      insight: typeof v.insight === 'string' ? v.insight : '',
    }
  })
}

/**
 * 变式生成：按模型定义出新壳。生成后仍需 lintVariantDraft 质检 + 人工确认，
 * AI 只负责出题，不负责判定“入库”。
 */
export async function aiGenerateVariants(
  ai: AISettings,
  model: { tag: string; name: string; definition: string; keyPoints: string[]; commonErrors: string[] },
  samples: { question: string }[],
): Promise<{ question: string; options: { text: string; is_correct: boolean; explain: string }[]; insight: string }[]> {
  const system =
    '你是语文训练站的出题引擎。基于给定的“模型”（一个可迁移的语文判断模式）生成 3 道变式选择题：' +
    '同一模型、不同的语言材料与语境（换壳不换核），不与给定示例重复。' +
    '每道题 4 个选项，恰好 1 个正确；每个选项都给一句解析（正确项说为什么对，干扰项说在哪个维度偏了）。' +
    '题干 15–120 字，不得出现“答案是/正确答案/应选”等自曝句式。' +
    '只输出 JSON：{"variants":[{"question":"...","options":[{"text":"...","is_correct":true,"explain":"..."}],"insight":"这道题在考模型要点中的哪一条"}]}'
  const user = JSON.stringify({
    模型: { tag: model.tag, 名称: model.name, 定义: model.definition, 考查要点: model.keyPoints, 常见错误: model.commonErrors },
    已有示例_禁止重复: samples,
  })
  let content: string
  try {
    content = await chat(ai, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], true)
  } catch {
    // 与写作诊断同策略：JSON 模式失败重试一次
    content = await chat(ai, [
      { role: 'system', content: system + ' 只输出 JSON，不要任何解释文字。' },
      { role: 'user', content: user },
    ], false)
  }
  return validateVariantRaw(parseJSONLoose(content))
}
