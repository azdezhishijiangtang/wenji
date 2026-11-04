import { useMemo, useState } from 'react'
import {
  getAbilityProfile,
  getCoachReports,
  getDailyHistory,
  getWeekly,
  saveCoachReport,
} from '../engine/store'
import { aiAbilityDiagnosis, aiProbe } from '../engine/ai'
import { recentMistakes, type AbilityDimension, type MistakeCard } from '../engine/diagnosis'
import { dayKey, daysAgoIso, fmtDateFull, pct } from '../engine/util'
import { useDB, useNow } from '../ui/useDB'
import { Notice, PageHeader, Stat } from '../ui/common'

function go(path: string) {
  window.location.hash = path
}

const ADVICE: Record<string, string> = {
  cloze:
    '做挖词时先遮住候选，自己填一个词，再看候选里谁最接近；错的时候写下“原词比我的词多了哪一格语义”。',
  argument:
    '每读一段先只做一件事：用一句话写出“作者到底想让读者相信什么”，再标每句在论证链里的位置。',
  classical:
    '文言不要背整句翻译。每次只记“这个词在这个语境里为什么是这个义项”，并回译一次。',
  syntax:
    '断句前先找动词和主语，再找“之、而、以、则”这些路标；每断一处都写依据，不靠语感。',
  appreciation:
    '精读批注只写你真正注意到的一处：哪个字让你停了一下，它改变了什么。不要写“表达了作者的感情”。',
  writing:
    '写作先练“一段三句”：观点句、论据句、推理句。写完后用追问检查论据有没有真的接住观点。',
}

const LABEL_TONE: Record<string, string> = {
  稳定: 'tag--good',
  较稳定: 'tag--good',
  形成中: 'tag',
  起步: 'tag--warn',
  未形成: 'tag--warn',
  证据不足: 'tag',
  过程记录: 'tag',
}

function Bar({ d }: { d: AbilityDimension }) {
  const w = d.index == null ? 0 : Math.max(3, d.index)
  return (
    <div className="ability-bar" aria-label={`${d.name} ${d.index ?? '证据不足'}`}>
      <span className={d.index == null ? 'ability-bar__fill ability-bar__fill--empty' : 'ability-bar__fill'} style={{ width: `${w}%` }} />
    </div>
  )
}

