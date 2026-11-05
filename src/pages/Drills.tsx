import { DRILLS, allGroups, kindOf, todayDoneFor } from '../engine/practice'
import { getQueue } from '../engine/store'
import { useDB, useNow } from '../ui/useDB'
import { PageHeader, Notice } from '../ui/common'

function go(path: string) {
  window.location.hash = path
}

export default function Drills() {
  const db = useDB()
  const now = useNow(60000)
  const queue = getQueue(now)
  const planned = [...queue.due, ...queue.fresh]

  return (
    <div className="page">
      <PageHeader
        eyebrow="根本能力 · 应用场"
        title="先练底层动作，再去做题"
        intro="六项不是题型，是六种底层操作：辨异、结构、积累、转化、感受、句法。考试只是它们的抽样；这里可以自选加练，引擎仍会把到期内容排进首页队列。"
      />

      <Notice tone={queue.read_only ? 'warn' : 'info'} title={queue.read_only ? '夜间模式' : '今日队列优先'}>
        {queue.read_only
          ? '23:30–06:00 不推送新任务；现在仍可自选练习，作答会正常记录。想休息就明早再来。'
          : planned.length > 0
            ? `首页还有 ${planned.length} 组到期/新卡。先清队列，再自选；加练不会提高任何“刷题量”指标。`
            : '今日队列已清空。自选练习仍会进入复习档案，但引擎不主动加量。'}
      </Notice>

      <div className="drill-grid">
        {[...DRILLS]
          .sort((a, b) => (a.kind === 'foundation' ? -1 : b.kind === 'foundation' ? 1 : 0))
          .map((d) => {
          const groups = d.kind === 'writing' ? [] : allGroups(db, d.kind)
          const done = d.kind === 'writing' ? 0 : todayDoneFor(db, d.kind, now)
          const inQueue = planned.filter((g) => kindOf(g.items[0]) === d.kind).length

          return (
            <article key={d.kind} className="drill-card">
              <div className="drill-card__top">
                <span className="tag">{d.ability}</span>
                {inQueue > 0 && <span className="tag tag--warn">队列 {inQueue}</span>}
              </div>
              <h2>{d.name}</h2>
              <p>{d.tagline}</p>
              <div className="drill-card__foot">
                <span className="muted">
                  {d.kind === 'writing'
                    ? '6 道题 · 先写后诊'
                    : `${groups.length} 组 · 今日已做 ${done}`}
                </span>
                <button className="btn btn--primary" onClick={() => go(d.path)}>
                  进入
                </button>
              </div>
            </article>
          )
        })}
      </div>

      <section className="section">
        <h2 className="section-title">限时抽样卷</h2>
        <p className="prose">
          考试只是它们的抽样——那就定期抽一次样。从你已学过的条目里按六维配比抽一小卷，限时覆盖，交卷出分；作答仍走同一条引擎链路，掌握度与校准照常更新。
        </p>
        <button className="btn btn--primary" onClick={() => go('/exam')}>
          组一张抽样卷
        </button>
      </section>

      <section className="section">
        <h2 className="section-title">自选也不会绕过引擎</h2>
        <p className="prose">
          所有作答仍写入同一份 reviews，推进 FSRS 与掌握度；同一模型连对 3 道不同条目才升档，答错立即降档。自选只是让你决定“现在练什么”，不改变“什么算学会”。
        </p>
      </section>
    </div>
  )
}
