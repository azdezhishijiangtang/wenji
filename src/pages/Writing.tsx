import { useEffect, useMemo, useRef, useState } from 'react'
import { WRITING_PROMPTS } from '../content/writing'
import { aiDiagnoseWriting, type AIDiagnosis } from '../engine/ai'
import { getDrafts, saveDraft } from '../engine/store'
import { useDB } from '../ui/useDB'
import { Notice } from '../ui/common'
import { scanWriting, sentenceDiff, type LocalScan } from './writingScan'

function go(path: string) {
  window.location.hash = path
}

const TAG_TONE: Record<string, string> = {
  观点: 'tag--ink',
  论据: 'tag--good',
  推理: 'tag--accent',
  让步: 'tag--muted',
  反驳: 'tag--warn',
  过渡: 'tag--muted',
  结论: 'tag--ink',
}

export default function Writing() {
  const db = useDB()
  const [promptId, setPromptId] = useState(WRITING_PROMPTS[0].id)
  const prompt = WRITING_PROMPTS.find((p) => p.id === promptId) ?? WRITING_PROMPTS[0]
  const [body, setBody] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [scan, setScan] = useState<LocalScan | null>(null)
  const [previous, setPrevious] = useState<string>('')
  const [aiScan, setAiScan] = useState<AIDiagnosis | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [notice, setNotice] = useState('')
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (startedAt == null) return
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [startedAt])

  const chars = body.replace(/\s/g, '').length
  const overTime = elapsed >= 20 * 60
  const drafts = useMemo(() => getDrafts(prompt.id), [prompt.id, scan])

  function edit(value: string) {
    setBody(value)
    if (startedAt == null && value.trim()) setStartedAt(Date.now())
  }

  function switchPrompt(id: string) {
    if (body.trim() && !window.confirm('切换题目会清空当前草稿（已提交的稿子仍留在本机）。继续？')) return
    setPromptId(id)
    setBody('')
    setStartedAt(null)
    setElapsed(0)
    setScan(null)
    setAiScan(null)
    setAiError('')
    setPrevious('')
    setNotice('')
  }

  function submit() {
    if (chars < 150) {
      setNotice('先写到 150 字再诊断。论点段需要足够长度，结构问题才会暴露。')
      return
    }
    const result = scanWriting(body)
    const before = getDrafts(prompt.id)
    const last = before[before.length - 1]
    saveDraft(prompt.id, body, result)
    setPrevious(last?.body ?? '')
    setScan(result)
    setAiScan(null)
    setAiError('')
    setNotice('')
  }

  async function askAI() {
    if (!scan) return
    setAiBusy(true)
    setAiError('')
    try {
      const result = await aiDiagnoseWriting(db.settings.ai, {
        prompt: prompt.title,
        material: prompt.material,
        body,
      })
      setAiScan(result)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI 诊断失败')
    } finally {
      setAiBusy(false)
    }
  }

  const diff = scan && previous ? sentenceDiff(previous, body) : null
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="page">
      <div className="drill-head">
        <button className="link" onClick={() => go('/')}>← 今日队列</button>
        <span className="tag">表达转化 · 写作</span>
      </div>

      <h1>先写，再看断点。</h1>
      <p className="page-head__intro">
        AI 只当裁判，不当枪手：不给范文、不代改写。每条断点以追问结尾，修正动作留给你。
      </p>

      <div className="prompt-chips">
        {WRITING_PROMPTS.map((p) => (
          <button
            key={p.id}
            className={`chip chip--small ${p.id === prompt.id ? 'chip--active' : ''}`}
            onClick={() => switchPrompt(p.id)}
          >
            {p.title}
          </button>
        ))}
      </div>

      <article className="reading-paper">
        <p className="eyebrow">材料</p>
        <p className="prose">{prompt.material}</p>
        <p className="prompt-line">{prompt.task}</p>
      </article>

      <div className="writing-head">
        <span className="muted">限时 20 分钟（软限时，超时只提醒）</span>
        <span className={overTime ? 'tag tag--warn' : 'tag'}>{mm}:{ss}</span>
      </div>

      <textarea
        ref={textRef}
        className="textarea textarea--writing"
        value={body}
        placeholder="在这里写论点段。先写完，再诊断；不要边写边等 AI 给句子。"
        onChange={(e) => edit(e.target.value)}
      />

      <div className="writing-foot">
        <span className={chars < 150 ? 'muted' : 'muted'}>
          {chars} 字 {chars < 150 ? `· 还差 ${150 - chars} 字` : chars > 300 ? '· 超过 300 字，注意收束' : '· 在 150–300 字区间'}
        </span>
        <button className="btn btn--primary" onClick={submit}>
          提交诊断
        </button>
      </div>

      {overTime && !scan && <Notice tone="warn">已超过 20 分钟。写完这一稿就停，不必追求一次完美。</Notice>}
      {notice && <Notice tone="warn">{notice}</Notice>}

      {scan && (
        <>
          <section className="section">
            <div className="section-head">
              <h2>逐句结构</h2>
              <span className="muted">规则扫描，不评分</span>
            </div>
            <div className="sentence-list">
              {scan.sentences.map((s, i) => (
                <div key={i} className="sentence-line">
                  <span className={`tag ${TAG_TONE[s.tag] ?? ''}`}>{s.tag}</span>
                  <p>{s.text}</p>
                </div>
              ))}
            </div>
            <div className="scan-summary">
              <span className={scan.summary.claim_clear ? 'ok' : 'warn'}>
                观点{scan.summary.claim_clear ? '在开头' : '不够清楚'}
              </span>
              <span>有效论据 {scan.summary.evidence_count}</span>
              <span>显性推理 {scan.summary.reasoning_steps}</span>
              <span>过渡 {scan.summary.transitions}</span>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>结构断点</h2>
              <span className="muted">{scan.breakpoints.length} 处</span>
            </div>
            {scan.breakpoints.length === 0 ? (
              <Notice tone="good">没有发现明显断点。可以读一遍，确认每句都在为观点做事。</Notice>
            ) : (
              <div className="breakpoints">
                {scan.breakpoints.map((b, i) => (
                  <article key={i} className="breakpoint">
                    <div className="breakpoint__head">
                      <span className="tag tag--warn">{b.type}</span>
                      <span className="muted">{b.where}</span>
                    </div>
                    <p>{b.issue}</p>
                    <p className="probe">{b.probe}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-head">
              <h2>AI 深度诊断</h2>
              <span className="muted">可选，仍受“不代写”约束</span>
            </div>
            {!db.settings.ai.enabled ? (
              <Notice tone="info">
                未开启 AI 诊断。规则扫描已经可用；需要更细的逐句判断时，到 <button className="link" onClick={() => go('/settings')}>设置</button> 填入 OpenAI 兼容接口。
              </Notice>
            ) : (
              <>
                <button className="btn" onClick={askAI} disabled={aiBusy}>
                  {aiBusy ? '诊断中…' : '调用 AI 诊断'}
                </button>
                {aiError && <Notice tone="bad">{aiError}</Notice>}
                {aiScan && (
                  <div className="ai-diagnosis">
                    <p className="muted">结构化结果，已通过追问与“不代写”校验。</p>
                    {aiScan.sentence_tags.map((s, i) => (
                      <div key={i} className="sentence-line">
                        <span className="tag">{s.tag}</span>
                        <p>{s.text}{s.note ? `（${s.note}）` : ''}</p>
                      </div>
                    ))}
                    {aiScan.breakpoints.map((b, i) => (
                      <article key={i} className="breakpoint">
                        <div className="breakpoint__head">
                          <span className="tag tag--warn">{b.type}</span>
                          <span className="muted">{b.where}</span>
                        </div>
                        <p>{b.issue}</p>
                        <p className="probe">{b.probe}</p>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {diff && (diff.added.length > 0 || diff.removed.length > 0) && (
            <section className="section">
              <div className="section-head">
                <h2>与上一稿相比</h2>
                <span className="muted">进步点显性化，不评分</span>
              </div>
              {diff.added.length > 0 && (
                <div className="diff-block">
                  <b>新增</b>
                  {diff.added.map((s, i) => <p key={i} className="diff-add">+ {s}</p>)}
                </div>
              )}
              {diff.removed.length > 0 && (
                <div className="diff-block">
                  <b>删去</b>
                  {diff.removed.map((s, i) => <p key={i} className="diff-del">− {s}</p>)}
                </div>
              )}
            </section>
          )}

          <section className="section">
            <div className="section-head">
              <h2>命题意图</h2>
              <span className="muted">写完才展示</span>
            </div>
            <p className="prose">{prompt.intent}</p>
            {drafts.length > 0 && <p className="muted">本题已保存 {drafts.length} 稿，保存在本机。</p>}
          </section>
        </>
      )}

      <div className="section">
        <h3>这里不会发生什么</h3>
        <ul className="plain-list">
          <li>不会给你一篇范文，也不会替你改写任何一句。</li>
          <li>不会给作文打分——分数会诱导你优化分数，而不是结构。</li>
          <li>不会把“看懂了”当成“会写了”。</li>
        </ul>
      </div>
    </div>
  )
}
