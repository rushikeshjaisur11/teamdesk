export type Preset = 'later' | 'tomorrow' | 'monday'
export const PRESETS: { key: Preset; label: string }[] = [
  { key: 'later', label: 'Later today' }, { key: 'tomorrow', label: 'Tomorrow 9:00' }, { key: 'monday', label: 'Next Monday 9:00' },
]

/** Preset reminder times in the browser's time zone. "Later today" is three hours on, at least an hour before midnight. */
export function presetTime(key: Preset, now = new Date()): Date {
  if (key === 'later') {
    const t = new Date(now.getTime() + 3 * 3600_000)
    const end = new Date(now); end.setHours(23, 0, 0, 0)
    return t.getDate() === now.getDate() ? t : end > now ? end : t
  }
  const d = new Date(now); d.setHours(9, 0, 0, 0)
  if (key === 'tomorrow') d.setDate(d.getDate() + 1)
  else d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)) // next Monday, never today
  return d
}

/** <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm". */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
