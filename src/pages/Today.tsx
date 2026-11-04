import { useState } from 'react'
import {
  getCalibration,
  getDaily,
  getDailyStreak,
  getQueue,
  getTodayStats,
  pendingErrorTags,
  setErrorTag,
} from '../engine/store'
import { DRILLS, allGroups, kindLabel, kindOf, setActiveGroup, todayDoneFor } from '../engine/practice'
import { ERROR_TAGS } from '../engine/types'
import { fmtDateFull } from '../engine/util'
import { useDB, useNow } from '../ui/useDB'
import { Empty, Notice, Stat } from '../ui/common'

function go(path: string) {
  window.location.hash = path
}

export default function Today() {
  const db = useDB()
  const now = useNow(30000)
  const queue = getQueue(now)
  const cal = getCalibration(now)
  const pending = pendingErrorTags(now)
  const stats = getTodayStats(now)
  const daily = getDaily(now)
  const dailyStreak = getDailyStreak(now)
  const foundationGroups = allGroups(db, 'foundation')
  const foundationDone = todayDoneFor(db, 'foundation', now)
  const foundationTotal = foundationGroups.reduce((n, g) => n + g.items.length, 0)
  const [toast, setToast] = useState('')

  const groups = [...queue.due, ...queue.fresh]
  const mastered = Object.values(db.models).filter((m) => m.mastery_level >= 3).length
  const biasText =
    cal.bias == null ? '样本不足' : `${cal.bias > 0 ? '+' : ''}${cal.bias.toFixed(0)}`

  function start(groupId: string, kind: string) {
    setActiveGroup(groupId)
    const drill = DRILLS.find((d) => d.kind === kind)
    go(drill?.path ?? '/drills')
  }

  function tag(reviewId: string, value: (typeof ERROR_TAGS)[number]['value']) {
    if (setErrorTag(reviewId, value)) {
      setToast('已记下。错因只用于找系统性弱点，不进入任何排行榜。')
      window.setTimeout(() => setToast(''), 4000)
    } else {
      setToast('只能给今天之前的错题打标（冷静期规则）。')
      window.setTimeout(() => setToast(''), 4000)
    }
  }

  return (
    <div className="page">
      <header className="today-head">
        <div>
          <p className="eyebrow">{fmtDateFull(now)}</p>
          <h1>今天，练到该停的地方。</h1>
          <p className="page-head__intro">
            队列由引擎按到期时间、校准偏差和新卡上限决定。你不需要决定先做哪一项。
          </p>
          {db.reviews.length === 0 && (
            <p className="today-first">
              <button className="linkbtn" onClick={() => go('/guide')}>第一次来？先花 3 分钟看使用说明 →</button>
            </p>
          )}
        </div>
        <div className="today-head__badge">{queue.read_only ? '夜间模式' : '今日队列'}</div>
      </header>

      {queue.read_only && (
        <Notice tone="warn" title="23:30–06:00 夜间模式">
          夜间不推送新任务，队列会清空。但如果你现在就是想练，仍可从「训练」自选一组；系统不催你，也不拦你。
        </Notice>
      )}

      <div className="stat-row">
        <Stat label="连续学习" value={`${cal.streak} 天`} hint="有作答才算一天" />
        <Stat label="达标模型" value={mastered} hint="LV.3 熟练及以上" tone="good" />
        <Stat
          label="校准偏差"
          value={biasText}
          hint={cal.bias == null ? '至少 5 次作答后出结论' : cal.bias > 0 ? '正 = 高估自己' : '负 = 低估自己'}
          tone={cal.bias != null && Math.abs(cal.bias) > 20 ? 'warn' : undefined}
        />
      </div>

      <button className="foundation-strip" onClick={() => go('/foundation')}>
        <span>
          <b>基本功 · 辨异与重组</b>
          <em>一个词改变什么，一句话为什么排在这里。不是题型，是阅读和写作的共同底层。</em>
        </span>
        <span className="foundation-strip__side">
          {foundationTotal > 0 ? `${foundationDone} / ${foundationTotal}` : '去练'}
          <i>→</i>
        </span>
      </button>

      <section className="today-teaser">
        <div>
          <span className="eyebrow">日积月累 · 一字一象一技</span>
          <h2>{daily?.note ? '今天已经留下自己的句子。' : '今天还差一句自己的话。'}</h2>
          <p className="muted">
            {daily?.note
              ? daily.note
              : '读三样只算输入。写下一句具体的观察，才算今天真正带走了什么。'}
          </p>
        </div>
        <div className="today-teaser__side">
          <span className="tag tag--good">连续日课 {dailyStreak} 天</span>
          <button className="btn btn--primary" onClick={() => go('/daily')}>
            {daily?.note ? '看今日日课' : '去写今日一句'}
          </button>
        </div>
      </section>

      <div className="today-monitor">
        <span>
          今日已作答 <b>{stats.done}</b> 条 · 正确率{' '}
          <b>{stats.accuracy == null ? '—' : `${Math.round(stats.accuracy * 100)}%`}</b> · 约{' '}
          <b>{stats.minutes}</b> 分钟
        </span>
        <span className="muted tiny">监测，不是成就</span>
      </div>

      {groups.length === 0 ? (
        <>
          <Empty
            title={queue.read_only ? '夜间不派新任务' : '今日队列已清空'}
            hint={
              queue.read_only
                ? '明早再看，或从「训练」自选一组。已经到期的内容不会消失，引擎会重新排序。'
                : '宁可少而真，不可多而刷。想加练可以自选，但引擎不会催你。'
            }
            action={
              <div className="btn-row">
                <button className="btn btn--primary" onClick={() => go('/drills')}>
                  自选一组
                </button>
                <button className="btn" onClick={() => go('/me')}>
                  看学习档案
                </button>
              </div>
            }
          />
          {!queue.read_only && (
            <p className="muted center">
              今日队列已清空 · 队列上限 {db.settings.dailyCap} 条 · 完成量不是成就指标
            </p>
          )}
        </>
      ) : (
        <>
          <div className="section-head">
            <h2>今日队列</h2>
            <span className="muted">
              {queue.total_due > 0 ? `到期 ${queue.total_due} · ` : ''}
              {queue.total_fresh > 0 ? `新卡 ${queue.total_fresh}` : '无新卡'}
            </span>
          </div>
          <div className="queue">
            {groups.map((g) => {
              const kind = kindOf(g.items[0])
              if (!kind) return null
              return (
                <article key={g.group_id} className={`group-card ${g.urgent ? 'group-card--urgent' : ''}`}>
                  <div className="group-card__top">
                    <span className="tag">{kindLabel(kind)}</span>
                    {g.urgent && <span className="tag tag--warn">逾期较久</span>}
                    {g.new_count > 0 && g.due_count === 0 && <span className="tag tag--good">新卡</span>}
                  </div>
                  <h3>{g.title}</h3>
                  <p className="muted">{g.subtitle}</p>
                  <div className="group-card__foot">
                    <span className="muted">
                      {g.due_count > 0 ? `${g.due_count} 张到期` : ''}
                      {g.due_count > 0 && g.new_count > 0 ? ' · ' : ''}
                      {g.new_count > 0 ? `${g.new_count} 张新卡` : ''}
                      {g.due_count === 0 && g.new_count === 0 ? '今日已处理' : ''}
                    </span>
                    <button className="btn btn--primary" onClick={() => start(g.group_id, kind)}>
                      开始
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
          {queue.skipped_variants > 0 && (
            <p className="muted center">
              有 {queue.skipped_variants} 张卡片所属模型已达 LV.3，引擎停止主动推送变式。这是“达标即停”，不是遗漏。
            </p>
          )}
        </>
      )}

      {pending.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>隔日错因</h2>
            <span className="muted">冷静期已过 · 只给今天之前的错题打标</span>
          </div>
          <div className="pending-list">
            {pending.slice(0, 5).map(({ review, item }) => (
              <article key={review.review_id} className="pending">
                <div>
                  <b>{String(item.content.title ?? '错题')}</b>
                  <p className="muted">
                    {String(item.content.subtitle ?? '')} · {fmtDateFull(review.timestamp)}
                  </p>
                  {review.answer && <p className="pending__answer">你当时答：{review.answer}</p>}
                </div>
                <div className="error-tags">
                  {ERROR_TAGS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className="chip chip--small"
                      title={t.desc}
                      onClick={() => tag(review.review_id, t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
