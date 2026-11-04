import type { Fallacy, StructureTag } from '../engine/types'

export interface ClozeCandidate {
  text: string
  /** 干扰变换类型；正确项写“原文” */
  transform: '原文' | '绝对化' | '范围扩大' | '范围缩小' | '因果强加' | '程度弱化' | '程度强化' | '转折丢失' | '指代漂移' | '义务降格'
  note?: string
}

export interface ClozeBlank {
  id: string
  word: string
  word_type: string
  model_tag: string
  candidates: ClozeCandidate[]
  /** 原文中包含该词的一整句，用于作答后回指 */
  evidence: string
  why: string
  /** 语义轴两端，答后展示 */
  axis?: string[]
}

export interface ClozeText {
  id: string
  title: string
  subtitle: string
  genre: string
  /** 用 {{blankId}} 标注挖空位置 */
  text: string
  blanks: ClozeBlank[]
}

export interface ArgumentSentence {
  id: string
  text: string
  tag: StructureTag
  note: string
}

export interface ArgumentOption {
  id: string
  text: string
  is_correct: boolean
  fallacy: Fallacy | null
  evidence: string
  explain: string
}

export interface ArgumentPassage {
  id: string
  title: string
  subtitle: string
  sentences: ArgumentSentence[]
  options: ArgumentOption[]
}

export interface ClassicalEntry {
  id: string
  word: string
  sense: string
  type: '虚词' | '实词'
  model_tag: string
  /** 文言例句，用 {{word}} 标出目标词 */
  example: string
  source: string
  translation: string
  /** 认读卡的问题 */
  question: string
  /** 答案（义项短语） */
  answer: string
  /** 产出卡：白话/文言语境，用 ____ 表示空位 */
  production: string | null
  production_answer: string | null
  note: string
}

export interface Technique {
  id: string
  name: string
  definition: string
  signals: string
  effect: string
  example: string
}

export interface Imagery {
  id: string
  image: string
  emotion: string
  example: string
  note: string
}

export interface Reading {
  id: string
  title: string
  author: string
  genre: '诗' | '散文' | '小说'
  text: string
  prompt: string
}

export interface WritingPrompt {
  id: string
  title: string
  material: string
  task: string
  /** 命题意图，写完才展示 */
  intent: string
}

export interface SyntaxSentence {
  id: string
  title: string
  sentence: string
  /** 正确主干，用户从候选里选 */
  trunk: string
  options: string[]
  explain: string
  model_tag: string
}

export interface PunctuationSentence {
  id: string
  title: string
  /** 未加标点的原文 */
  raw: string
  /** 正确的断句位置：在字符之间插入，索引 = 断在该字之后 */
  breaks: number[]
  translation: string
  /** 每个断点的依据，与 breaks 等长 */
  reasons: string[]
  model_tag: string
  source: string
}
