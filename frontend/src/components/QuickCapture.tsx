import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { qk, wpath } from '@/lib/queries'
import { useShortcut } from '@/lib/useShortcut'

/** Press I anywhere in a workspace to jot an idea into your private inbox. */
export function QuickCapture({ wid }: { wid: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  useShortcut('i', () => setOpen(true))
  const save = useMutation({
    mutationFn: (t: string) => api(wpath(wid, '/ideas'), { method: 'POST', json: { text: t } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.ideas(wid) }); toast.success('Saved to Inbox') },
    onError: (e) => toast.error(e.message),
  })

  const submit = () => {
    const t = text.trim()
    if (!t) return
    save.mutate(t)
    setText('')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[20%] translate-y-0 sm:max-w-lg" showCloseButton={false}>
        <DialogTitle className="sr-only">Capture an idea</DialogTitle>
        <DialogDescription className="sr-only">Saved privately to your inbox. Press Enter to save, Escape to close.</DialogDescription>
        <Input
          autoFocus aria-label="Capture an idea" placeholder="Capture an idea, press Enter to save" maxLength={2000}
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
          className="h-11 text-base"
        />
      </DialogContent>
    </Dialog>
  )
}
