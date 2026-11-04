import { useEffect, useRef, useState } from 'react'
import { IMAGERY, READINGS, TECHNIQUES } from '../content/appreciation'
import { imageryOptions, techniqueOptions } from '../content/quiz'
import { aiCritiqueAnnotation } from '../engine/ai'
import { allGroups, remainingItems, setActiveGroup, takeActiveGroup } from '../engine/practice'
import { addAnnotation, getAnimationsFor, getDB, submitReview } from '../engine/store'
import { isNight } from '../engine/util'
import { useDB, useNow } from '../ui/useDB'
import { ConfidencePicker, Empty, Notice } from '../ui/common'

function go(path: string) {
  window.location.hash = path
}

export default function Appreciation() {
  const db = useDB()
  const now = useNow(30000)
  const readOnly = isNight(now)

  const boot = useRef<{ groupId: string; steps: string[] } | null>(null)
  if (!boot.current) {
    const g = takeActiveGroup('appreciation', getDB(), now)
    boot.current = {
      groupId: g?.id ?? '',
      steps: g ? remainingItems(g, getDB(), now).map((i) => i.item_id) : [],
    }
  }

  const [tab, setTab] = useState<'cards' | 'reading'>('cards')
  const [groupId, setGroupId] = useState(boot.current.groupId)
  const [steps, setSteps] = useState(boot.current.steps)
  const [step, setStep] = useState(0)
  const [confidence, setConfidence] = useState<number | null>(null)
  const [result, setResult] = useState<{ correct: boolean; chosen: string; change: string } | null>(null)
  const [error, setError] = useState('')
  const startRef = useRef(Date.now())

  useEffect(() => {
    setConfidence(null)
    setResult(null)
    setError('')
    startRef.current = Date.now()
  }, [step, groupId])

  const groups = allGroups(db, 'appreciation')
  const group = groups.find((g) => g.id === groupId)
  const itemId = steps[step]
  const item = itemId ? db.items[itemId] : undefined
  const refId = String(item?.content.refId ?? '')
  const tech = TECHNIQUES.find((t) => t.id === refId)
  const img = IMAGERY.find((i) => i.id === refId)

  const target = tech ? tech.effect : img ? img.emotion : ''
  const options = tech ? techniqueOptions(tech) : img ? imageryOptions(img) : []

  function switchGroup(id: string) {
    const g = allGroups(getDB(), 'appreciation').find((x) => x.id === id)
    if (!g) return
    setActiveGroup(id)
    setGroupId(id)
    setSteps(remainingItems(g, getDB(), now).map((i) => i.item_id))
    setStep(0)
  }

  function choose(option: string) {
    if (!item || !target || readOnly) return
    if (confidence == null) {
      setError('先选把握度，再作答。')
      return
    }
    try {
      const res = submitReview({
        itemId: item.item_id,
        correct: option === target,
        confidence,
        timeSpent: Math.max(1, Math.round((Date.now() - startRef.current) / 1000)),
        answer: option,
      })
      setResult({ correct: option === target, chosen: option, change: res.mastery_change })
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '写入失败')
    }
  }

  function next() {
    if (step < steps.length - 1) setStep((s) => s + 1)
    else setStep(steps.length)
  }

  return (
    <div className="page">
      <div className="drill-head">
        <button className="link" onClick={() => go('/')}>← 今日队列</button>
        <span className="tag">文本感受 · 鉴赏</span>
      </div>

      <h1>可枚举的部分，练成条件反射。</h1>
      <p className="page-head__intro">
        手法与意象是有限集；审美感受力不是。前者交给卡片，后者交给每日精读里你自己写的那一句批注。
      </p>

      <div className="tab-bar">
        <button className={tab === 'cards' ? 'tab tab--on' : 'tab'} onClick={() => setTab('cards')}>卡片</button>
        <button className={tab === 'reading' ? 'tab tab--on' : 'tab'} onClick={() => setTab('reading')}>每日精读</button>
      </div>

      {tab === 'cards' && (steps.length === 0 || step >= steps.length || !item || (!tech && !img)) && (
        <>
          <Empty
            title={steps.length === 0 ? '今天的鉴赏卡已完成' : '这一组完成了'}
            hint="手法和意象分开挂 model_tag。达标即停：LV.3 后不再主动推新卡，只按 FSRS 低频复习。"
            action={
              <div className="btn-row">
                <button className="btn btn--primary" onClick={() => setTab('reading')}>去精读</button>
                <button className="btn" onClick={() => go('/')}>回今日队列</button>
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
        </>
      )}

      {tab === 'cards' && steps.length > 0 && step < steps.length && (tech || img) && (
        <>
          <div className="section-head">
            <h2>{tech ? '手法卡' : '意象卡'}</h2>
            <span className="muted">第 {step + 1}/{steps.length} 张</span>
          </div>

          <article className="reading-paper">
            <h2 className="card-name">{tech ? tech.name : img?.image}</h2>
            <p className="card-example">{tech ? tech.example : img?.example}</p>
            <p className="prompt-line">
              {tech ? '这个手法的表达效果，最接近哪一项？' : '这个意象在古典诗文中常见的情绪指向是？'}
            </p>
          </article>

          <ConfidencePicker value={confidence} onChange={setConfidence} />

          <div className="option-stack">
            {options.map((o) => {
              const picked = result?.chosen === o
              const isRight = o === target
              return (
                <button
                  key={o}
                  className={`option-btn ${result ? (isRight ? 'option-btn--good' : picked ? 'option-btn--bad' : 'option-btn--muted') : ''}`}
                  onClick={() => choose(o)}
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
                <b>{result.correct ? '对了' : '不对'}</b>
                {result.change && <span className="tag">{result.change}</span>}
              </div>
              {tech ? (
                <>
                  <p><b>{tech.name}</b>：{tech.definition}</p>
                  <p><b>判定标志</b>：{tech.signals}</p>
                  <p><b>效果</b>：{tech.effect}</p>
                  <p className="muted">例：{tech.example}</p>
                </>
              ) : (
                <>
                  <p><b>{img?.image}</b> → {img?.emotion}</p>
                  <p>{img?.note}</p>
                  <p className="muted">例：{img?.example}</p>
                </>
              )}
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
        </>
      )}

      {tab === 'reading' && <ReadingPanel />}
    </div>
  )
}

function ReadingPanel() {
  const db = useDB()
  const [readingId, setReadingId] = useState(READINGS[0].id)
  const reading = READINGS.find((r) => r.id === readingId) ?? READINGS[0]
  const [note, setNote] = useState('')
  const [critique, setCritique] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const saved = db.annotations.filter((a) => a.reading_id === readingId).slice().reverse()

  function switchReading(id: string) {
    setReadingId(id)
    setNote('')
    setCritique('')
    setMsg('')
  }

  async function save() {
    if (note.trim().length < 10) {
      setMsg('批注至少 10 字。不是凑字数，是逼自己说出一个判断。')
      return
    }
    if (!addAnnotation(reading.id, note)) {
      setMsg('批注没有保存，请再试一次。')
      return
    }
    const text = note.trim()
    setNote('')
    setMsg('批注已保存。')
    if (db.settings.ai.enabled) {
      setBusy(true)
      setCritique('')
      try {
        const res = await aiCritiqueAnnotation(db.settings.ai, {
          title: reading.title,
          text: reading.text,
          annotation: text,
        })
        setCritique(res)
      } catch (e) {
        setMsg(`批注已保存；AI 点评失败：${e instanceof Error ? e.message : '未知错误'}`)
      } finally {
        setBusy(false)
      }
    }
  }

  return (
    <div>
      <div className="prompt-chips">
        {READINGS.map((r) => (
          <button
            key={r.id}
            className={`chip chip--small ${r.id === readingId ? 'chip--active' : ''}`}
            onClick={() => switchReading(r.id)}
          >
            {r.genre} · {r.title}
          </button>
        ))}
      </div>

      <article className="reading-paper">
        <p className="eyebrow">{reading.genre} · 每日精读 300 字</p>
        <h2>{reading.title}</h2>
        <p className="muted">{reading.author}</p>
        <p className="reading-text">{reading.text}</p>
        <p className="prompt-line">{reading.prompt}</p>
      </article>

      <textarea
        className="textarea"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="写一句你自己的批注：它为什么这样写？你从哪里看出来？"
      />
      <div className="writing-foot">
        <span className="muted">{note.trim().length} 字 · 至少 10 字</span>
        <button className="btn btn--primary" onClick={save} disabled={busy}>
          {busy ? '点评中…' : '保存批注'}
        </button>
      </div>

      {msg && <Notice tone={msg.includes('失败') ? 'warn' : 'good'}>{msg}</Notice>}
      {!db.settings.ai.enabled && (
        <Notice tone="info">
          未开启 AI 点评：批注仍会保存在本机。开启后，AI 只评你的批注、指出遗漏并追问，不提供“更好的批注”示范。
        </Notice>
      )}

      {critique && (
        <section className="section">
          <div className="section-head">
            <h2>AI 点评（只评批注）</h2>
            <span className="muted">不是范文</span>
          </div>
          <p className="prose">{critique}</p>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>我的批注</h2>
          <span className="muted">{saved.length} 条</span>
        </div>
        {saved.length === 0 ? (
          <p className="muted">还没有批注。读完写一句，比再读一遍更有用。</p>
        ) : (
          <div className="note-list">
            {saved.map((a) => (
              <article key={a.id} className="note-item">
                <p>{a.text}</p>
                <span className="muted">{new Date(a.created_at).toLocaleString('zh-CN')}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <p className="muted">
        轮换规则：诗歌 / 散文 / 小说按周轮换；精读文本只提供文本与一个开放问题，不提供标准赏析。
      </p>
    </div>
  )
}
