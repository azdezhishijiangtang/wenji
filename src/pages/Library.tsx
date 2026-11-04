import { useMemo, useState } from 'react'
import { IMAGERY, TECHNIQUES } from '../content/appreciation'
import { CLASSICAL_ENTRIES } from '../content/classical'
import { Empty } from '../ui/common'

function go(path: string) {
  window.location.hash = path
}

type Tab = 'technique' | 'imagery' | 'classical'

const TABS: { id: Tab; label: string; count: number }[] = [
  { id: 'technique', label: '手法', count: TECHNIQUES.length },
  { id: 'imagery', label: '意象', count: IMAGERY.length },
  { id: 'classical', label: '文言', count: CLASSICAL_ENTRIES.length },
]

function Example({ text }: { text: string }) {
  const parts = text.split(/\{\{(.+?)\}\}/g)
  return (
    <p className="dict-example">
      {parts.map((part, i) =>
        i % 2 === 1 ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>,
      )}
    </p>
  )
}

export default function Library() {
  const [tab, setTab] = useState<Tab>('technique')
  const [q, setQ] = useState('')
  const [classicalType, setClassicalType] = useState<'全部' | '虚词' | '实词'>('全部')

  const keyword = q.trim()

  const techniques = useMemo(() => {
    if (!keyword) return TECHNIQUES
    return TECHNIQUES.filter((t) =>
      [t.name, t.definition, t.signals, t.effect, t.example].some((s) => s.includes(keyword)),
    )
  }, [keyword])

  const imagery = useMemo(() => {
    if (!keyword) return IMAGERY
    return IMAGERY.filter((i) =>
      [i.image, i.emotion, i.example, i.note].some((s) => s.includes(keyword)),
    )
  }, [keyword])

  const classical = useMemo(() => {
    return CLASSICAL_ENTRIES.filter((e) => {
      if (classicalType !== '全部' && e.type !== classicalType) return false
      if (!keyword) return true
      return [e.word, e.sense, e.example, e.translation, e.source, e.note].some((s) =>
        s.includes(keyword),
      )
    })
  }, [keyword, classicalType])

  return (
    <div className="page">
      <div className="drill-head">
        <button className="link" onClick={() => go('/')}>← 今日队列</button>
        <span className="tag">词典库 · 只读</span>
      </div>

      <h1>查得到的，不等于拿得出。</h1>
      <p className="page-head__intro">
        词典解决“见过”：手法 30 条、意象 40 组、文言 42 条。要进入掌握度，必须去对应训练器闭卷作答——在这里翻一遍不算复习。
      </p>

      <div className="tab-bar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'tab tab--on' : 'tab'} onClick={() => setTab(t.id)}>
            {t.label} <span className="tab__count">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="library-tools">
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === 'classical' ? '搜词、义项、例句、出处' : tab === 'imagery' ? '搜意象、情感、例句' : '搜手法、标志、效果'}
        />
        {tab === 'classical' && (
          <div className="segmented">
            {(['全部', '虚词', '实词'] as const).map((v) => (
              <button
                key={v}
                className={classicalType === v ? 'seg seg--on' : 'seg'}
                onClick={() => setClassicalType(v)}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'technique' && (
        <section className="dict-list">
          {techniques.length === 0 ? (
            <Empty title="没有匹配的手法" hint="换个关键词，或清空搜索。" />
          ) : (
            techniques.map((t) => (
              <details key={t.id} className="dict-card">
                <summary>
                  <b>{t.name}</b>
                  <span>{t.definition}</span>
                </summary>
                <div className="dict-body">
                  <p><span className="dict-label">判定标志</span>{t.signals}</p>
                  <p><span className="dict-label">效果公式</span>{t.effect}</p>
                  <p><span className="dict-label">例句</span>{t.example}</p>
                </div>
              </details>
            ))
          )}
        </section>
      )}

      {tab === 'imagery' && (
        <section className="imagery-grid">
          {imagery.length === 0 ? (
            <Empty title="没有匹配的意象" hint="试试“月”“柳”“雁”。" />
          ) : (
            imagery.map((i) => (
              <article key={i.id} className="imagery-card">
                <div className="imagery-card__head">
                  <b>{i.image}</b>
                  <span className="tag">{i.emotion}</span>
                </div>
                <p className="dict-example">{i.example}</p>
                <p className="muted">{i.note}</p>
              </article>
            ))
          )}
        </section>
      )}

      {tab === 'classical' && (
        <section className="dict-list">
          {classical.length === 0 ? (
            <Empty title="没有匹配的词条" hint="换个词，或切换虚词/实词。" />
          ) : (
            classical.map((e) => (
              <article key={e.id} className="dict-card dict-card--open">
                <div className="dict-head">
                  <div>
                    <b className="dict-word">{e.word}</b>
                    <span className="tag tag--muted">{e.type}</span>
                  </div>
                  <span className="muted">{e.sense}</span>
                </div>
                <Example text={e.example} />
                <p>{e.translation}</p>
                <p className="muted">出处：{e.source}</p>
                <p className="dict-note">{e.note}</p>
              </article>
            ))
          )}
        </section>
      )}

      <p className="muted library-foot">
        词条全部来自课内文言与公版经典，出处可追溯。词条挂 model_tag；掌握度在作答档案里，不在这里。
      </p>
    </div>
  )
}
