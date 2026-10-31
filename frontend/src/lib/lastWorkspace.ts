const KEY = 'teamdesk.lastWorkspace'

export function rememberWorkspace(id: string) {
  try { localStorage.setItem(KEY, id) } catch { /* storage blocked: we just won't remember */ }
}

export function lastWorkspace(): string | null {
  try { return localStorage.getItem(KEY) } catch { return null }
}
