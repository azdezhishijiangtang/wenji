import { useMemo, useRef, useState } from 'react'
import {
  FOUNDATION_COHERENCE,
  FOUNDATION_SEMANTIC,
  type CoherenceItem,
  type SemanticItem,
} from '../content/foundation'
import type { Item, ReviewResult } from '../engine/types'
import { reviewedTodayIds, seededShuffle } from '../engine/practice'
import { submitReview } from '../engine/store'
import { useDB, useNow } from '../ui/useDB'
import { ConfidencePicker, Notice, PageHeader } from '../ui/common'

type Tab = 'semantic' | 'coherence'

function go(path: string) {
  window.location.hash = path
}

function itemId(id: string) {
  return `f-${id}`
}

export default function Foundation() {
  const db = useDB()
  const now = useNow(60000)
  const night = false // 夜间不派新任务，但自选练习不再锁死
  const [tab, setTab] = useState<Tab>('semantic')

  function itemsFor(t: Tab): Item[] {
    const defs = t === 'semantic' ? FOUNDATION_SEMANTIC : FOUNDATION_COHERENCE
    return defs.map((d) => db.items[itemId(d.id)]).filter((i): i is Item => Boolean(i))
  }

  function firstRemainingId(t: Tab): string | null {
    const done = reviewedTodayIds(db, now)
    return itemsFor(t).find((i) => !done.has(i.item_id))?.item_id ?? null
  }

  const [activeId, setActiveId] = useState<string | null>(() => firstRemainingId('semantic'))

  const semanticItems = useMemo(() => itemsFor('semantic'), [db])
  const coherenceItems = useMemo(() => itemsFor('coherence'), [db])
  const list = tab === 'semantic' ? semanticItems : coherenceItems
  const done = reviewedTodayIds(db, now)
  const remaining = list.filter((i) => !done.has(i.item_id))
  const active = activeId ? db.items[activeId] ?? null : null
  const progress = list.length ? (list.length - remaining.length) / list.length : 0

  function switchTab(next: Tab) {
    if (next === tab) return
    setTab(next)
    setActiveId(firstRemainingId(next))
  }

  function next() {
    setActiveId(firstRemainingId(tab))
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="根本能力 · 底层动作"
        title="先练辨异与重组，再去做题"
        intro="考试题是抽样，底层动作才是能力。辨异练的是“一个词改变了什么”，重组练的是“句子为什么只能这样排”。这两件事在阅读和写作里每天都在发生。"
        aside={
          <div className="foundation-progress">
            <span className="eyebrow">今日这一组</span>
            <strong>
              {list.length - remaining.length}/{list.length}
            </strong>
            <span className="muted tiny">完成量不是成就</span>
          </div>
        }
      />

      {night && (
        <Notice tone="warn" title="夜间只读">
          23:30–06:00 不产生新的作答记录。现在可以读题、看解析，明天再来排。
        </Notice>
      )}

      <div className="foundation-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'semantic'}
          className={`chip ${tab === 'semantic' ? 'chip--active' : ''}`}
          onClick={() => switchTab('semantic')}
        >
          辨异 · 一个词改变什么
        </button>
        <button
          role="tab"
          aria-selected={tab === 'coherence'}
          className={`chip ${tab === 'coherence' ? 'chip--active' : ''}`}
          onClick={() => switchTab('coherence')}
        >
          重组 · 句子为什么这样排
        </button>
      </div>

      <div className="foundation-meter" aria-hidden="true">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      {!active ? (
        <section className="section">
          <div className="empty">
            <h2>这一组今天做完了</h2>
            <p>
              不是“刷完了”，是今天的证据已经够了。明天它会按 FSRS 回到队列；想继续，可以换一组或去读一段。
            </p>
            <div className="btn-row">
              <button className="btn" onClick={() => switchTab(tab === 'semantic' ? 'coherence' : 'semantic')}>
                换一组
              </button>
              <button className="btn btn--ghost" onClick={() => go('/daily')}>
                去日课
              </button>
            </div>
          </div>
        </section>
      ) : tab === 'semantic' ? (
        <SemanticCard
          key={active.item_id}
          item={active}
          pair={FOUNDATION_SEMANTIC.find((s) => s.id === active.content.refId)}
          night={night}
          onNext={next}
        />
      ) : (
        <CoherenceCard
          key={active.item_id}
          item={active}
          task={FOUNDATION_COHERENCE.find((c) => c.id === active.content.refId)}
          night={night}
          onNext={next}
        />
      )}

      <section className="section">
        <h2 className="section-title">为什么是这两件事</h2>
        <p className="prose">
          阅读的绝大多数错误，不是“没背过”，而是把词的范围读大了、把句子的关系读反了；写作的绝大多数问题，也不是“没素材”，而是句子之间没有真正的推进。辨异和重组，正好对应这两个底层动作。
        </p>
        <p className="prose muted">
          它们不替代文言积累、句法、鉴赏和写作，只是把那些训练背后的共同能力单独拎出来。练完这里，再回到六项应用场，你会更容易知道自己错在哪一层。
        </p>
      </section>
    </div>
  )
}

