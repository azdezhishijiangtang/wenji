export function uid(prefix = ''): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return prefix ? `${prefix}_${raw}` : raw
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function toIso(d: Date): string {
  return d.toISOString()
}

export function startOfDay(d: Date | string): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function dayKey(d: Date | string): string {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export function addDays(d: Date | string, days: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

export function isSameDay(a: Date | string, b: Date | string): boolean {
  return dayKey(a) === dayKey(b)
}

/** 夜间模式：23:30–06:00，只读。 */
export function isNight(d: Date = new Date()): boolean {
  const minutes = d.getHours() * 60 + d.getMinutes()
  return minutes >= 23 * 60 + 30 || minutes < 6 * 60
}

export function overdueDays(dueAt: string, now: Date): number {
  return Math.max(0, (now.getTime() - new Date(dueAt).getTime()) / 86400000)
}

export function daysAgoIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 86400000).toISOString()
}

export function fmtDate(d: Date | string): string {
  const x = new Date(d)
  return `${x.getMonth() + 1} 月 ${x.getDate()} 日`
}

export function fmtDateFull(d: Date | string): string {
  const x = new Date(d)
  const week = '日一二三四五六'[x.getDay()]
  return `${x.getFullYear()} 年 ${x.getMonth() + 1} 月 ${x.getDate()} 日 · 周${week}`
}

export function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 分钟'
  const m = Math.round(seconds / 60)
  if (m < 60) return `${Math.max(1, m)} 分钟`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} 小时 ${rest} 分` : `${h} 小时`
}

export function fmtInterval(dueAt: string, now: Date = new Date()): string {
  const days = (new Date(dueAt).getTime() - now.getTime()) / 86400000
  if (days <= 0) return '已到期'
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} 小时后`
  if (days < 30) return `${Math.round(days)} 天后`
  if (days < 365) return `${(days / 30).toFixed(1)} 个月后`
  return `${(days / 365).toFixed(1)} 年后`
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function pct(n: number | null): string {
  return n == null ? '—' : `${Math.round(n * 100)}%`
}

export function sum(list: number[]): number {
  return list.reduce((a, b) => a + b, 0)
}
