import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Send, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { TaskProgress } from '@/components/TaskProgress'
import { Checklist } from '@/components/Checklist'
import { Markdownish } from '@/components/Markdownish'
import { PrivateNote } from '@/components/PrivateNote'
import { RemindTask } from '@/components/RemindTask'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { qk, useActivity, useTask, useWorkspace, wpath } from '@/lib/queries'
import { ago } from '@/lib/time'
import type { Activity, Task, Template } from '@/lib/types'
import { savedMessage, TaskForm } from './TaskForm'

const EDITABLE = ['draft', 'changes_requested', 'pending_approval']
const DECISION_WORDS: Record<string, string> = {
  approve: 'approved this task', reject: 'rejected this task', request_changes: 'asked for changes',
  duplicate: 'marked this as a duplicate', snooze: 'snoozed this task',
}

function describe(a: Activity) {
  switch (a.kind) {
    case 'created': return 'created this task'
    case 'edited': return `edited ${((a.data.changed as string[]) ?? []).join(', ')}`
    case 'submitted': return 'submitted it for approval'
    case 'auto_approved': return `submitted it and it was approved automatically by "${a.data.rule}"`
    case 'decision': return DECISION_WORDS[a.data.action as string] ?? String(a.data.action)
    case 'comment': return 'commented'
  }
}

