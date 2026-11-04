export type LocalTag = '观点' | '论据' | '推理' | '让步' | '反驳' | '过渡' | '结论'

export interface LocalSentence {
  text: string
  tag: LocalTag
}

export interface LocalBreakpoint {
  type: string
  where: string
  issue: string
  probe: string
}

export interface LocalScan {
  sentences: LocalSentence[]
  breakpoints: LocalBreakpoint[]
  summary: { claim_clear: boolean; evidence_count: number; reasoning_steps: number; transitions: number }
}

function splitSentences(body: string): string[] {
  return body
    .replace(/\n+/g, ' ')
    .split(/(?<=[。！？；])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function classify(sentence: string, index: number, total: number): LocalTag {
  if (/总之|由此可见|综上|因此，?我们|所以，?我/.test(sentence) && index >= total - 2) return '结论'
  if (/当然|诚然|固然|不可否认|退一步/.test(sentence)) return '让步'
  if (/但是|然而|相反|恰恰|问题在于|可是|不过/.test(sentence)) return '反驳'
  if (/例如|比如|数据显示|研究表明|调查|据统计|据.{0,8}显示|曾经|有一次|以.{1,8}为例/.test(sentence)) return '论据'
  if (/因此|所以|可见|这意味着|究其原因|正是因为|这说明|由此/.test(sentence)) return '推理'
  if (/应该|应当|必须|需要|我认为|笔者认为|我们要|真正的|与其/.test(sentence)) return '观点'
  if (index === 0) return '观点'
  if (/首先|其次|再次|最后|另一方面|更重要的是|进一步说/.test(sentence)) return '过渡'
  return '论据'
}

export function scanWriting(body: string): LocalScan {
  const raw = splitSentences(body)
  const sentences = raw.map((text, i) => ({ text, tag: classify(text, i, raw.length) }))
  const tags = new Set(sentences.map((s) => s.tag))
  const breakpoints: LocalBreakpoint[] = []

  if (sentences.length === 0) {
    return {
      sentences,
      breakpoints: [
        {
          type: '没有可诊断的段落',
          where: '全文',
          issue: '还没有写出完整的句子，无法判断结构。',
          probe: '你先把“我认为什么”写成一句完整的话，好吗？',
        },
      ],
      summary: { claim_clear: false, evidence_count: 0, reasoning_steps: 0, transitions: 0 },
    }
  }

  if (!tags.has('论据')) {
    breakpoints.push({
      type: '论据未接住观点',
      where: '观点之后',
      issue: '有判断，但没有可核验的事实、例子或数据来支撑它。',
      probe: '你能补一个别人可以查证的具体例子吗？它对应观点的哪一半？',
    })
  }
  if (!tags.has('推理')) {
    breakpoints.push({
      type: '推理跳跃',
      where: '论据与观点之间',
      issue: '例子和观点并排放着，缺少“这个例子说明了什么”的那一步。',
      probe: '从你的例子到你的观点，中间那一步凭什么成立？',
    })
  }
  if (tags.has('让步') && !tags.has('反驳')) {
    breakpoints.push({
      type: '让步未收束',
      where: '让步之后',
      issue: '你承认了对方的一点，但没有把立场收回来。',
      probe: '让这一步之后，哪一句能说明“所以我的观点仍然成立”？',
    })
  }
  if (sentences.length >= 3 && !tags.has('过渡')) {
    breakpoints.push({
      type: '过渡缺失',
      where: '句与句之间',
      issue: '句子各自成立，但读者不知道它们为什么按这个顺序出现。',
      probe: '第二句和第一句之间，是并列、递进还是转折？用一个词标出来，好吗？',
    })
  }
  const long = sentences.find((s) => s.text.length > 90)
  if (long) {
    breakpoints.push({
      type: '句子过长',
      where: `「${long.text.slice(0, 18)}……」`,
      issue: '一句话里塞了多个判断，读者难以看出主次。',
      probe: '这句话里最重要的一件事是什么？其余部分是在修饰它，还是另一个判断？',
    })
  }
  if (body.replace(/\s/g, '').length < 150) {
    breakpoints.push({
      type: '篇幅不足',
      where: '全文',
      issue: '论点段还没有展开到能检验结构的长度。',
      probe: '你能把“因为什么”和“所以怎样”各补一句，而不是只加形容词吗？',
    })
  }

  return {
    sentences,
    breakpoints,
    summary: {
      claim_clear: sentences[0]?.tag === '观点',
      evidence_count: sentences.filter((s) => s.tag === '论据').length,
      reasoning_steps: sentences.filter((s) => s.tag === '推理').length,
      transitions: sentences.filter((s) => s.tag === '过渡').length,
    },
  }
}

export function sentenceDiff(prev: string, next: string): { added: string[]; removed: string[] } {
  const p = new Set(splitSentences(prev))
  const n = new Set(splitSentences(next))
  return {
    added: [...n].filter((s) => !p.has(s)),
    removed: [...p].filter((s) => !n.has(s)),
  }
}
