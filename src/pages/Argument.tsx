import { useRef, useState } from 'react'
import { ARGUMENT_PASSAGES } from '../content/argument'
import { FALLACIES, STRUCTURE_TAGS, type Fallacy, type StructureTag } from '../engine/types'
import { allGroups, remainingItems, setActiveGroup, takeActiveGroup } from '../engine/practice'
import { getDB, submitReview } from '../engine/store'
import { useDB, useNow } from '../ui/useDB'
import { ConfidencePicker, Empty, Notice } from '../ui/common'

function go(path: string) {
  window.location.hash = path
}

const JUDGMENTS: (Fallacy | '忠实原文')[] = [...FALLACIES, '忠实原文']

export default function Argument() {
  const db = useDB()
  const now = useNow(30000)
  const readOnly = false // 夜间不派新任务，但自选练习不再锁死

  const boot = useRef<{ groupId: string } | null>(null)
  if (!boot.current) {
    const g = takeActiveGroup('argument', getDB(), now)
    boot.current = { groupId: g?.id ?? '' }
  }

  const [groupId, setGroupId] = useState(boot.current.groupId)
  const [stage, setStage] = useState<'label' | 'option' | 'done'>(() => {
    const g = allGroups(getDB(), 'argument').find((x) => x.id === boot.current!.groupId)
    if (!g) return 'done'
    const left = remainingItems(g, getDB(), now)
    if (left.some((i) => i.item_type === 'argument_label')) return 'label'
    if (left.some((i) => i.item_type === 'argument_option')) return 'option'
    return 'done'
  })
  const [tags, setTags] = useState<Record<string, StructureTag>>({})
  const [judgments, setJudgments] = useState<Record<string, Fallacy | '忠实原文'>>({})
  const [confidence, setConfidence] = useState<number | null>(null)
  const [feedbackA, setFeedbackA] = useState<Record<string, boolean> | null>(null)
  const [feedbackB, setFeedbackB] = useState<Record<string, boolean> | null>(null)
  const [error, setError] = useState('')
  const startRef = useRef(Date.now())

  const groups = allGroups(db, 'argument')
  const group = groups.find((g) => g.id === groupId)
  const passageId = group?.id.startsWith('argument:') ? group.id.slice(9) : ''
  const passage = ARGUMENT_PASSAGES.find((p) => p.id === passageId)
  const left = group ? remainingItems(group, db, now) : []
  const labelLeft = left.filter((i) => i.item_type === 'argument_label')
  const optionLeft = left.filter((i) => i.item_type === 'argument_option')

  function switchGroup(id: string) {
    const g = allGroups(getDB(), 'argument').find((x) => x.id === id)
    if (!g) return
    setActiveGroup(id)
    setGroupId(id)
    setTags({})
    setJudgments({})
    setConfidence(null)
    setFeedbackA(null)
    setFeedbackB(null)
    setStage(remainingItems(g, getDB(), now).some((i) => i.item_type === 'argument_label') ? 'label' : 'option')
    startRef.current = Date.now()
  }

  function submitLabels() {
    if (!passage || readOnly) return
    if (confidence == null) {
      setError('先选把握度，再提交这一组结构判断。')
      return
    }
    const results: Record<string, boolean> = {}
    for (const item of labelLeft) {
      const sid = String(item.content.sentenceId)
      const sentence = passage.sentences.find((s) => s.id === sid)
      if (!sentence) continue
      const picked = tags[sid]
      if (!picked) {
        setError('每一句都要选一个结构标签。')
        return
      }
      const correct = picked === sentence.tag
      results[item.item_id] = correct
      try {
        submitReview({
          itemId: item.item_id,
          correct,
          confidence,
          timeSpent: Math.max(1, Math.round((Date.now() - startRef.current) / 1000 / labelLeft.length)),
          answer: picked,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : '写入失败')
        return
      }
    }
    setFeedbackA(results)
    setError('')
    setConfidence(null)
  }

  function submitOptions() {
    if (!passage || readOnly) return
    if (confidence == null) {
      setError('先选把握度，再提交判定。')
      return
    }
    const results: Record<string, boolean> = {}
    for (const item of optionLeft) {
      const oid = String(item.content.optionId)
      const option = passage.options.find((o) => o.id === oid)
      if (!option) continue
      const picked = judgments[oid]
      if (!picked) {
        setError('每一个判断句都要选一项。')
        return
      }
      const correct =
        option.is_correct ? picked === '忠实原文' : picked === option.fallacy
      results[item.item_id] = correct
      try {
        const res = submitReview({
          itemId: item.item_id,
          correct,
          confidence,
          timeSpent: Math.max(1, Math.round((Date.now() - startRef.current) / 1000 / optionLeft.length)),
          answer: picked,
        })
        setError('')
        if (res.mastery_change && res.mastery_change.startsWith('升档')) {
          setError(`引擎：${res.mastery_change}`)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '写入失败')
        return
      }
    }
    setFeedbackB(results)
    setConfidence(null)
  }

  if (!passage || !group) {
    return (
      <div className="page">
        <Empty
          title="没有找到这段论证"
          hint="先回训练器选一篇。"
          action={<button className="btn btn--primary" onClick={() => go('/drills')}>返回训练器</button>}
        />
      </div>
    )
  }

  const effectiveStage =
    stage === 'label' && labelLeft.length === 0 && !feedbackA
      ? optionLeft.length > 0
        ? 'option'
        : 'done'
      : stage

  const allLabeled = passage.sentences.every((s) => tags[s.id])
  const allJudged = passage.options.every((o) => judgments[o.id])

  return (
    <div className="page">
      <div className="drill-head">
        <button className="link" onClick={() => go('/')}>← 今日队列</button>
        <span className="tag">篇章逻辑 · 论证 · {passage.title}</span>
      </div>

      <h1>{passage.title}</h1>
      <p className="page-head__intro">{passage.subtitle}</p>

      {effectiveStage === 'label' && (
        <>
          <div className="stage-bar">
            <span className={feedbackA ? 'stage stage--done' : 'stage stage--on'}>一 · 拆结构</span>
            <span className="stage-sep">→</span>
            <span className={feedbackA ? 'stage stage--on' : 'stage'}>二 · 判谬误</span>
          </div>

          <Notice tone="info">
            逐句点选：论点 / 论据 / 推理 / 让步 / 反驳 / 结论。先自己判断，提交后才看标准标注。
          </Notice>

          <article className="reading-paper">
            {passage.sentences.map((s, i) => (
              <div key={s.id} className={`sentence ${feedbackA ? (feedbackA[`a-${passage.id}-${s.id}`] ? 'sentence--good' : 'sentence--bad') : ''}`}>
                <p className="sentence__text">
                  <span className="sentence__no">{i + 1}</span>
                  {s.text}
                </p>
                <div className="tag-row">
                  {STRUCTURE_TAGS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`chip chip--small ${tags[s.id] === t ? 'chip--active' : ''}`}
                      disabled={Boolean(feedbackA) || readOnly}
                      onClick={() => setTags((v) => ({ ...v, [s.id]: t }))}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {feedbackA && (
                  <p className="sentence__note">
                    标准：<b>{s.tag}</b> · {s.note}
                    {tags[s.id] !== s.tag && <span className="muted">（你选：{tags[s.id] ?? '未选'}）</span>}
                  </p>
                )}
              </div>
            ))}
          </article>

          {!feedbackA && (
            <>
              <ConfidencePicker value={confidence} onChange={setConfidence} />
              {error && <Notice tone="bad">{error}</Notice>}
              {readOnly && <Notice tone="warn">夜间只读。</Notice>}
              <div className="btn-row">
                <button className="btn btn--primary" disabled={!allLabeled || readOnly} onClick={submitLabels}>
                  提交结构标注
                </button>
                {!allLabeled && <span className="muted">还有句子没选标签</span>}
              </div>
            </>
          )}

          {feedbackA && (
            <div className="feedback feedback--good">
              <p>
                结构标注已写入 reviews。下一阶段不换文章：同一段文字，反过来看命题人会在哪里制造干扰项。
              </p>
              <button className="btn btn--primary" onClick={() => setStage('option')}>
                进入干扰项判定
              </button>
            </div>
          )}
        </>
      )}

      {effectiveStage === 'option' && (
        <>
          <div className="stage-bar">
            <span className="stage stage--done">一 · 拆结构</span>
            <span className="stage-sep">→</span>
            <span className={feedbackB ? 'stage stage--done' : 'stage stage--on'}>二 · 判谬误</span>
          </div>

          <Notice tone="info">
            四个判断句中，有些忠实原文，有些各犯一类谬误。先判断每个句子属于哪一类；选“忠实原文”表示它没有谬误。
          </Notice>

          <details className="paper-details">
            <summary>回看原文</summary>
            <p>{passage.sentences.map((s) => s.text).join('')}</p>
          </details>

          <div className="option-list">
            {passage.options.map((o, i) => {
              const answered = Boolean(feedbackB)
              const ok = feedbackB?.[`ao-${passage.id}-${o.id}`]
              return (
                <article key={o.id} className={`judge-card ${answered ? (ok ? 'judge-card--good' : 'judge-card--bad') : ''}`}>
                  <p className="judge-card__text">
                    <span className="sentence__no">{i + 1}</span>
                    {o.text}
                  </p>
                  <div className="tag-row">
                    {JUDGMENTS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`chip chip--small ${judgments[o.id] === t ? 'chip--active' : ''}`}
                        disabled={answered || readOnly}
                        onClick={() => setJudgments((v) => ({ ...v, [o.id]: t }))}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  {answered && (
                    <div className="judge-card__foot">
                      <p>
                        正确答案：<b>{o.is_correct ? '忠实原文' : o.fallacy}</b>
                      </p>
                      <p className="muted">原文依据：{o.evidence}</p>
                      <p>{o.explain}</p>
                    </div>
                  )}
                </article>
              )
            })}
          </div>

          {!feedbackB && (
            <>
              <ConfidencePicker value={confidence} onChange={setConfidence} hint="这一组判定共用一个把握度，避免逐题打分打断判断。" />
              {error && <Notice tone="warn">{error}</Notice>}
              {readOnly && <Notice tone="warn">夜间只读。</Notice>}
              <div className="btn-row">
                <button className="btn btn--primary" disabled={!allJudged || readOnly} onClick={submitOptions}>
                  提交判定
                </button>
                {!allJudged && <span className="muted">还有判断句没选</span>}
              </div>
            </>
          )}

          {feedbackB && (
            <div className="feedback feedback--good">
              <p>
                {error || '判定已写入。识别正确的句子不会让掌握度升级，只有该谬误模型连续答对 3 道不同题才升档。'}
              </p>
              <button className="btn btn--primary" onClick={() => setStage('done')}>完成这一段</button>
            </div>
          )}
        </>
      )}

      {effectiveStage === 'done' && (
        <div>
          <Empty
            title="这一段今天完成了"
            hint="论证结构已进入复习档案。明天之后，谬误判定会按各类分别统计，不合并成一个“逻辑题正确率”。"
            action={
              <div className="btn-row">
                <button className="btn btn--primary" onClick={() => go('/')}>回今日队列</button>
                <button className="btn" onClick={() => go('/drills')}>换一篇</button>
              </div>
            }
          />
        </div>
      )}

      {groups.length > 1 && (
        <div className="section">
          <h3>换一篇</h3>
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
    </div>
  )
}