export function TaskDetailPane({ wid, taskId, templates, onClose, readOnly = false }: {
  wid: string; taskId: string; templates: Template[]; onClose?: () => void; readOnly?: boolean
}) {
  const qc = useQueryClient()
  const { me, can } = useWorkspace()
  const task = useTask(wid, taskId)
  const activity = useActivity(wid, taskId)
  const [comment, setComment] = useState('')
  const [editing, setEditing] = useState(false)

  const refresh = (t?: Task) => {
    if (t) qc.setQueryData(qk.task(wid, t.id), t)
    qc.invalidateQueries({ queryKey: ['w', wid] })
  }
  const send = useMutation({
    mutationFn: () => api(wpath(wid, `/tasks/${taskId}/comments`), { method: 'POST', json: { text: comment } }),
    onSuccess: () => { setComment(''); refresh() },
    onError: (e) => toast.error(e.message),
  })
  const saveChecklist = useMutation({
    mutationFn: (items: NonNullable<Task['checklist']>) => api<Task>(wpath(wid, `/tasks/${taskId}/checklist`), { method: 'PUT', json: items }),
    onMutate: (items) => qc.setQueryData<Task>(qk.task(wid, taskId), (t) => t && { ...t, checklist: items }),
    onSuccess: (t) => refresh(t),
    onError: (e) => { toast.error(e.message); refresh() },
  })
  const submit = useMutation({
    mutationFn: () => api<Task>(wpath(wid, `/tasks/${taskId}/submit`), { method: 'POST' }),
    onSuccess: (t) => { refresh(t); toast.success(savedMessage(t)) },
    onError: (e) => toast.error(e.message),
  })

  if (task.isPending) {
    return <div className="space-y-4 p-6"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-24 w-full" /></div>
  }
  if (task.isError) return <p role="alert" className="p-6 text-destructive">{task.error.message}</p>

  const t = task.data
  const template = templates.find((x) => x.key === t.type_key)
  const mayEdit = !readOnly && (t.author.sub === me?.user.sub || can('task.edit_any'))
  const mayEditChecklist = (t.author.sub === me?.user.sub || can('task.edit_any')) && !['rejected', 'duplicate'].includes(t.status)
  const sections = template?.sections ?? Object.keys(t.fields).map((key) => ({ key, label: key, required: false, hint: '' }))

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-start gap-3 border-b bg-card px-6 py-4">
        <div className="min-w-0 flex-1">
          <p className="mb-1 flex gap-2 text-muted-foreground"><span className="task-id">#{t.number}</span><span>{template?.name ?? t.type_key}</span></p>
          <h2 className="text-lg leading-snug font-semibold break-words">{t.title}</h2>
        </div>
        {onClose && <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close details"><X /></Button>}
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 pt-4 text-muted-foreground">
        <StatusBadge status={t.status} />
        <span title={new Date(t.updated_at).toLocaleString()}>Updated {ago(t.updated_at)}</span>
      </div>
      <TaskProgress task={t} />

      {t.decision?.reason && (
        <div className="mx-6 mb-4 rounded-md px-4 py-3" style={{ backgroundColor: 'var(--pill-warning-bg)', color: 'var(--pill-warning-ink)' }}>
          <p className="font-medium">{t.decision.by.name} {DECISION_WORDS[t.decision.action]}</p>
          <p className="mt-1 whitespace-pre-line">{t.decision.reason}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 px-6 pb-4">
        {mayEdit && EDITABLE.includes(t.status) && <Button variant="outline" onClick={() => setEditing(true)}><Pencil />Edit</Button>}
        {mayEdit && ['draft', 'changes_requested'].includes(t.status) && (
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}><Send />Submit for approval</Button>
        )}
        {!readOnly && <RemindTask wid={wid} task={t} />}
      </div>

      <div className="space-y-5 px-6 pb-6">
        {sections.filter((s) => t.fields[s.key]?.trim()).map((s) => (
          <section key={s.key}>
            <h3 className="mb-1 font-semibold">{s.label}</h3>
            <Markdownish text={t.fields[s.key]} />
          </section>
        ))}
        {!!t.labels.length && (
          <div className="flex flex-wrap gap-1.5">
            {t.labels.map((l) => <span key={l} className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{l}</span>)}
          </div>
        )}
      </div>

      {(!!t.checklist?.length || mayEditChecklist) && (
        <section className="border-t px-6 py-5">
          <h3 className="mb-2 font-semibold">Checklist {!!t.checklist?.length && <span className="num font-normal text-muted-foreground">{t.checklist.filter((c) => c.done).length}/{t.checklist.length}</span>}</h3>
          <Checklist items={t.checklist ?? []} readOnly={!mayEditChecklist} onChange={(items) => saveChecklist.mutate(items)} />
        </section>
      )}

      <PrivateNote wid={wid} taskId={taskId} />

      <section aria-label="Activity" className="border-t px-6 py-5">
        <h3 className="mb-3 font-semibold">Activity</h3>
        <ol className="space-y-3 border-l pl-4">
          {activity.data?.map((a) => (
            <li key={a.id} className="relative">
              <span aria-hidden className="absolute top-2 -left-[1.3rem] size-2 rounded-full bg-border" />
              <p>
                <span className="font-medium">{a.actor.name}</span>{' '}
                <span className="text-muted-foreground">{describe(a)}</span>{' '}
                <span className="text-xs text-muted-foreground" title={new Date(a.at).toLocaleString()}>{ago(a.at)}</span>
              </p>
              {a.kind === 'comment' && <div className="mt-1 rounded-md bg-muted px-3 py-2"><Markdownish text={String(a.data.text)} /></div>}
              {a.kind === 'decision' && !!a.data.reason && <p className="mt-1 text-muted-foreground">{String(a.data.reason)}</p>}
            </li>
          ))}
        </ol>
        <form className="mt-4 space-y-2" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) send.mutate() }}>
          <Textarea
            aria-label="Comment" rows={3} value={comment} maxLength={10000} placeholder="Write a comment"
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && comment.trim()) { e.preventDefault(); send.mutate() } }}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Ctrl + Enter to send</span>
            <Button size="sm" type="submit" disabled={!comment.trim() || send.isPending}>Comment</Button>
          </div>
        </form>
      </section>

      {mayEdit && <TaskForm wid={wid} templates={templates} open={editing} onOpenChange={setEditing} task={t} />}
    </div>
  )
}
