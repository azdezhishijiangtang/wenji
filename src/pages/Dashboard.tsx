import { useMemo, useState } from 'react'
import { getCalibration, getErrorFingerprint, getWeekly } from '../engine/store'
import { masteryLabel } from '../engine/analytics'
import { MASTERY_LABELS, type CalibrationBin, type ModelStat } from '../engine/types'
import { fmtDate } from '../engine/util'
import { useDB, useNow } from '../ui/useDB'
import { Empty, LevelBadge, MasteryDots, Meter, Notice, Stat } from '../ui/common'

function go(path: string) {
  window.location.hash = path
}

type Tab = 'week' | 'calib' | 'models'

const FAMILIES: { key: string; label: string; prefixes: string[] }[] = [
  { key: 'all', label: '全部', prefixes: [] },
  { key: 'cloze', label: '辨异', prefixes: ['cloze.'] },
  { key: 'argument', label: '逻辑', prefixes: ['argument.'] },
  { key: 'classical', label: '文言', prefixes: ['classical.'] },
  { key: 'appreciation', label: '感受', prefixes: ['appreciation.'] },
  { key: 'syntax', label: '句法', prefixes: ['syntax.'] },
  { key: 'writing', label: '转化', prefixes: ['writing.'] },
  { key: 'foundation', label: '基本功', prefixes: ['foundation.'] },
]

function familyOf(tag: string): string {
  if (tag.startsWith('foundation.')) return 'foundation'
  if (tag.startsWith('argument.')) return 'argument'
  if (tag.startsWith('classical.')) return 'classical'
  if (tag.startsWith('appreciation.')) return 'appreciation'
  if (tag.startsWith('syntax.')) return 'syntax'
  if (tag.startsWith('writing.')) return 'writing'
  return 'cloze'
}

