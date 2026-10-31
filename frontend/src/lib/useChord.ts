import { useEffect, useRef } from 'react'

const WINDOW_MS = 1000

/** Two-key shortcut: press `first`, then `second` within a second (e.g. G then T). Ignored while typing. */
export function useChord(first: string, second: string, handler: () => void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    let armedAt = 0
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.ctrlKey || e.metaKey || e.altKey || el.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return
      const k = e.key.toLowerCase()
      if (armedAt && k === second && Date.now() - armedAt <= WINDOW_MS) { armedAt = 0; e.preventDefault(); ref.current(); return }
      armedAt = k === first ? Date.now() : 0
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [first, second])
}
