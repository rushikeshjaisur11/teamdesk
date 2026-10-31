/** Dates of the user's day are 'YYYY-MM-DD' strings in their time zone (the browser's, kept in sync with the profile). */
import type { Item } from './types'

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromIso = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }

export function localToday(): string {
  return toIso(new Date())
}

export function shiftDay(iso: string, days: number): string {
  const d = fromIso(iso)
  d.setDate(d.getDate() + days)
  return toIso(d)
}

/** "Fri 6 Nov" */
export function formatDay(iso: string): string {
  return fromIso(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "Today", "Tomorrow", "Yesterday", or "Fri 6 Nov" */
export function dayWords(iso: string, today = localToday()): string {
  if (iso === today) return 'Today'
  if (iso === shiftDay(today, 1)) return 'Tomorrow'
  if (iso === shiftDay(today, -1)) return 'Yesterday'
  return formatDay(iso)
}

export function daysBetween(fromIsoDay: string, toIsoDay: string): number {
  return Math.round((fromIso(toIsoDay).getTime() - fromIso(fromIsoDay).getTime()) / 86_400_000)
}

export type TaskGroup = 'overdue' | 'today' | 'upcoming' | 'no_date' | 'done'

export function taskGroup(item: Item, today = localToday()): TaskGroup {
  if (item.status !== 'open') return 'done'
  if (!item.due_on) return 'no_date'
  return item.due_on < today ? 'overdue' : item.due_on === today ? 'today' : 'upcoming'
}
