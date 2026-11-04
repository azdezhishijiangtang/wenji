import { useState } from 'react'
import {
  getAbilityProfile,
  getDaily,
  getDailyHistory,
  getDailyStreak,
  getTodayStats,
  saveDaily,
  setDailyAI,
} from '../engine/store'
import { aiDailyReview } from '../engine/ai'
import { dailyPicks, dailyNotePrompt, readingOfTheDay } from '../engine/diagnosis'
import { CLASSICAL_ENTRIES } from '../content/classical'
import { IMAGERY, TECHNIQUES } from '../content/appreciation'
import { dayKey, fmtDateFull } from '../engine/util'
import { useDB, useNow } from '../ui/useDB'
import { Notice, PageHeader, Stat } from '../ui/common'

function go(path: string) {
  window.location.hash = path
}

function Highlight({ text }: { text: string }) {
  const parts = text.split(/(\{\{.+?\}\})/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('{{') && p.endsWith('}}')) {
          return <mark key={i}>{p.slice(2, -2)}</mark>
        }
        return <span key={i}>{p}</span>
      })}
    </>
  )
}

export default function Daily() {
  const db = useDB()
  const now = useNow(60000)
  const picks = dailyPicks(now)
  const entry = getDaily(now)
  const [note, setNote] = useState(entry?.note ?? '')
  const [saved, setSaved] = useState(Boolean(entry?.note))
  const [msg, setMsg] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const stats = getTodayStats(now)
  const streak = getDailyStreak(now)
  const profile = getAbilityProfile(now)
  const reading = readingOfTheDay(now)
  const history = getDailyHistory().slice(0, 14)
  const aiReady = db.settings.ai.enabled && Boolean(db.settings.ai.apiKey)

  const word = CLASSICAL_ENTRIES.find((e) => e.id === (entry?.word_id ?? picks.word.id)) ?? picks.word
  const image = IMAGERY.find((e) => e.id === (entry?.imagery_id ?? picks.imagery.id)) ?? picks.imagery
  const tech = TECHNIQUES.find((e) => e.id === (entry?.technique_id ?? picks.technique.id)) ?? picks.technique

  function save() {
    const ok = saveDaily({
      date: dayKey(now),
      word_id: word.id,
      imagery_id: image.id,
      technique_id: tech.id,
      note,
    })
    if (!ok) {
      setMsg('至少写 10 个字。不是打卡文案，是一句你自己的话。')
      return
    }
    setSaved(true)
    setMsg('已记下。明天这三样会换。')
  }

  async function review() {
    if (!saved) {
      setAiError('先把今天那句写下来，AI 才有东西可监测。')
      return
    }
    setAiBusy(true)
    setAiError('')
    try {
      const out = await aiDailyReview(db.settings.ai, {
        date: dayKey(now),
        done: stats.done,
        correct: stats.correct,
        minutes: stats.minutes,
        note: note.trim(),
        weakest: profile.focus?.name ?? '证据不足',
        queue_left: Math.max(0, db.settings.dailyCap - stats.done),
        streak,
        drafts: stats.drafts,
        annotations: stats.annotations,
      })
      setDailyAI(dayKey(now), out.comment, out.focus)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI 复盘失败')
    } finally {
      setAiBusy(false)
    }
  }

  function localMonitor() {
    if (stats.done === 0 && stats.drafts === 0 && stats.annotations === 0) {
      return '今天还没有可验证的学习记录。日课不是替代训练：读三样只算输入，能力不会因为“看过”而改变。'
    }
    const acc = stats.accuracy == null ? '—' : `${Math.round(stats.accuracy * 100)}%`
    const extra =
      stats.drafts || stats.annotations
        ? `另有 ${stats.drafts} 份写作草稿、${stats.annotations} 条精读批注。`
        : ''
    return `今天已作答 ${stats.done} 条，正确率 ${acc}，约 ${stats.minutes} 分钟。${extra}这是监测数据，不是成就。${
      stats.has_note ? '日课已留下一句，输入和输出都在发生。' : '日课还没留下自己的句子。'
    }`
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow={fmtDateFull(now)}
        title="日课：一字，一象，一技。"
        intro="每天只取三样，不贪多。读是输入，最后那句才是你的。它不计分、不进入掌握度，但会进入能力诊断的“积累证据”。"
        aside={<span className="tag tag--good">连续日课 {streak} 天</span>}
      />

      <div className="stat-row">
        <Stat label="日课累计" value={`${db.daily.length} 天`} hint="写过一句才算" />
        <Stat label="今日作答" value={`${stats.done} 条`} hint="监测，不是成就" />
        <Stat
          label="今日正确率"
          value={stats.accuracy == null ? '—' : `${Math.round(stats.accuracy * 100)}%`}
          hint={`约 ${stats.minutes} 分钟`}
        />
      </div>

      <div className="daily-grid">
        <article className="daily-card daily-card--word">
          <span className="daily-card__label">一字 · 文言</span>
          <h2>
            {word.word} <span className="muted">· {word.sense}</span>
          </h2>
          <p className="daily-example">
            <Highlight text={word.example} />
          </p>
          <p>{word.translation}</p>
          <p className="muted tiny">
            {word.type} · {word.source}
          </p>
          {word.note && <p className="daily-note-line">{word.note}</p>}
        </article>

        <article className="daily-card daily-card--image">
          <span className="daily-card__label">一象 · 意象</span>
          <h2>
            {image.image} <span className="muted">→ {image.emotion}</span>
          </h2>
          <p className="daily-example">{image.example}</p>
          <p className="muted">{image.note}</p>
        </article>

        <article className="daily-card daily-card--tech">
          <span className="daily-card__label">一技 · 手法</span>
          <h2>{tech.name}</h2>
          <p>{tech.definition}</p>
          <p className="muted tiny">判定标志：{tech.signals}</p>
          <p className="muted tiny">效果：{tech.effect}</p>
          <p className="daily-example">{tech.example}</p>
        </article>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>今日精读</h2>
          <span className="muted">四篇轮换 · 只读一段，不贪多</span>
        </div>
        <article className="reading-paper">
          <span className="eyebrow">
            {reading.genre} · {reading.author}
          </span>
          <h2>{reading.title}</h2>
          <p className="reading-text">{reading.text}</p>
          <p className="muted">{reading.prompt}</p>
        </article>
        <p className="muted tiny">
          想留下批注，去 <a href="#/drills/appreciation">鉴赏积累 → 每日精读</a>；批注不少于 10 字，AI 只点评，不给标准赏析。
        </p>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>今天这一句</h2>
          <span className="muted">≥10 字 · 写具体的词、句或判断</span>
        </div>
        <p className="muted">{dailyNotePrompt()}</p>
        <textarea
          className="note-area"
          rows={4}
          value={note}
          maxLength={280}
          placeholder="例：原来“未必”不是“不会”，它只是把必然性降了一格；我昨天写作文时把它当成“不会”用了。"
          onChange={(e) => {
            setNote(e.target.value)
            setSaved(false)
            setMsg('')
          }}
        />
        <div className="row-between">
          <span className="muted tiny">{note.trim().length} / 280</span>
          <button className="btn btn--primary" onClick={save}>
            {saved ? '更新这一句' : '收进日课'}
          </button>
        </div>
        {msg && <Notice tone={saved ? 'good' : 'warn'}>{msg}</Notice>}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>今日学习监测</h2>
          <span className="muted">只看事实，不做排行榜</span>
        </div>
        <p>{localMonitor()}</p>
        <div className="btn-row">
          <button className="btn" onClick={() => go('/')}>回今日队列</button>
          <button className="btn" onClick={() => go('/coach')}>看能力诊断</button>
          <button
            className="btn btn--primary"
            onClick={() => void review()}
            disabled={aiBusy || !aiReady || !saved}
            title={!aiReady ? '先在设置里配置 AI 接口' : !saved ? '先写下今天这一句' : ''}
          >
            {aiBusy ? 'AI 正在复盘…' : '让 AI 复盘今天'}
          </button>
        </div>
        {!aiReady && (
          <p className="muted tiny">
            没有配置 AI。本地监测仍然可用；要 AI 复盘，去 <a href="#/settings">设置</a> 填接口。
          </p>
        )}
        {entry?.ai_comment && (
          <div className="report report--soft">
            <span className="tag">AI 监测 · {entry.ai_at ? entry.ai_at.slice(0, 10) : '今天'}</span>
            <p>{entry.ai_comment}</p>
            {entry.ai_focus && <p className="report__focus">明日一个动作：{entry.ai_focus}</p>}
          </div>
        )}
        {aiError && <Notice tone="warn">{aiError}</Notice>}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>积累簿</h2>
          <span className="muted">最近 14 天 · 只收录写过一句的日子</span>
        </div>
        {history.length === 0 ? (
          <p className="muted">还空着。今天写第一句，明天就会多一行。</p>
        ) : (
          <div className="daily-history">
            {history.map((d) => {
              const w = CLASSICAL_ENTRIES.find((e) => e.id === d.word_id)
              return (
                <article className="daily-history__item" key={d.date}>
                  <div className="daily-history__date">{d.date.slice(5)}</div>
                  <div>
                    <p>{d.note}</p>
                    <p className="muted tiny">
                      {w ? `${w.word} · ${w.sense}` : '日课'} · {d.ai_comment ? '有 AI 复盘' : '本地记录'}
                    </p>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <p className="muted center">
        日课是积累，不是训练量的替代品。真正的能力变化仍然要看作答证据。
      </p>
    </div>
  )
}