function SemanticCard({
  item,
  pair: pairMaybe,
  night,
  onNext,
}: {
  item: Item
  pair: SemanticItem | undefined
  night: boolean
  onNext: () => void
}) {
  const [confidence, setConfidence] = useState<number | null>(null)
  const [choice, setChoice] = useState<'a' | 'b' | null>(null)
  const [why, setWhy] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<ReviewResult | null>(null)
  const started = useRef(Date.now())

  if (!pairMaybe) {
    return (
      <Notice tone="bad" title="内容没有找到">
        这条内容的 id 是 {item.item_id}，可能是旧备份；去设置里导出后重新导入，或重置学习数据。
      </Notice>
    )
  }
  const pair = pairMaybe

  const parts = pair.context.split('____')

  function submit() {
    if (night) return
    if (confidence == null) {
      setError('先选把握度。它记录的是作答前的判断，不是对错。')
      return
    }
    if (!choice) {
      setError('先选一个词。')
      return
    }
    if (why.trim().length < 8) {
      setError('再用一句话说出：为什么不是另一个？至少 8 个字。')
      return
    }
    try {
      const out = submitReview(
        {
          itemId: item.item_id,
          correct: choice === pair.answer,
          confidence,
          timeSpent: Math.max(1, Math.round((Date.now() - started.current) / 1000)),
          answer: `${choice}|${why.trim()}`,
        },
        new Date(),
      )
      setResult(out)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '写入失败')
    }
  }

  return (
    <section className="foundation-card reading-paper">
      <div className="foundation-card__head">
        <span className="eyebrow">辨异 · {pair.title}</span>
        <span className="tag">{item.model_tag}</span>
      </div>
      <p className="semantic-context">
        {parts[0]}
        <span className={`blank ${result ? 'blank--done' : ''}`}>
          {result ? (choice === 'a' ? pair.a : pair.b) : '＿＿'}
        </span>
        {parts[1]}
      </p>
      <p className="muted">
        先判断哪一个词更贴合句子的预设，再写一句为什么。答案本身不值钱，能说出差别才值钱。
      </p>

      <div className="confidence-block">
        <span className="eyebrow">作答前把握度</span>
        <ConfidencePicker value={confidence} onChange={setConfidence} hint="这一步记录校准，不是打分" />
      </div>

      <div className="choice-row">
        {(['a', 'b'] as const).map((k) => {
          const word = k === 'a' ? pair.a : pair.b
          const chosen = choice === k
          const isAnswer = result && pair.answer === k
          return (
            <button
              key={k}
              className={`choice-card ${chosen ? 'choice-card--chosen' : ''} ${
                isAnswer ? 'choice-card--answer' : ''
              } ${result && chosen && !isAnswer ? 'choice-card--wrong' : ''}`}
              disabled={Boolean(result) || night}
              onClick={() => setChoice(k)}
            >
              <span className="choice-card__word">{word}</span>
              <span className="muted tiny">填进句子里读一遍</span>
            </button>
          )
        })}
      </div>

      {!result && (
        <>
          <label className="field">
            <span className="field__label">为什么不是另一个？</span>
            <textarea
              className="input textarea"
              rows={2}
              value={why}
              maxLength={120}
              placeholder="比如：这里说的是“足够条件”，不是“不可缺少”……"
              disabled={night}
              onChange={(e) => setWhy(e.target.value)}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn--primary" disabled={night} onClick={submit}>
            提交，看语义轴
          </button>
        </>
      )}

      {result && (
        <div className="feedback">
          <div className={`feedback__head ${result.mastery_change ? '' : ''}`}>
            <strong>{choice === pair.answer ? '选对了' : '选错了'}</strong>
            <span className="muted">{result.mastery_change}</span>
          </div>
          <p><strong>语义轴：</strong>{pair.axis}</p>
          <p><strong>{pair.a}：</strong>{pair.aNote}</p>
          <p><strong>{pair.b}：</strong>{pair.bNote}</p>
          <p className="muted tiny">你写的：{why.trim()}</p>
          <button className="btn" onClick={onNext}>
            下一题
          </button>
        </div>
      )}
    </section>
  )
}

