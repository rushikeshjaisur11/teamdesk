import { toast } from 'sonner'

/**
 * Hide something now, show a toast with Undo, and only send the request when the toast window ends.
 * Undo restores the UI and nothing is sent.
 */
export function undoable({ message, hide, restore, commit, ms = 5000 }: {
  message: string; hide: () => void; restore: () => void; commit: () => Promise<unknown>; ms?: number
}) {
  hide()
  let undone = false
  const timer = setTimeout(() => {
    if (!undone) commit().catch((e: Error) => { restore(); toast.error(e.message) })
  }, ms)
  toast(message, {
    duration: ms,
    action: { label: 'Undo', onClick: () => { undone = true; clearTimeout(timer); restore() } },
  })
}
