import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { qk, wpath } from '@/lib/queries'
import { ago } from '@/lib/time'
import type { Idea } from '@/lib/types'
import { undoable } from '@/lib/undoable'

export function Inbox() {
  const { wid = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [hidden, setHidden] = useState<string[]>([])
  const ideas = useQuery({ queryKey: qk.ideas(wid), queryFn: () => api<Idea[]>(wpath(wid, '/ideas')) })
  const visible = (ideas.data ?? []).filter((i) => !hidden.includes(i.id))

  const remove = (idea: Idea) => undoable({
    message: 'Idea deleted',
    hide: () => setHidden((h) => [...h, idea.id]),
    restore: () => setHidden((h) => h.filter((x) => x !== idea.id)),
    commit: () => api(wpath(wid, `/ideas/${idea.id}`), { method: 'DELETE' })
      .then(() => qc.invalidateQueries({ queryKey: qk.ideas(wid) })),
  })
  const makeTask = (idea: Idea) =>
    navigate(`/w/${wid}/tasks?${new URLSearchParams({ fromIdea: idea.id, title: idea.text.slice(0, 200) })}`)

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Inbox" finding={ideas.data && `${visible.length} ${visible.length === 1 ? 'idea' : 'ideas'}, only visible to you. Turn one into a task when it's ready.`} />
      {ideas.isPending ? (
        <div className="space-y-3 px-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : ideas.isError ? (
        <p role="alert" className="px-6 text-destructive">{ideas.error.message}</p>
      ) : !visible.length ? (
        <EmptyState title="Your inbox is empty"
          body={<>Press <kbd className="rounded border bg-muted px-1.5 text-xs font-medium">I</kbd> anywhere to capture an idea in a second. It lands here.</>} />
      ) : (
        <ul className="mx-6 mb-8 divide-y divide-rule overflow-hidden rounded-lg border bg-card">
          {visible.map((idea) => (
            <li key={idea.id} className="group flex items-start gap-4 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="break-words whitespace-pre-line">{idea.text}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{ago(idea.created_at)}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => makeTask(idea)}>Make task</Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete idea: ${idea.text}`} onClick={() => remove(idea)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