function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${Math.round(n)}`
}

export default function Dashboard() {
  const db = useDB()
  useNow(60000)
  const [tab, setTab] = useState<Tab>('week')
  const [family, setFamily] = useState('all')
  const [onlyTouched, setOnlyTouched] = useState(true)

  const calibration = getCalibration()
  const weekly = getWeekly()
  const errors = getErrorFingerprint()
  const totalErrors = errors.reduce((s, e) => s + e.count, 0)
  const mastered = Object.values(db.models).filter((m) => m.mastery_level >= 3).length
  const touched = Object.values(db.models).filter((m) => m.mastery_level > 0).length

  const models = useMemo(() => {
    return calibration.stats
      .filter((s) => family === 'all' || familyOf(s.model_tag) === family)
      .filter((s) => !onlyTouched || s.level > 0)
      .slice()
      .sort((a, b) => b.level - a.level || b.n - a.n || a.name.localeCompare(b.name))
  }, [calibration.stats, family, onlyTouched])

  const dist = [0, 1, 2, 3, 4].map((lv) => ({
    level: lv,
    count: Object.values(db.models).filter((m) => m.mastery_level === lv).length,
  }))

  return (
    <div className="page">
      <div className="drill-head">
        <button className="link" onClick={() => go('/')}>← 今日队列</button>
        <span className="tag">学习档案 · 只读诊断</span>
      </div>

      <h1>看资产，不看题量。</h1>
      <p className="page-head__intro">
        这里只回答四个问题：会了多少模型、校准有没有变准、错因有没有被消灭、变式还稳不稳。刷题数量不进入任何成就。
      </p>

      <div className="tab-bar">
        <button className={tab === 'week' ? 'tab tab--on' : 'tab'} onClick={() => setTab('week')}>本周</button>
        <button className={tab === 'calib' ? 'tab tab--on' : 'tab'} onClick={() => setTab('calib')}>校准</button>
        <button className={tab === 'models' ? 'tab tab--on' : 'tab'} onClick={() => setTab('models')}>模型</button>
      </div>

      {tab === 'week' && (
        <>
          <div className="stat-grid">
            <Stat label="达标模型" value={`${mastered}`} hint="LV.3 起，停止主动推新变式" />
            <Stat label="连续学习" value={`${calibration.streak} 天`} hint="以有作答的日期计" />
            <Stat label="本周时长" value={`${weekly.minutes} 分`} hint={`${weekly.days_studied} 天有学习`} />
            <Stat
              label="校准偏差"
              value={calibration.bias == null ? '样本不足' : signed(calibration.bias)}
              hint="正数=高估自己；|偏差| 越小越准"
            />
          </div>

          <section className="section">
            <div className="section-head">
              <h2>本周报告</h2>
              <span className="muted">{fmtDate(weekly.from)} — {fmtDate(weekly.to)}</span>
            </div>
            <div className="four-signals">
              {weekly.four_signals.map((s) => (
                <div key={s.label} className={`signal ${s.ok === true ? 'signal--good' : s.ok === false ? 'signal--bad' : ''}`}>
                  <span className="muted">{s.label}</span>
                  <b>{s.value}</b>
                  <span className="signal__mark">{s.ok === true ? '在变好' : s.ok === false ? '要留意' : '样本不足'}</span>
                </div>
              ))}
            </div>

            {weekly.level_ups.length > 0 && (
              <div className="level-ups">
                <h3>本周升档</h3>
                {weekly.level_ups.map((u, i) => (
                  <p key={i}><b>{u.name}</b> · {MASTERY_LABELS[u.from]} → {MASTERY_LABELS[u.to]}</p>
                ))}
              </div>
            )}

            <div className="report-cols">
              <div>
                <h3>错误指纹（近 30 天）</h3>
                {totalErrors === 0 ? (
                  <p className="muted">还没有带错因标签的错题。错因在隔日重做时才打，别急着归因。</p>
                ) : (
                  <div className="bars">
                    {errors.filter((e) => e.count > 0).map((e) => (
                      <div key={e.tag} className="bar-row">
                        <span className="bar-label">{e.label}</span>
                        <Meter value={e.count / Math.max(1, errors[0].count)} tone="ink" />
                        <span className="bar-value">{e.count}</span>
                      </div>
                    ))}
                    <p className="muted">Top2 是系统性弱点：{errors[0]?.label}{errors[1] && errors[1].count > 0 ? `、${errors[1].label}` : ''}。</p>
                  </div>
                )}
              </div>
              <div>
                <h3>下周建议</h3>
                <ul className="plain-list">
                  {weekly.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>高估榜 Top3</h2>
              <span className="muted">自评高、实际低</span>
            </div>
            {calibration.over.length === 0 ? (
              <p className="muted">样本 ≥5 且偏差 &gt; +20 的模型才会进榜。现在没有，不代表校准已经很好。</p>
            ) : (
              <div className="model-mini-list">
                {calibration.over.slice(0, 3).map((s) => (
                  <div key={s.model_tag} className="model-mini">
                    <span>{s.name}</span>
                    <b className="bad">+{Math.round(s.bias)}</b>
                    <span className="muted">{s.n} 次</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'calib' && (
        <>
          <section className="section">
            <div className="section-head">
              <h2>校准曲线（近 30 天）</h2>
              <span className="muted">横轴把握度，纵轴实际正确率</span>
            </div>
            <CalibrationChart bins={calibration.bins} />
            <p className="muted">
              对角线是完美校准。点落在对角线下方 = 高估（说 80，实际 50）；落在上方 = 低估（会了却不敢信）。
              偏差公式：mean(confidence) − accuracy×100。
            </p>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>高估榜</h2>
              <span className="muted">bias &gt; +20 且 n ≥ 5</span>
            </div>
            {calibration.over.length === 0 ? (
              <p className="muted">暂无。高估榜是“你以为你会了”的雷区清单。</p>
            ) : (
              <div className="model-table">
                {calibration.over.map((s) => (
                  <div key={s.model_tag} className="model-row">
                    <span>{s.name}</span>
                    <span className="bad">+{Math.round(s.bias)}</span>
                    <span className="muted">n={s.n}</span>
                    <span className="muted">正确率 {Math.round(s.accuracy * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-head">
              <h2>低估榜</h2>
              <span className="muted">bias &lt; −20 且 n ≥ 5</span>
            </div>
            {calibration.under.length === 0 ? (
              <p className="muted">暂无。低估意味着你在已经会的内容上重复投入。</p>
            ) : (
              <div className="model-table">
                {calibration.under.map((s) => (
                  <div key={s.model_tag} className="model-row">
                    <span>{s.name}</span>
                    <span className="good">{Math.round(s.bias)}</span>
                    <span className="muted">n={s.n}</span>
                    <span className="muted">正确率 {Math.round(s.accuracy * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <h3>分箱明细</h3>
            <div className="model-table">
              <div className="model-row model-row--head">
                <span>把握度</span><span>作答数</span><span>实际正确率</span><span></span>
              </div>
              {calibration.bins.map((b) => (
                <div key={b.label} className="model-row">
                  <span>{b.label}</span>
                  <span>{b.n}</span>
                  <span>{b.accuracy == null ? '—' : `${Math.round(b.accuracy * 100)}%`}</span>
                  <span className="muted">{b.n > 0 ? '有样本' : '待积累'}</span>
                </div>
              ))}
            </div>
            <p className="muted">样本 &lt;5 时不给模型级结论，避免用几次巧合给自己贴标签。</p>
          </section>
        </>
      )}

      {tab === 'models' && (
        <>
          <section className="section">
            <div className="section-head">
              <h2>掌握度分布</h2>
              <span className="muted">已接触 {touched} / {Object.keys(db.models).length} 个模型</span>
            </div>
            <div className="dist">
              {dist.map((d) => (
                <div key={d.level} className="dist-row">
                  <span className="dist-label">{MASTERY_LABELS[d.level]}</span>
                  <Meter value={d.count / Math.max(1, Object.keys(db.models).length)} tone={d.level >= 3 ? 'sage' : 'accent'} />
                  <span className="muted">{d.count}</span>
                </div>
              ))}
            </div>
            <p className="muted">
              档位只由作答数据驱动，没有“标为已掌握”的按钮。校准偏差 &gt; +10 时，连对只累计、不升档。
            </p>
          </section>

          <div className="library-tools">
            <div className="segmented segmented--wrap">
              {FAMILIES.map((f) => (
                <button key={f.key} className={family === f.key ? 'seg seg--on' : 'seg'} onClick={() => setFamily(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={onlyTouched} onChange={(e) => setOnlyTouched(e.target.checked)} />
              只看已接触
            </label>
          </div>

          {models.length === 0 ? (
            <Empty
              title={onlyTouched ? '这个分类还没有已接触的模型' : '没有匹配的模型'}
              hint="去今日队列做一组；作答会自动建档。"
              action={<button className="btn btn--primary" onClick={() => go('/')}>去今日队列</button>}
            />
          ) : (
            <div className="model-cards">
              {models.map((s) => (
                <ModelCard key={s.model_tag} stat={s} streak={db.models[s.model_tag]?.variant_streak ?? 0} bias={db.models[s.model_tag]?.calib_bias ?? null} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ModelCard({ stat, streak, bias }: { stat: ModelStat; streak: number; bias: number | null }) {
  return (
    <article className="model-card">
      <div className="model-card__head">
        <div>
          <b>{stat.name}</b>
          <span className="model-tag">{stat.model_tag}</span>
        </div>
        <LevelBadge level={stat.level} />
      </div>
      <div className="model-card__meta">
        <MasteryDots level={stat.level} />
        <span className="muted">连对 {streak}/3</span>
        <span className="muted">近 30 天 n={stat.n}</span>
        {stat.n >= 5 ? (
          <span className={stat.bias > 10 ? 'bad' : stat.bias < -10 ? 'good' : 'muted'}>
            偏差 {signed(stat.bias)}
          </span>
        ) : (
          <span className="muted">偏差样本不足</span>
        )}
      </div>
      {bias != null && stat.n < 5 && <p className="muted tiny">滚动校准偏差 {signed(bias)}（样本不足，仅供参考）</p>}
      <p className="muted tiny">{masteryLabel(stat.level)}</p>
    </article>
  )
}

function CalibrationChart({ bins }: { bins: CalibrationBin[] }) {
  const W = 340
  const H = 230
  const pad = { l: 34, r: 12, t: 12, b: 30 }
  const px = (v: number) => pad.l + (v / 100) * (W - pad.l - pad.r)
  const py = (v: number) => pad.t + (1 - v / 100) * (H - pad.t - pad.b)
  const points = bins
    .filter((b) => b.n > 0 && b.accuracy != null)
    .map((b) => ({ x: (b.low + b.high) / 2, y: (b.accuracy as number) * 100, n: b.n, label: b.label }))
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.x)} ${py(p.y)}`).join(' ')

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="校准曲线">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={px(0)} y1={py(v)} x2={px(100)} y2={py(v)} className="chart-grid" />
            <text x={pad.l - 6} y={py(v) + 3} textAnchor="end" className="chart-text">{v}</text>
          </g>
        ))}
        {[0, 50, 100].map((v) => (
          <text key={v} x={px(v)} y={H - 8} textAnchor="middle" className="chart-text">{v}</text>
        ))}
        <line x1={px(0)} y1={py(0)} x2={px(100)} y2={py(100)} className="chart-diag" />
        {points.length > 0 && <path d={path} className="chart-line" />}
        {points.map((p) => (
          <g key={p.label}>
            <circle cx={px(p.x)} cy={py(p.y)} r={4} className={p.y >= p.x ? 'chart-dot chart-dot--under' : 'chart-dot chart-dot--over'}>
              <title>{p.label}：{p.n} 次，正确率 {Math.round(p.y)}%</title>
            </circle>
          </g>
        ))}
        <text x={(px(0) + px(100)) / 2} y={H - 8} textAnchor="middle" className="chart-text">作答前把握度</text>
      </svg>
      <div className="chart-legend">
        <span><i className="dot dot--under" /> 低估</span>
        <span><i className="dot dot--over" /> 高估</span>
        <span className="muted">虚线 = 完美校准</span>
      </div>
    </div>
  )
}
