import { useEffect, useRef, useState } from 'react'
import { CLASSICAL_ENTRIES } from '../content/classical'
import { recognitionOptions } from '../content/quiz'
import { allGroups, remainingItems, setActiveGroup, takeActiveGroup } from '../engine/practice'
import { getDB, submitReview } from '../engine/store'
import { useDB, useNow } from '../ui/useDB'
import { ConfidencePicker, Empty, Notice } from '../ui/common'

function go(path: string) {
  window.location.hash = path
}

function normalize(s: string): string {
  return s.replace(/[\s，。；：！？、“”‘’（）()《》·]/g, '')
}

export default function Classical() {
  const db = useDB()
  const now = useNow(30000)
  const readOnly = false // 夜间不派新任务，但自选练习不再锁死

  const boot = useRef<{ groupId: string; steps: string[] } | null>(null)
  if (!boot.current) {
    const g = takeActiveGroup('classical', getDB(), now)
    boot.current = {
      groupId: g?.id ?? '',
      steps: g ? remainingItems(g, getDB(), now).map((i) => i.item_id) : [],
    }
  }

  const [groupId, setGroupId] = useState(boot.current.groupId)
  const [steps, setSteps] = useState(boot.current.steps)
  const [step, setStep] = useState(0)
  const [confidence, setConfidence] = useState<number | null>(null)
  const [choice, setChoice] = useState('')
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState<{ correct: boolean; answer: string; change: string } | null>(null)
  const [error, setError] = useState('')
  const startRef = useRef(Date.now())

  useEffect(() => {
    setConfidence(null)
    setChoice('')
    setTyped('')
    setResult(null)
    setError('')
    startRef.current = Date.now()
  }, [step, groupId])

  const groups = allGroups(db, 'classical')
  const group = groups.find((g) => g.id === groupId)
  const itemId = steps[step]
  const item = itemId ? db.items[itemId] : undefined
  const entry = CLASSICAL_ENTRIES.find((e) => e.id === item?.content.entryId)
  const mode = item?.item_type === 'classical_production' ? 'production' : 'recognition'

  function switchGroup(id: string) {
    const g = allGroups(getDB(), 'classical').find((x) => x.id === id)
    if (!g) return
    setActiveGroup(id)
    setGroupId(id)
    setSteps(remainingItems(g, getDB(), now).map((i) => i.item_id))
    setStep(0)
  }

  function record(correct: boolean, answer: string) {
    if (!item || readOnly) return
    if (confidence == null) {
      setError('先选把握度，再作答。')
      return
    }
    try {
      const res = submitReview({
        itemId: item.item_id,
        correct,
        confidence,
        timeSpent: Math.max(1, Math.round((Date.now() - startRef.current) / 1000)),
        answer,
      })
      setResult({ correct, answer, change: res.mastery_change })
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '写入失败')
    }
  }

  function submitRecognition(word: string) {
    if (!entry || result) return
    setChoice(word)
    record(word === entry.sense, word)
  }

  function submitProduction() {
    if (!entry || result) return
    const answer = typed.trim()
    if (!answer) {
      setError('先写一个答案。想不起来也写一个，再提交——这是“先试后看”。')
      return
    }
    record(normalize(answer) === normalize(entry.production_answer ?? ''), answer)
  }

  function next() {
    if (step < steps.length - 1) setStep((s) => s + 1)
    else setStep(steps.length)
  }

  if (!entry || !group) {
    return (
      <div className="page">
        <Empty
          title="这一组没有卡片"
          hint="可能今天的文言卡都做完了。"
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
          <span className="tag">文言积累</span>
        </div>
        <Empty
          title="这一组今天完成了"
          hint="认读与回译分开排期，但都挂在同一个词的 model_tag 下；连对 3 道不同题才升档。"
          action={
            <div className="btn-row">
              <button className="btn btn--primary" onClick={() => go('/')}>回今日队列</button>
              <button className="btn" onClick={() => go('/drills')}>换一组</button>
            </div>
          }
        />
        {groups.length > 1 && (
          <div className="section">
            <h3>换一组</h3>
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

  const example = entry.example.replace('{{word}}', entry.word)

  return (
    <div className="page">
      <div className="drill-head">
        <button className="link" onClick={() => go('/')}>← 今日队列</button>
        <span className="tag">
          文言 · 第 {step + 1}/{steps.length} 张 · {mode === 'recognition' ? '认读' : '回译'}
        </span>
      </div>

      <div className="word-head">
        <h1>{entry.word}</h1>
        <span className="tag">{entry.type}</span>
      </div>

      <article className="reading-paper classical-paper">
        {mode === 'recognition' ? (
          <>
            <p className="classical-example">{example}</p>
            <p className="muted">—— {entry.source}</p>
            <p className="prompt-line">{entry.question}</p>
          </>
        ) : (
          <>
            <p className="classical-example">{entry.production?.replace('____', '＿＿')}</p>
            <p className="muted">把空位补成最合适的文言词（只填一个字）。</p>
            <p className="prompt-line">提示：{entry.type} · {entry.sense}的语境</p>
          </>
        )}
      </article>

      <ConfidencePicker
        value={confidence}
        onChange={setConfidence}
        hint="先判断自己有多确定，再作答；这条记录会进入该词的校准偏差。"
      />

      {mode === 'recognition' ? (
        <div className="candidate-grid candidate-grid--four">
          {recognitionOptions(entry).map((opt) => {
            const picked = choice === opt
            const isRight = opt === entry.sense
            return (
              <button
                key={opt}
                className={`candidate ${result ? (isRight ? 'candidate--good' : picked ? 'candidate--bad' : 'candidate--muted') : ''}`}
                onClick={() => submitRecognition(opt)}
                disabled={Boolean(result) || readOnly}
              >
                <b>{opt}</b>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="input-row">
          <input
            className="input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="输入那个文言词"
            disabled={Boolean(result) || readOnly}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitProduction()
            }}
          />
          <button className="btn btn--primary" onClick={submitProduction} disabled={Boolean(result) || readOnly}>
            提交
          </button>
        </div>
      )}

      {error && <Notice tone="bad">{error}</Notice>}
      {readOnly && <Notice tone="warn">夜间只读。</Notice>}

      {result && (
        <div className={`feedback ${result.correct ? 'feedback--good' : 'feedback--bad'}`}>
          <div className="feedback__head">
            <b>
              {result.correct
                ? '对了'
                : `不对：答案是「${mode === 'recognition' ? entry.sense : entry.production_answer ?? entry.word}」`}
            </b>
            {result.change && <span className="tag">{result.change}</span>}
          </div>
          <p>
            义项：<b>{entry.sense}</b> · 原词：<b>{entry.word}</b>
          </p>
          <p className="muted">{entry.translation}</p>
          <p className="feedback__why">{entry.note}</p>
          <p className="muted">出处：{entry.source}</p>
          <div className="btn-row">
            <button className="btn btn--primary" onClick={next}>
              {step < steps.length - 1 ? '下一张' : '完成这一组'}
            </button>
          </div>
        </div>
      )}

      {groups.length > 1 && (
        <div className="section">
          <h3>换一组</h3>
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
