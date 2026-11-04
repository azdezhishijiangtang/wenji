import { useEffect, useRef, useState } from 'react'
import { PUNCTUATION_SENTENCES, SYNTAX_SENTENCES } from '../content/syntax'
import { allGroups, remainingItems, setActiveGroup, takeActiveGroup } from '../engine/practice'
import { getDB, submitReview } from '../engine/store'
import { useDB, useNow } from '../ui/useDB'
import { ConfidencePicker, Empty, Notice } from '../ui/common'

function go(path: string) {
  window.location.hash = path
}

function segment(raw: string, breaks: number[]): string {
  let prev = 0
  const parts: string[] = []
  for (const b of breaks) {
    parts.push(raw.slice(prev, b))
    prev = b
  }
  parts.push(raw.slice(prev))
  return parts.join(' / ')
}

type Tab = 'main' | 'punct'

export default function Syntax() {
  const db = useDB()
  const now = useNow(30000)
  const readOnly = false // 夜间不派新任务，但自选练习不再锁死

  const boot = useRef<{ tab: Tab; steps: string[] } | null>(null)
  if (!boot.current) {
    const g = takeActiveGroup('syntax', getDB(), now)
    const tab: Tab = g?.id === 'syntax.punct' ? 'punct' : 'main'
    boot.current = {
      tab,
      steps: g ? remainingItems(g, getDB(), now).map((i) => i.item_id) : [],
    }
  }

  const [tab, setTab] = useState<Tab>(boot.current.tab)
  const [steps, setSteps] = useState<string[]>(boot.current.steps)
  const [step, setStep] = useState(0)
  const [confidence, setConfidence] = useState<number | null>(null)
  const [choice, setChoice] = useState('')
  const [marks, setMarks] = useState<number[]>([])
  const [result, setResult] = useState<{ correct: boolean; answer: string } | null>(null)
  const [error, setError] = useState('')
  const startRef = useRef(Date.now())

  useEffect(() => {
    setConfidence(null)
    setChoice('')
    setMarks([])
    setResult(null)
    setError('')
    startRef.current = Date.now()
  }, [step, tab])

  const groups = allGroups(db, 'syntax')
  const groupId = tab === 'main' ? 'syntax.main' : 'syntax.punct'
  const group = groups.find((g) => g.id === groupId)
  const itemId = steps[step]
  const item = itemId ? db.items[itemId] : undefined
  const syntax = SYNTAX_SENTENCES.find((s) => s.id === item?.content.sentenceId)
  const punct = PUNCTUATION_SENTENCES.find((p) => p.id === item?.content.punctuationId)

  function switchTab(t: Tab) {
    const id = t === 'main' ? 'syntax.main' : 'syntax.punct'
    const g = allGroups(getDB(), 'syntax').find((x) => x.id === id)
    setActiveGroup(id)
    setTab(t)
    setSteps(g ? remainingItems(g, getDB(), now).map((i) => i.item_id) : [])
    setStep(0)
  }

  function submitMain(option: string) {
    if (!syntax || !item || readOnly) return
    if (confidence == null) {
      setError('先选把握度。')
      return
    }
    try {
      const correct = option === syntax.trunk
      const res = submitReview({
        itemId: item.item_id,
        correct,
        confidence,
        timeSpent: Math.max(1, Math.round((Date.now() - startRef.current) / 1000)),
        answer: option,
      })
      setChoice(option)
      setResult({ correct, answer: res.mastery_change })
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '写入失败')
    }
  }

  function submitPunct() {
    if (!punct || !item || readOnly) return
    if (confidence == null) {
      setError('先选把握度。')
      return
    }
    if (marks.length === 0) {
      setError('至少标一个断点。一个都不标也是判断，但那样等于整句不断。')
      return
    }
    const correct =
      marks.length === punct.breaks.length && [...marks].sort((a, b) => a - b).every((v, i) => v === punct.breaks[i])
    try {
      const res = submitReview({
        itemId: item.item_id,
        correct,
        confidence,
        timeSpent: Math.max(1, Math.round((Date.now() - startRef.current) / 1000)),
        answer: marks.join(','),
      })
      setResult({ correct, answer: res.mastery_change })
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '写入失败')
    }
  }

  function next() {
    if (step < steps.length - 1) setStep((s) => s + 1)
    else setStep(steps.length)
  }

  if (steps.length === 0 || step >= steps.length) {
    return (
      <div className="page">
        <div className="drill-head">
          <button className="link" onClick={() => go('/')}>← 今日队列</button>
          <span className="tag">句法控制</span>
        </div>
        <div className="tab-bar">
          <button className={tab === 'main' ? 'tab tab--on' : 'tab'} onClick={() => switchTab('main')}>找主干</button>
          <button className={tab === 'punct' ? 'tab tab--on' : 'tab'} onClick={() => switchTab('punct')}>文言断句</button>
        </div>
        <Empty
          title={`${tab === 'main' ? '主干' : '断句'}这一组今天完成了`}
          hint="断句与主干分开排期；每次断句都会挂在 syntax.断句 下，不按题型拆成互不相干的碎片。"
          action={
            <div className="btn-row">
              <button className="btn btn--primary" onClick={() => go('/')}>回今日队列</button>
              <button className="btn" onClick={() => go('/drills')}>换训练器</button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="drill-head">
        <button className="link" onClick={() => go('/')}>← 今日队列</button>
        <span className="tag">句法 · {tab === 'main' ? '主干' : '断句'} · 第 {step + 1}/{steps.length} 题</span>
      </div>

      <div className="tab-bar">
        <button className={tab === 'main' ? 'tab tab--on' : 'tab'} onClick={() => switchTab('main')}>找主干</button>
        <button className={tab === 'punct' ? 'tab tab--on' : 'tab'} onClick={() => switchTab('punct')}>文言断句</button>
      </div>

      {tab === 'main' && syntax && (
        <>
          <h1>{syntax.title}</h1>
          <article className="reading-paper">
            <p className="syntax-sentence">{syntax.sentence}</p>
            <p className="prompt-line">哪一个是这句话的主干？先删掉定语、状语、补语，再找主谓宾。</p>
          </article>

          <ConfidencePicker value={confidence} onChange={setConfidence} />
          <div className="option-stack">
            {syntax.options.map((o) => {
              const picked = choice === o
              const isRight = o === syntax.trunk
              return (
                <button
                  key={o}
                  className={`option-btn ${result ? (isRight ? 'option-btn--good' : picked ? 'option-btn--bad' : 'option-btn--muted') : ''}`}
                  onClick={() => submitMain(o)}
                  disabled={Boolean(result) || readOnly}
                >
                  {o}
                </button>
              )
            })}
          </div>

          {error && <Notice tone="bad">{error}</Notice>}
          {readOnly && <Notice tone="warn">夜间只读。</Notice>}

          {result && (
            <div className={`feedback ${result.correct ? 'feedback--good' : 'feedback--bad'}`}>
              <div className="feedback__head">
                <b>{result.correct ? '主干找对了' : '主干不对'}</b>
                {result.answer && <span className="tag">{result.answer}</span>}
              </div>
              <p>主干：<b>{syntax.trunk}</b></p>
              <p>{syntax.explain}</p>
              <p className="muted">完整句：{syntax.sentence}</p>
              <div className="btn-row">
                <button className="btn btn--primary" onClick={next}>
                  {step < steps.length - 1 ? '下一句' : '完成这一组'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'punct' && punct && (
        <>
          <h1>{punct.title}</h1>
          <article className="reading-paper">
            <p className="prompt-line">在需要停顿的字与字之间点一下，插入断句号。每个断点都要有依据。</p>
            <div className="punct-line">
              {[...punct.raw].map((ch, i) => (
                <span key={i} className="punct-char">
                  {ch}
                  {i < punct.raw.length - 1 && (
                    <button
                      type="button"
                      className={`gap ${marks.includes(i + 1) ? 'gap--on' : ''}`}
                      disabled={Boolean(result) || readOnly}
                      aria-label={`在第 ${i + 1} 字后断句`}
                      onClick={() =>
                        setMarks((m) => (m.includes(i + 1) ? m.filter((x) => x !== i + 1) : [...m, i + 1]))
                      }
                    >
                      /
                    </button>
                  )}
                </span>
              ))}
            </div>
          </article>

          <ConfidencePicker value={confidence} onChange={setConfidence} />
          {error && <Notice tone="bad">{error}</Notice>}
          {readOnly && <Notice tone="warn">夜间只读。</Notice>}
          {!result && (
            <div className="btn-row">
              <button className="btn btn--primary" onClick={submitPunct} disabled={readOnly}>
                提交断句
              </button>
              <span className="muted">已标 {marks.length} 处</span>
            </div>
          )}

          {result && (
            <div className={`feedback ${result.correct ? 'feedback--good' : 'feedback--bad'}`}>
              <div className="feedback__head">
                <b>{result.correct ? '断句全对' : '断句有偏差'}</b>
                {result.answer && <span className="tag">{result.answer}</span>}
              </div>
              <p>正确断句：{segment(punct.raw, punct.breaks)}</p>
              <div className="reason-list">
                {punct.breaks.map((b, i) => (
                  <div key={b} className="reason">
                    <b>第 {b} 字后</b>
                    <span>{punct.reasons[i]}</span>
                  </div>
                ))}
              </div>
              <p className="muted">译文：{punct.translation} · 出处：{punct.source}</p>
              <div className="btn-row">
                <button className="btn btn--primary" onClick={next}>
                  {step < steps.length - 1 ? '下一句' : '完成这一组'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!syntax && !punct && (
        <Empty title="没有找到这一题" hint="内容可能还没载入。" action={<button className="btn" onClick={() => go('/drills')}>返回</button>} />
      )}
    </div>
  )
}
