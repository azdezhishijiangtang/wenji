import { useState } from 'react'
import type { FsrsCard, Item } from '../engine/types'
import { MODELS, MODEL_MAP } from '../content/models'
import { allGroups } from '../engine/practice'
import { addVariantItems, submitReview } from '../engine/store'
import { aiGenerateVariants } from '../engine/ai'
import { lintVariantDraft, makeVariantItem, type VariantDraft } from '../engine/variant'
import { useDB, useNow } from '../ui/useDB'
import { ConfidencePicker, Empty, Notice, PageHeader } from '../ui/common'

function go(path: string) {
  window.location.hash = path
}

function isDue(fsrs: FsrsCard | null, nowIso: string): boolean {
  return !fsrs || new Date(fsrs.dueAt).getTime() <= new Date(nowIso).getTime()
}

interface Prepared {
  draft: VariantDraft
  error: string | null
}

interface VariantOptionView {
  text: string
  is_correct: boolean
  explain: string
}

export default function Variant() {
  const db = useDB()
  const now = useNow(30000)
  const [tag, setTag] = useState(MODELS[0]?.tag ?? '')
  const [busy, setBusy] = useState(false)
  const [genMsg, setGenMsg] = useState('')
  const [prepared, setPrepared] = useState<Prepared[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [conf, setConf] = useState<number | null>(null)
  const [startedAt, setStartedAt] = useState(0)
  const [result, setResult] = useState<{ correct: boolean; change: string; nextDue: string } | null>(null)
  const [toast, setToast] = useState('')

  const groups = allGroups(db, 'variant')
  const pending = groups.flatMap((g) => g.items).filter((i) => i.status === 'active' && isDue(i.fsrs, now.toISOString()))
  const answered = groups.flatMap((g) => g.items).filter((i) => i.fsrs).length

  async function generate() {
    const model = MODEL_MAP.get(tag)
    if (!model) return
    if (!db.settings.ai.enabled || !db.settings.ai.apiKey) {
      setGenMsg('AI 未开启：先到「设置 → AI 接口」填 Key，生成后的质检与入库不依赖 AI。')
      return
    }
    setBusy(true)
    setGenMsg('生成中…同一模型、不同语境，出题引擎正在换壳。')
    setPrepared([])
    try {
      const samples = groups
        .flatMap((g) => g.items)
        .filter((i) => i.model_tag === tag)
        .slice(0, 2)
        .map((i) => ({ question: String(i.content.question ?? '') }))
      const raw = await aiGenerateVariants(db.settings.ai, model, samples)
      const list: Prepared[] = raw.map((r) => {
        const draft: VariantDraft = { model_tag: tag, question: r.question, options: r.options, insight: r.insight }
        return { draft, error: lintVariantDraft(draft) }
      })
      setPrepared(list)
      setChecked(new Set(list.map((p, idx) => (p.error == null ? idx : -1)).filter((i) => i >= 0)))
      const ok = list.filter((p) => p.error == null).length
      setGenMsg(ok ? `生成 ${list.length} 道，${ok} 道通过质检；被拒的显示了原因。确认无误再入库。` : '全部未通过质检，可重试或换一个模型。')
    } catch (e) {
      setGenMsg(e instanceof Error ? e.message : '生成失败')
    } finally {
      setBusy(false)
    }
  }

  function confirmImport() {
    const items = prepared
      .filter((p, idx) => p.error == null && checked.has(idx))
      .map((p) => makeVariantItem(p.draft, MODEL_MAP.get(p.draft.model_tag)!))
    if (!items.length) return
    const n = addVariantItems(items)
    setPrepared([])
    setChecked(new Set())
    setToast(`已入库 ${n} 道。它们会像种子条目一样进队列：今天推新卡，之后按 FSRS 回看。`)
    window.setTimeout(() => setToast(''), 5000)
  }

  function open(item: Item) {
    setOpenId(item.item_id)
    setPicked(null)
    setConf(null)
    setResult(null)
    setStartedAt(Date.now())
  }

  function submit(item: Item) {
    if (picked == null || conf == null) return
    const options = item.content.options as VariantOptionView[]
    const correct = options[picked]?.is_correct === true
    const timeSpent = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    const out = submitReview({ itemId: item.item_id, correct, confidence: conf, timeSpent }, new Date())
    setResult({ correct, change: out.mastery_change, nextDue: out.next_due })
  }

  const model = MODEL_MAP.get(tag)
  const importable = prepared.filter((p, idx) => p.error == null && checked.has(idx))

  return (
    <div className="page">
      <PageHeader
        eyebrow="换壳不换核"
        title="模型变式 · 工坊"
        intro="掌握度升级认的是“新题连对”。这里让 AI 按模型定义出新壳，你把关入库；入库后它就是正式条目，走队列、记掌握度、进校准。AI 只出题，判定权在你。"
      />

      {toast && <Notice tone="good" title="完成">{toast}</Notice>}

      <section className="section">
        <h2 className="section-title">生成</h2>
        <div className="form-row">
          <select
            className="input"
            value={tag}
            onChange={(e) => {
              setTag(e.target.value)
              setPrepared([])
              setGenMsg('')
            }}
          >
            {MODELS.map((m) => (
              <option key={m.tag} value={m.tag}>{m.name}</option>
            ))}
          </select>
          <button className="btn btn--primary" disabled={busy || !tag} onClick={() => void generate()}>
            {busy ? '生成中…' : '生成 3 道变式'}
          </button>
        </div>
        {model && <p className="muted">当前模型：{model.name} —— {model.definition}</p>}
        {genMsg && <p className="muted">{genMsg}</p>}

        {prepared.map((p, idx) => (
          <article key={idx} className={`group-card ${p.error ? 'group-card--urgent' : ''}`}>
            <div className="group-card__top">
              <span className="tag">{p.error ? '未通过质检' : `${p.draft.options.length} 选 1`}</span>
              {!p.error && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={checked.has(idx)}
                    onChange={(e) => {
                      const next = new Set(checked)
                      if (e.target.checked) next.add(idx)
                      else next.delete(idx)
                      setChecked(next)
                    }}
                  />
                  <span className="muted">入库</span>
                </label>
              )}
            </div>
            <h3>{p.draft.question}</h3>
            {p.error ? (
              <p className="muted">被拒原因：{p.error}</p>
            ) : (
              <>
                <ul className="prose">
                  {p.draft.options.map((o, oi) => (
                    <li key={oi}>
                      {o.is_correct ? '【正确】' : ''}{o.text} —— {o.explain}
                    </li>
                  ))}
                </ul>
                <p className="muted">考查要点：{p.draft.insight}</p>
              </>
            )}
          </article>
        ))}
        {importable.length > 0 && (
          <button className="btn btn--primary" onClick={confirmImport}>
            确认入库（{importable.length} 道）
          </button>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">作答（{pending.length} 道待作答 · 已答 {answered} 道）</h2>
        {pending.length === 0 ? (
          <Empty
            title={answered > 0 ? '变式都答完了' : '还没有变式条目'}
            hint={
              answered > 0
                ? '到期的会回到这个列表；也可以继续为其他模型生成新壳。'
                : '在上面选一个模型生成第一批变式；生成的题目过质检、你确认后才算数。'
            }
            action={<button className="btn" onClick={() => go('/drills')}>返回训练</button>}
          />
        ) : (
          <div className="queue">
            {groups.map((g) => {
              const dueItems = g.items.filter((i) => isDue(i.fsrs, now.toISOString()))
              if (!dueItems.length) return null
              return (
                <article key={g.id} className="group-card">
                  <div className="group-card__top">
                    <span className="tag">变式</span>
                    <span className="muted">{g.title}</span>
                  </div>
                  {dueItems.map((item) => {
                    const options = item.content.options as VariantOptionView[]
                    const isOpen = openId === item.item_id
                    return (
                      <div key={item.item_id} style={{ marginTop: 12 }}>
                        <h3>{String(item.content.question ?? '')}</h3>
                        {!isOpen ? (
                          <button className="btn btn--primary" onClick={() => open(item)}>作答</button>
                        ) : (
                          <>
                            <div className="prose" role="radiogroup" aria-label="选项">
                              {options.map((o, oi) => (
                                <label key={oi} style={{ display: 'block', margin: '6px 0', cursor: 'pointer' }}>
                                  <input
                                    type="radio"
                                    name={`opt-${item.item_id}`}
                                    checked={picked === oi}
                                    onChange={() => setPicked(oi)}
                                  />
                                  {' '}<b>{String.fromCharCode(65 + oi)}.</b> {o.text}
                                  {result && (
                                    <span className="muted"> —— {o.explain}{o.is_correct ? '（正确项）' : ''}</span>
                                  )}
                                </label>
                              ))}
                            </div>
                            {!result && (
                              <>
                                <ConfidencePicker value={conf} onChange={setConf} />
                                <button
                                  className="btn btn--primary"
                                  disabled={picked == null || conf == null}
                                  onClick={() => submit(item)}
                                >
                                  提交
                                </button>
                              </>
                            )}
                            {result && (
                              <p className="muted">
                                {result.correct ? '对。' : '错。'}{result.change} · 下次回看{' '}
                                {new Date(result.nextDue).toLocaleDateString()}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
