import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { qk } from '@/lib/queries'

type Note = { text: string; updated_at: string | null }

/** My private note on a team task. Saved per person; nobody else can read it. */
export function PrivateNote({ wid, taskId }: { wid: string; taskId: string }) {
  const path = `/api/me/notes/${wid}/${taskId}`
  const note = useQuery({ queryKey: qk.note(wid, taskId), queryFn: () => api<Note>(path) })
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => { if (note.data) setText(note.data.text) }, [note.data])
  const save = useMutation({
    mutationFn: () => api<Note>(path, { method: 'PUT', json: { text } }),
    onSuccess: () => setSaved(true),
  })
  const commit = () => { if (note.data && text !== (save.data?.text ?? note.data.text)) save.mutate() }

  return (
    <section className="border-t px-6 py-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-semibold">My notes</h3>
        <span className="text-xs text-muted-foreground" role="status">{save.isError ? save.error.message : saved && !save.isPending ? 'Saved' : 'Only you can see this.'}</span>
      </div>
      <Textarea aria-label="My notes" rows={3} maxLength={20000} value={text} disabled={note.isPending}
        placeholder="Anything you want to remember about this task"
        onChange={(e) => { setText(e.target.value); setSaved(false) }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit() } }} />
    </section>
  )
}