export default function Coach() {
  const db = useDB()
  const now = useNow(60000)
  const profile = getAbilityProfile(now)
  const weekly = getWeekly(now)
  const mistakes = recentMistakes(db, 6)
  const daily = getDailyHistory()
  const reports = getCoachReports()
  const latest = reports[0] ?? null
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [probe, setProbe] = useState<Record<string, string>>({})
  const [probeBusy, setProbeBusy] = useState('')
  const aiReady = db.settings.ai.enabled && Boolean(db.settings.ai.apiKey)

  const days30 = useMemo(
    () =>
      new Set(
        db.reviews
          .filter((r) => r.timestamp >= daysAgoIso(30, now))
          .map((r) => r.timestamp.slice(0, 10)),
      ).size,
    [db.reviews, now],
  )

  const local = useMemo(() => {
    const p = profile
    const scored = p.dimensions.filter((d) => d.scored && d.index != null)
    const gap = scored.slice().sort((a, b) => (a.index as number) - (b.index as number))[0] ?? null
    const strong = scored.slice().sort((a, b) => (b.index as number) - (a.index as number))[0] ?? null
    const summary =
      p.overall_index == null
        ? `目前只有 ${p.scored_dimensions} 个能力维度有作答证据，还不足以给出综合判断。先各练一组，让词义、论证、文言、句法、鉴赏都有可验证的记录；写作继续留草稿。`
        : `当前综合 ${p.overall_index}（${p.overall_label}）。最稳的是${strong?.name ?? '—'}，最该补的是${gap?.name ?? '—'}。${
            p.bias_30 != null && p.bias_30 > 20
              ? `校准偏差 +${p.bias_30.toFixed(0)}，说明你对自己会多少有系统性高估；下一轮先选“拿不准”的题，不要凭熟悉感跳步。`
              : p.bias_30 != null && p.bias_30 < -20
                ? `校准偏差 ${p.bias_30.toFixed(0)}，你偏保守；有些已会内容可能被重复投入。`
                : '校准偏差暂未越界，继续在作答前如实标把握度。'
          }`
    const gaps = scored
      .slice()
      .sort((a, b) => (a.index as number) - (b.index as number))
      .slice(0, 3)
      .map((d) => `${d.name}：指数 ${d.index}，覆盖 ${d.models_touched}/${d.models_total} 个模型，近 30 天正确率 ${d.accuracy_30 == null ? '—' : `${Math.round(d.accuracy_30 * 100)}%`}。`)
    if (profile.dimensions.some((d) => d.scored && d.index == null)) {
      const none = profile.dimensions.filter((d) => d.scored && d.index == null).map((d) => d.name)
      gaps.push(`${none.join('、')}：尚无足够作答，不能下结论。`)
    }
    return {
      summary,
      gaps,
      actions: (gap ? [ADVICE[gap.key]] : []).concat(
        profile.evidence_confidence === 'low'
          ? ['先连续 7 天各完成一组，再回来重看诊断；低样本下的分数只用于找方向。']
          : ['下周只盯一个薄弱维度，不要六个同时补。'],
      ),
      data_note: `依据近 30 天 ${profile.reviews_30} 条作答、${days30} 个学习日、${db.daily.length} 天日课、${db.drafts.length} 份写作草稿。能力指数不是考试分数。`,
    }
  }, [profile, db.daily.length, db.drafts.length, days30])

  async function runAI() {
    if (!aiReady) {
      setErr('先在设置里配置 AI 接口。')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const out = await aiAbilityDiagnosis(db.settings.ai, {
        profile: {
          overall_index: profile.overall_index,
          overall_label: profile.overall_label,
          evidence_confidence: profile.evidence_confidence,
          coverage: Math.round(profile.coverage * 100),
          reviews_30: profile.reviews_30,
          accuracy_30: profile.accuracy_30 == null ? null : Math.round(profile.accuracy_30 * 100),
          bias_30: profile.bias_30,
          dimensions: profile.dimensions.map((d) => ({
            name: d.name,
            index: d.index,
            label: d.label,
            coverage: `${d.models_touched}/${d.models_total}`,
            accuracy_30: d.accuracy_30 == null ? null : Math.round(d.accuracy_30 * 100),
            bias_30: d.bias_30,
            evidence: d.evidence,
            practice: d.practice,
          })),
        },
        mistakes: mistakes.map((m) => ({
          model: m.model_name,
          question: m.question,
          user_answer: m.review.answer ?? '（未记录）',
          correct: m.correct,
        })),
        daily_notes: daily.slice(0, 7).map((d) => `${d.date}：${d.note}`),
      })
      saveCoachReport({
        overall: profile.overall_index,
        summary: out.summary,
        strengths: out.strengths,
        gaps: out.gaps,
        actions: out.actions,
        data_note: out.data_note,
        ai: true,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'AI 诊断失败')
    } finally {
      setBusy(false)
    }
  }

  async function ask(m: MistakeCard, key: string) {
    if (!aiReady) {
      setErr('先在设置里配置 AI 接口。')
      return
    }
    setProbeBusy(key)
    setErr('')
    try {
      const text = await aiProbe(db.settings.ai, {
        model: m.model_name,
        definition: m.definition,
        question: m.question,
        userAnswer: m.review.answer ?? '（未记录）',
        correct: m.correct,
      })
      setProbe((p) => ({ ...p, [key]: text }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'AI 追问失败')
    } finally {
      setProbeBusy('')
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="能力诊断 · 不是分数"
        title="你现在缺的，不是更多题。"
        intro="诊断只从你的作答、校准、错因、日课和草稿里推导。样本少会明说“证据不足”，不会用漂亮数字骗你。"
        aside={<span className="tag">{fmtDateFull(now)}</span>}
      />

      <section className="coach-head">
        <div className="coach-score">
          <span className="eyebrow">综合能力指数</span>
          <strong>{profile.overall_index ?? '—'}</strong>
          <span className={`tag ${LABEL_TONE[profile.overall_label] ?? 'tag'}`}>{profile.overall_label}</span>
          <p className="muted tiny">
            证据置信度：{profile.evidence_confidence === 'low' ? '低' : profile.evidence_confidence === 'medium' ? '中' : '高'}
            {' · '}
            覆盖 {profile.touched_models}/{profile.total_models} 个模型
          </p>
        </div>
        <div className="coach-head__text">
          <p>{local.summary}</p>
          <p className="muted tiny">
            指数 = 掌握度 35% + 近 30 天正确率 25% + 覆盖 20% + 校准 20%。它衡量“可验证的行为证据”，不是高考估分。
          </p>
        </div>
      </section>

      <div className="stat-row">
        <Stat label="近 30 天作答" value={`${profile.reviews_30} 条`} hint={`${days30} 个学习日`} />
        <Stat label="日课" value={`${db.daily.length} 天`} hint="写过一句才算" tone="good" />
        <Stat label="写作草稿" value={`${db.drafts.length} 份`} hint="过程证据，不折算" />
      </div>

      <section className="section">
        <div className="section-head">
          <h2>六维能力</h2>
          <span className="muted">写作只记过程，不硬折算成分数</span>
        </div>
        <div className="ability-list">
          {profile.dimensions.map((d) => (
            <article className="ability-card" key={d.key}>
              <div className="ability-card__top">
                <div>
                  <h3>{d.name}</h3>
                  <p className="muted tiny">{d.ability}</p>
                </div>
                <div className="ability-card__score">
                  <strong>{d.index ?? '—'}</strong>
                  <span className={`tag ${LABEL_TONE[d.label] ?? 'tag'}`}>{d.label}</span>
                </div>
              </div>
              <Bar d={d} />
              <div className="ability-meta">
                <span>覆盖 {d.models_touched}/{d.models_total}</span>
                <span>近 30 天 {d.reviews_30} 条</span>
                <span>正确率 {d.accuracy_30 == null ? '—' : `${Math.round(d.accuracy_30 * 100)}%`}</span>
                <span>偏差 {d.bias_30 == null ? '—' : `${d.bias_30 > 0 ? '+' : ''}${Math.round(d.bias_30)}`}</span>
                {d.trend != null && <span>趋势 {d.trend > 0 ? '+' : ''}{d.trend}pp</span>}
                {d.practice > 0 && <span>{d.key === 'writing' ? `草稿 ${d.practice}` : `批注 ${d.practice}`}</span>}
              </div>
              {d.lowest_model && <p className="muted tiny">最低档：{d.lowest_model}</p>}
              {d.key === 'writing' && (
                <p className="muted tiny">写作没有客观对错，本站不把 AI 评语伪装成分数；用草稿数量、结构断点和你的修改记录看变化。</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>本地诊断</h2>
          <span className="muted">规则生成 · 不依赖 AI</span>
        </div>
        <div className="diagnosis-block">
          <h3>最主要矛盾</h3>
          {local.gaps.map((g, i) => (
            <p key={i}>{g}</p>
          ))}
          <h3>下一步</h3>
          <ul className="plain-list">
            {local.actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
          <p className="muted tiny">{local.data_note}</p>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>AI 深度诊断</h2>
          <span className="muted">可选 · 只解释已有数据</span>
        </div>
        <p className="muted">
          AI 会拿到六维指数、最近错题和日课笔记，但被限制为“只能解释、不能编造”。它不给范文、不给完整答案、不承诺提分。
        </p>
        <div className="btn-row">
          <button className="btn btn--primary" onClick={() => void runAI()} disabled={busy || !aiReady}>
            {busy ? '正在生成…' : latest?.ai ? '重新生成 AI 诊断' : '生成 AI 诊断'}
          </button>
          <button className="btn" onClick={() => go('/settings')}>配置 AI</button>
        </div>
        {!aiReady && <p className="muted tiny">AI 未配置。上面的本地诊断仍然完整可用。</p>}
        {err && <Notice tone="warn">{err}</Notice>}
        {latest && (
          <div className="report">
            <div className="report__head">
              <span className="tag tag--good">AI 诊断</span>
              <span className="muted tiny">{latest.created_at.slice(0, 16).replace('T', ' ')}</span>
            </div>
            <p>{latest.summary}</p>
            <div className="report__cols">
              <div>
                <h4>已经形成的</h4>
                <ul>
                  {latest.strengths.length ? latest.strengths.map((x, i) => <li key={i}>{x}</li>) : <li>暂无足够证据。</li>}
                </ul>
              </div>
              <div>
                <h4>最该补的</h4>
                <ul>
                  {latest.gaps.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            </div>
            <h4>接下来一周</h4>
            <ul>
              {latest.actions.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
            <p className="muted tiny">{latest.data_note}</p>
          </div>
        )}
      </section>

      {mistakes.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>最近错题</h2>
            <span className="muted">复盘用 · 点“AI 追问”只得到一个更具体的问题</span>
          </div>
          <div className="mistake-list">
            {mistakes.map((m, i) => {
              const key = `${m.item.item_id}-${i}`
              return (
                <article className="mistake" key={key}>
                  <div className="mistake__head">
                    <span className="tag">{m.model_name}</span>
                    <span className="muted tiny">{m.review.timestamp.slice(0, 10)}</span>
                  </div>
                  <p className="mistake__q">{m.question}</p>
                  <p className="muted tiny">你答：{m.review.answer || '（未记录）'}</p>
                  <p className="muted tiny">正确：{m.correct}</p>
                  <p className="mistake__advice">{m.advice}</p>
                  <button
                    className="btn btn--small"
                    disabled={!aiReady || probeBusy === key}
                    onClick={() => void ask(m, key)}
                  >
                    {probeBusy === key ? '追问中…' : 'AI 追问'}
                  </button>
                  {probe[key] && <div className="probe-box">{probe[key]}</div>}
                </article>
              )
            })}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>本周四信号</h2>
          <span className="muted">过程指标，不是成就</span>
        </div>
        <div className="signal-grid">
          {weekly.four_signals.map((s) => (
            <div className="signal" key={s.label}>
              <span className="muted tiny">{s.label}</span>
              <strong>{s.value}</strong>
            </div>
          ))}
        </div>
        <p className="muted tiny">
          诊断会随作答更新，但不会每天变一个说法。想验证它，去看校准曲线是否向对角线收敛、薄弱维度是否在 30 天里抬升。
        </p>
      </section>

      <p className="muted center">
        今日 {dayKey(now)} · 诊断只在本机计算；AI 调用由你手动触发。
      </p>
    </div>
  )
}
