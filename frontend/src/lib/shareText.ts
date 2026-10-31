/** Turns the title/text/url a share sheet sends into one idea title (max 500 characters). */
export function sharedTitle(p: URLSearchParams): string {
  const parts = [p.get('title'), p.get('text'), p.get('url')].map((s) => (s ?? '').trim()).filter(Boolean)
  const unique = parts.filter((s, i) => !parts.slice(0, i).some((t) => t.includes(s)))
  return unique.join(' ').slice(0, 500)
}
