import { useEffect, useState } from 'react'
import type { ExamRecord, Item } from '../engine/types'
import { EXAM_SIZES, buildExamPool, examItemStatus } from '../engine/exam'
import { DRILLS, kindLabel, kindOf, setActiveGroup } from '../engine/practice'
import { activeExam, discardExam, finishExam, startExam } from '../engine/store'
import { useDB, useNow } from '../ui/useDB'
import { Empty, Notice, PageHeader } from '../ui/common'

function go(path: string) {
  window.location.hash = path
}

function startItem(item: Item) {
  setActiveGroup(item.group_id)
  const kind = kindOf(item)
  const drill = DRILLS.find((d) => d.kind === kind)
  go(drill?.path ?? '/drills')
}

function elapsed(from: string, nowIso: string): string {
  const sec = Math.max(0, Math.floor((new Date(nowIso).getTime() - new Date(from).getTime()) / 1000))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function Exam() {
  const db = useDB()
  const now = useNow(1000)
  const [size, setSize] = useState(10)
  const [msg, setMsg] = useState('')
  const active = activeExam()
  const pool = buildExamPool(db, now, size)
  const finished = db.exams
    .filter((e) => e.finished_at && e.score)
    .slice(-5)
    .reverse()

  return (
    <div className="page">
      <PageHeader
        eyebrow="验收 · 限时抽样"
        title="组一卷，测真会"
        intro="从你学过的条目里按六维配比抽一份小卷，限时覆盖。作答跳转到对应训练页，计入同一份作答记录；交卷只做验收快照，不另设奖励。"
      />

      {msg && <Notice tone="warn" title="提示">{msg}</Notice>}

      {active ? (
        <ActiveView exam={active} now={now} />
      ) : (
        <section className="section">
          <h2 className="section-title">新开一卷</h2>
          <p className="muted">
            已学条目池：{pool.poolSize} 条。抽 {size} 条 · 当日种子稳定，同一天重复组卷内容一致。
          </p>
          <div className="chips" role="radiogroup" aria-label="卷面大小">
            {EXAM_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                className={`chip ${size === n ? 'chip--active' : ''}`}
                aria-pressed={size === n}
                onClick={() => setSize(n)}
              >
                <b>{n}</b>
                <span>条</span>
              </button>
            ))}
          </div>
          {pool.poolSize < 4 ? (
            <p className="muted">已学条目还太少，先在队列里练几天再组卷。</p>
          ) : (
            <button
              className="btn btn--primary"
              onClick={() => {
                const r = startExam(pool.items.map((i) => i.item_id))
                setMsg(r === 'active-exists' ? '已有一张未交的卷。' : '')
              }}
            >
              开始组卷
            </button>
          )}
        </section>
      )}

      {finished.length > 0 && (
        <section className="section">
          <h2 className="section-title">最近的卷</h2>
          {finished.map((e) => (
            <p key={e.id} className="muted">
              {new Date(e.created_at).toLocaleDateString()} · {e.item_ids.length} 条 · 作答{' '}
              {e.score?.answered ?? 0} · 对 {e.score?.correct ?? 0}
            </p>
          ))}
        </section>
      )}
    </div>
  )
}

function ActiveView({ exam, now }: { exam: ExamRecord; now: Date }) {
  const db = useDB()
  const status = examItemStatus(db, exam)
  const answered = Object.values(status).filter((s) => s.answered).length
  const allDone = answered === exam.item_ids.length

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">进行中</h2>
        <span className="muted">
          {elapsed(exam.started_at, now.toISOString())} · 已答 {answered}/{exam.item_ids.length}
        </span>
      </div>
      <div className="queue">
        {exam.item_ids.map((id) => {
          const item = db.items[id]
          if (!item) return null
          const kind = kindOf(item)
          const st = status[id]
          return (
            <article key={id} className="group-card">
              <div className="group-card__top">
                <span className="tag">{kind ? kindLabel(kind) : ''}</span>
                <span className={`tag ${st.answered ? (st.correct ? 'tag--good' : 'tag--warn') : ''}`}>
                  {st.answered ? (st.correct ? '答对' : '答错') : '待作答'}
                </span>
              </div>
              <h3>{String(item.content.title ?? item.content.word ?? item.content.text ?? '条目')}</h3>
              <p className="muted">{String(item.content.subtitle ?? '')}</p>
              <div className="group-card__foot">
                <span className="muted">{kind ?? ''}</span>
                <button className="btn btn--primary" onClick={() => startItem(item)}>
                  {st.answered ? '再答一遍' : '去作答'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
      <div className="btn-row">
        <button className="btn btn--primary" onClick={() => finishExam(exam.id)}>
          {allDone ? '交卷' : `交卷（已答 ${answered}/${exam.item_ids.length}）`}
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => {
            if (window.confirm('作废这张卷？已作的答仍计入学习记录。')) discardExam(exam.id)
          }}
        >
          作废
        </button>
      </div>
      <p className="muted">交卷不擦除任何作答；它只是一张验收快照。</p>
    </section>
  )
}
