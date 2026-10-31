const KEY = 'teamdesk.theme'

export type Theme = 'light' | 'dark'

export function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try { localStorage.setItem(KEY, theme) } catch { /* storage blocked: theme lasts for this page only */ }
}
