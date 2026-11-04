import type { ReactNode } from 'react'
import { MASTERY_LABELS, MASTERY_LABELS_DESC } from '../engine/types'

const CONFIDENCE_STEPS = [
  { value: 10, label: '蒙' },
  { value: 30, label: '低' },
  { value: 50, label: '半' },
  { value: 70, label: '较高' },
  { value: 90, label: '笃定' },
]

export function ConfidencePicker({
  value,
  onChange,
  hint = '作答前先选把握度，这是校准曲线的原料。',
}: {
  value: number | null
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <div className={`confidence ${value == null ? 'confidence--required' : ''}`}>
      <div className="confidence__head">
        <span className="confidence__title">你有多大把握？</span>
        <span className="confidence__hint">{value == null ? '必选' : `已选 ${value}`}</span>
      </div>
      <div className="chips" role="radiogroup" aria-label="作答把握度">
        {CONFIDENCE_STEPS.map((s) => (
          <button
            key={s.value}
            type="button"
            className={`chip ${value === s.value ? 'chip--active' : ''}`}
            aria-pressed={value === s.value}
            onClick={() => onChange(s.value)}
          >
            <b>{s.value}</b>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      <p className="confidence__note">{hint}</p>
    </div>
  )
}

export function MasteryDots({ level, showLabel = false }: { level: number; showLabel?: boolean }) {
  return (
    <span className="dots" title={`LV.${level} ${MASTERY_LABELS[level] ?? ''}：${MASTERY_LABELS_DESC[level] ?? ''}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <i key={i} className={i <= level ? 'dot dot--on' : 'dot'} />
      ))}
      {showLabel && <em>LV.{level} {MASTERY_LABELS[level] ?? ''}</em>}
    </span>
  )
}

export function LevelBadge({ level }: { level: number }) {
  return (
    <span className={`level level--${level}`}>
      LV.{level} {MASTERY_LABELS[level] ?? ''}
    </span>
  )
}

export function PageHeader({
  eyebrow,
  title,
  intro,
  aside,
}: {
  eyebrow?: string
  title: string
  intro?: string
  aside?: ReactNode
}) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {intro && <p className="page-head__intro">{intro}</p>}
      </div>
      {aside && <div className="page-head__aside">{aside}</div>}
    </header>
  )
}

export function Notice({
  tone = 'info',
  children,
  title,
}: {
  tone?: 'info' | 'good' | 'warn' | 'bad'
  children: ReactNode
  title?: string
}) {
  return (
    <div className={`notice notice--${tone}`}>
      {title && <b>{title}</b>}
      <div>{children}</div>
    </div>
  )
}

export function Empty({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty__mark">○</div>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  )
}

export function Meter({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'sage' | 'ink' }) {
  return (
    <div className={`meter meter--${tone}`}>
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'good' | 'warn' | 'bad'
}) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  )
}

/** 把 evidence 里的答案词标出来；只做定位，不扩展解释。 */
export function Evidence({ text, word }: { text: string; word: string }) {
  const idx = text.indexOf(word)
  if (idx < 0) return <span>{text}</span>
  return (
    <span>
      {text.slice(0, idx)}
      <mark>{word}</mark>
      {text.slice(idx + word.length)}
    </span>
  )
}

export function TodayBadge({ readOnly }: { readOnly: boolean }) {
  return readOnly ? <span className="tag tag--warn">夜间只读</span> : <span className="tag tag--good">可训练</span>
}
