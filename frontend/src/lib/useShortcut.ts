import { useEffect, useRef } from 'react'

function typing(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
}

/** `key` is a single key ("a", "?", "j") or "mod+k" (Ctrl on Windows/Linux, ⌘ on Mac). */
export function useShortcut(key: string, handler: () => void, opts: { enabled?: boolean } = {}) {
  const ref = useRef(handler)
  ref.current = handler
  const enabled = opts.enabled ?? true

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (key.startsWith('mod+')) {
        if ((e.ctrlKey || e.metaKey) && k === key.slice(4)) { e.preventDefault(); ref.current() }
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      if (e.key === key || k === key) { e.preventDefault(); ref.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key, enabled])
}
