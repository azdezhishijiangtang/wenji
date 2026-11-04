import { useEffect, useRef, useState } from 'react'
import { CLOZE_TEXTS } from '../content/cloze'
import { allGroups, remainingItems, setActiveGroup, takeActiveGroup } from '../engine/practice'
import { getDB, submitReview } from '../engine/store'
import { useDB, useNow } from '../ui/useDB'
import { ConfidencePicker, Empty, Evidence, Notice } from '../ui/common'

function go(path: string) {
  window.location.hash = path
}

export default function Cloze() {
  const db = useDB()
  const now = useNow(30000)
  const readOnly = false // 夜间不派新任务，但自选练习不再锁死

  const boot = useRef<{ groupId: string; steps: string[] } | null>(null)
  if (!boot.current) {
    const g = takeActiveGroup('cloze', getDB(), now)
    boot.current = {
      groupId: g?.id ?? '',
      steps: g ? remainingItems(g, getDB(), now).map((i) => i.item_id) : [],
    }
  }

  const [groupId, setGroupId] = useState(boot.current.groupId)
  const [steps, setSteps] = useState<string[]>(boot.current.steps)
  const [step, setStep] = useState(0)
  const [confidence, setConfidence] = useState<number | null>(null)
  const [answers, setAnswers] = useState<Record<string, { choice: string; correct: boolean }>>({})
  const [changes, setChanges] = useState<string[]>([])
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')
  const startRef = useRef(Date.now())

  useEffect(() => {
    setConfidence(null)
    setHint('')
    startRef.current = Date.now()
  }, [step, groupId])

  const groups = allGroups(db, 'cloze')
  const group = groups.find((g) => g.id === groupId)
  const itemId = steps[step]
  const item = itemId ? db.items[itemId] : undefined
  const textId = group?.id.startsWith('cloze:') ? group.id.slice(6) : ''
  const text = CLOZE_TEXTS.find((t) => t.id === textId)
  const blank = text?.blanks.find((b) => b.id === item?.content.blankId)
  const answered = blank ? answers[blank.id] : undefined
  const correctWord = blank?.word ?? ''

  function switchGroup(id: string) {
    const g = allGroups(getDB(), 'cloze').find((x) => x.id === id)
    if (!g) return
    setActiveGroup(id)
    setGroupId(id)
    setSteps(remainingItems(g, getDB(), now).map((i) => i.item_id))
    setStep(0)
    setAnswers({})
    setChanges([])
    setError('')
  }

  function choose(word: string) {
    if (!blank || !item || answered || readOnly) return
    if (confidence == null) {
      setHint('先选一个把握度，再填词。把握度是校准曲线的原料，不能跳过。')
      return
    }
    const correct = word === blank.word
    try {
      const result = submitReview({
        itemId: item.item_id,
        correct,
        confidence,
        timeSpent: Math.max(1, Math.round((Date.now() - startRef.current) / 1000)),
        answer: word,
      })
      setAnswers((a) => ({ ...a, [blank.id]: { choice: word, correct } }))
      setChanges((c) => [...c, result.mastery_change])
      setHint('')
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '作答没有写入')
    }
  }

  function next() {
    if (step < steps.length - 1) setStep((s) => s + 1)
    else setStep(steps.length)
  }

  if (!text || !group) {
    return (
      <div className="page">
        <Empty
          title="这一段没有可练的内容"
          hint="可能是内容还没载入，或今天的挖词都做完了。"
          action={<button className="btn btn--primary" onClick={() => go('/drills')}>返回训练器</button>}
        />
      </div>
    )
  }

  if (steps.length === 0 || step >= steps.length) {
    return (
      <div className="page">
        <div className="drill-head">
          <button className="link" onClick={() => go('/')}>← 今日队列</button>
          <span className="tag">语义分辨 · 挖词</span>
        </div>
        <h1>{text.title}</h1>
        <p className="page-head__intro">{text.subtitle}</p>
        <Empty
          title={steps.length === 0 ? '这一段今天已经做完' : '这一段完成了'}
          hint={
            steps.length === 0
              ? '同一天不重复计分。明天它会按 FSRS 的到期时间回来；错空 48 小时后换挖空位重测。'
              : '下面是这一轮的掌握度变化。没有分数，没有排名。'
          }
          action={
            <div className="btn-row">
              <button className="btn btn--primary" onClick={() => go('/')}>回今日队列</button>
              <button className="btn" onClick={() => go('/drills')}>换一组</button>
            </div>
          }
        />
        {changes.length > 0 && (
          <div className="result-list">
            {changes.map((c, i) => (
              <div key={i} className="result-row">
                <span className="tag tag--good">引擎</span>
                <span>{c}</span>
              </div>
            ))}
          </div>
        )}
        {groups.length > 1 && (
          <div className="section">
            <h3>换一段</h3>
            <div className="group-picker">
              {groups.map((g) => (
                <button key={g.id} className="picker-item" onClick={() => switchGroup(g.id)}>
                  <b>{g.title}</b>
                  <span className="muted">{g.subtitle}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const parts = text.text.split(/(\{\{[a-zA-Z0-9_-]+\}\})/g)

  return (
    <div className="page">
      <div className="drill-head">
        <button className="link" onClick={() => go('/')}>← 今日队列</button>
        <span className="tag">语义分辨 · 第 {step + 1}/{steps.length} 空</span>
      </div>

      <h1 className="cloze-title">{text.title}</h1>
      <p className="page-head__intro">{text.subtitle}</p>

      <article className="reading-paper">
        <p className="cloze-text">
          {parts.map((part, i) => {
            const m = /^\{\{([a-zA-Z0-9_-]+)\}\}$/.exec(part)
            if (!m) return <span key={i}>{part}</span>
            const id = m[1]
            const b = text.blanks.find((x) => x.id === id)
            const a = b ? answers[b.id] : undefined
            return (
              <span
                key={i}
                className={`blank ${a ? (a.correct ? 'blank--good' : 'blank--bad') : ''} ${
                  b?.id === blank?.id ? 'blank--active' : ''
                }`}
                title={a ? `你填：${a.choice}` : '待填'}
              >
                {a ? a.choice : '＿＿'}
              </span>
            )
          })}
        </p>
      </article>

      <div className="prompt-box">
        <p className="eyebrow">当前空 · {blank?.word_type}</p>
        <h3>{blank?.id.toUpperCase()}：哪一个词最贴合原文？</h3>
      </div>

      <ConfidencePicker value={confidence} onChange={setConfidence} />

      <div className="candidate-grid">
        {blank?.candidates.map((c) => {
          const picked = answered?.choice === c.text
          const isRight = c.text === correctWord
          return (
            <button
              key={c.text}
              className={`candidate ${answered ? (isRight ? 'candidate--good' : picked ? 'candidate--bad' : 'candidate--muted') : ''}`}
              onClick={() => choose(c.text)}
              disabled={Boolean(answered) || readOnly}
            >
              <b>{c.text}</b>
              {answered && <span className="candidate__tag">{c.transform}</span>}
              {answered && c.note && <small>{c.note}</small>}
            </button>
          )
        })}
      </div>

      {hint && <Notice tone="warn">{hint}</Notice>}
      {error && <Notice tone="bad">{error}</Notice>}
      {readOnly && <Notice tone="warn">夜间只读，明天再作答。</Notice>}

      {answered && (
        <div className={`feedback ${answered.correct ? 'feedback--good' : 'feedback--bad'}`}>
          <div className="feedback__head">
            <b>{answered.correct ? '这一空对了' : `这一空不对：原文是「${correctWord}」`}</b>
            <span className="tag">{blank?.word_type}</span>
          </div>
          <p className="feedback__why">{blank?.why}</p>
          <p className="evidence-line">
            <span className="muted">回原文：</span>
            <Evidence text={blank?.evidence ?? ''} word={correctWord} />
          </p>
          {blank?.axis && blank.axis.length > 1 && (
            <div className="axis">
              <span className="muted">语义轴</span>
              {blank.axis.map((x, i) => (
                <span key={x} className={x === correctWord ? 'axis__on' : ''}>
                  {x}
                  {i < (blank.axis?.length ?? 0) - 1 && <i>—</i>}
                </span>
              ))}
            </div>
          )}
          <div className="btn-row">
            <button className="btn btn--primary" onClick={next}>
              {step < steps.length - 1 ? '下一空' : '完成这一段'}
            </button>
          </div>
        </div>
      )}

      {!answered && !readOnly && (
        <p className="muted center">先选把握度，再点词。答完才会显示解释与原文依据。</p>
      )}

      {groups.length > 1 && (
        <div className="section">
          <h3>换一段</h3>
          <div className="group-picker">
            {groups.map((g) => (
              <button key={g.id} className={`picker-item ${g.id === groupId ? 'picker-item--on' : ''}`} onClick={() => switchGroup(g.id)}>
                <b>{g.title}</b>
                <span className="muted">{g.subtitle}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