function CoherenceCard({
  item,
  task: taskMaybe,
  night,
  onNext,
}: {
  item: Item
  task: CoherenceItem | undefined
  night: boolean
  onNext: () => void
}) {
  const shuffled = useMemo(
    () => (taskMaybe ? seededShuffle(taskMaybe.sentences, `foundation:${taskMaybe.id}`) : []),
    [taskMaybe],
  )
  const [confidence, setConfidence] = useState<number | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ correct: boolean; out: ReviewResult } | null>(null)
  const started = useRef(Date.now())

  if (!taskMaybe) {
    return (
      <Notice tone="bad" title="内容没有找到">
        这条内容的 id 是 {item.item_id}，可能是旧备份；去设置里重新导入或重置学习数据。
      </Notice>
    )
  }
  const task = taskMaybe

  const available = shuffled.filter((s) => !picked.includes(s.id))
  const pickedSentences = picked
    .map((id) => shuffled.find((s) => s.id === id))
    .filter((s): s is (typeof shuffled)[number] => Boolean(s))

  function move(index: number, dir: -1 | 1) {
    const next = [...picked]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setPicked(next)
  }

  function submit() {
    if (night) return
    if (confidence == null) {
      setError('先选把握度。')
      return
    }
    if (picked.length !== task.sentences.length) {
      setError('把全部句子排进去再提交。')
      return
    }
    try {
      const correct = picked.join(',') === task.order.join(',')
      const out = submitReview(
        {
          itemId: item.item_id,
          correct,
          confidence,
          timeSpent: Math.max(1, Math.round((Date.now() - started.current) / 1000)),
          answer: picked.join(','),
        },
        new Date(),
      )
      setResult({ correct, out })
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '写入失败')
    }
  }

  return (
    <section className="foundation-card reading-paper">
      <div className="foundation-card__head">
        <span className="eyebrow">重组 · {task.title}</span>
        <span className="tag">{item.model_tag}</span>
      </div>
      <p className="muted">
        先把每句读一遍，再按你理解的思路排序。不是猜标准答案，是让“因此”“但”“比如”各归其位。
      </p>

      <div className="confidence-block">
        <span className="eyebrow">作答前把握度</span>
        <ConfidencePicker value={confidence} onChange={setConfidence} hint="记录的是排序前的判断" />
      </div>

      <div className="order-picked">
        <span className="eyebrow">你的顺序</span>
        {pickedSentences.length === 0 && <p className="muted tiny">从下面点句子，按顺序放进来。</p>}
        {pickedSentences.map((s, i) => (
          <div className="order-item" key={s.id}>
            <span className="order-item__num">{i + 1}</span>
            <span>{s.text}</span>
            <span className="order-item__actions">
              <button className="mini" disabled={Boolean(result) || night} onClick={() => move(i, -1)} aria-label="上移">↑</button>
              <button className="mini" disabled={Boolean(result) || night} onClick={() => move(i, 1)} aria-label="下移">↓</button>
              <button className="mini" disabled={Boolean(result) || night} onClick={() => setPicked(picked.filter((x) => x !== s.id))} aria-label="移除">×</button>
            </span>
          </div>
        ))}
      </div>

      {!result && available.length > 0 && (
        <div className="order-available">
          <span className="eyebrow">待排句子</span>
          {available.map((s) => (
            <button
              key={s.id}
              className="sentence-chip"
              disabled={night}
              onClick={() => setPicked([...picked, s.id])}
            >
              {s.text}
            </button>
          ))}
        </div>
      )}

      {!result && (
        <>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn--primary" disabled={night} onClick={submit}>
            提交顺序
          </button>
        </>
      )}

      {result && (
        <div className="feedback">
          <div className="feedback__head">
            <strong>{result.correct ? '顺序对了' : '顺序不对'}</strong>
            <span className="muted">{result.out.mastery_change}</span>
          </div>
          <p><strong>参考顺序：</strong>{task.order.map((id) => task.sentences.find((s) => s.id === id)?.text).join(' ')}</p>
          <p><strong>为什么：</strong>{task.logic}</p>
          <p className="muted tiny">顺序不是唯一写法；这里练的是连接词、指代和收束是否各就各位。</p>
          <button className="btn" onClick={onNext}>
            下一题
          </button>
        </div>
      )}
    </section>
  )
}
