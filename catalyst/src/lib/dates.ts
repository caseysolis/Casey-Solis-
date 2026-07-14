// Lightweight local-date helpers. All "date" strings are yyyy-mm-dd (local, no TZ math needed for a prototype).

export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(dateStr: string, n: number): string {
  const d = parseDateStr(dateStr)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

export function dayOfWeek(dateStr: string): number {
  return parseDateStr(dateStr).getDay()
}

export function startOfWeek(dateStr: string): string {
  const dow = dayOfWeek(dateStr)
  return addDays(dateStr, -dow) // Sunday start
}

export function daysBetween(a: string, b: string): number {
  const da = parseDateStr(a).getTime()
  const db = parseDateStr(b).getTime()
  return Math.round((db - da) / 86400000)
}

export function minToLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const suffix = h >= 12 ? 'PM' : 'AM'
  let h12 = h % 12
  if (h12 === 0) h12 = 12
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

export function durationLabel(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function isoToDateStr(iso: string): string {
  return iso.slice(0, 10)
}

export function isoNow(d: Date = new Date()): string {
  return d.toISOString()
}

export function formatDayLabel(dateStr: string): string {
  const d = parseDateStr(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatShortDate(dateStr: string): string {
  const d = parseDateStr(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function weekdayShort(dateStr: string): string {
  const d = parseDateStr(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
}

export function dayNum(dateStr: string): string {
  return String(parseDateStr(dateStr).getDate())
}
