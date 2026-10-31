import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { useShortcut } from '@/lib/useShortcut'

/** Press I anywhere to jot an idea into your private Inbox. */
export function QuickCapture({ open: controlled, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const qc = useQueryClient()
  const [own, setOwn] = useState(false)
  const open = controlled ?? own
  const setOpen = onOpenChange ?? setOwn
  const [text, setText] = useState('')
  useShortcut('i', () => setOpen(true))
  const save = useMutation({
    mutationFn: (t: string) => api('/api/me/items', { method: 'POST', json: { kind: 'idea', title: t } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['me'] }); toast.success('Saved to your Inbox') },
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
          autoFocus aria-label="Capture an idea" placeholder="Capture an idea, press Enter to save" maxLength={500}
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
          className="h-11 text-base"
        />
      </DialogContent>
    </Dialog>
  )
}
