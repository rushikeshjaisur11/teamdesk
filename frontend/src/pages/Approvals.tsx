import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlarmClock, Check, Copy, CornerUpLeft, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { SplitView } from '@/components/SplitView'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { qk, useTemplates, wpath } from '@/lib/queries'
import { ago } from '@/lib/time'
import type { Task } from '@/lib/types'
import { undoable } from '@/lib/undoable'
import { useShortcut } from '@/lib/useShortcut'
import { cn } from '@/lib/utils'
import { TaskDetailPane } from './TaskDetailPane'

type Stamp = { id: string; label: string; color: string }
type Asking = { action: 'reject' | 'request_changes' | 'duplicate'; task: Task } | null

const ASK = {
  reject: { title: 'Reject', help: 'The author sees this reason.', button: 'Reject task', done: 'Rejected', color: 'var(--st-rejected)' },
  request_changes: { title: 'Ask for changes on', help: 'Say what to change. The task goes back to the author.', button: 'Send back', done: 'Sent back', color: 'var(--st-changes)' },
  duplicate: { title: 'Mark as duplicate:', help: 'Pick the original task.', button: 'Mark duplicate', done: 'Duplicate', color: 'var(--st-duplicate)' },
}

function inDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

export function Approvals() {
  const { wid = '' } = useParams()
  const qc = useQueryClient()
  const templates = useTemplates(wid)
  const queue = useQuery({ queryKey: qk.approvals(wid), queryFn: () => api<Task[]>(wpath(wid, '/approvals')) })
  const [hidden, setHidden] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [stamp, setStamp] = useState<Stamp | null>(null)
  const [asking, setAsking] = useState<Asking>(null)
  const [reason, setReason] = useState('')
  const [dupQuery, setDupQuery] = useState('')
  const [checked, setChecked] = useState<string[]>([])

  const items = (queue.data ?? []).filter((t) => !hidden.includes(t.id))
  const index = Math.max(0, items.findIndex((t) => t.id === selectedId))
  const current = items[index]
  useEffect(() => { if (items.length && !items.some((t) => t.id === selectedId)) setSelectedId(items[Math.min(index, items.length - 1)].id) }, [items, selectedId, index])

  const dupResults = useQuery({
    queryKey: qk.tasks(wid, { q: dupQuery }),
    queryFn: () => api<Task[]>(wpath(wid, `/tasks?q=${encodeURIComponent(dupQuery)}&limit=8`)),
    enabled: asking?.action === 'duplicate' && dupQuery.trim().length > 1,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.approvals(wid) })
    qc.invalidateQueries({ queryKey: ['w', wid, 'tasks'] })
  }
  const hide = (t: Task) => {
    const next = items[index + 1] ?? items[index - 1]
    setHidden((h) => [...h, t.id])
    setSelectedId(next?.id)
  }
  const restore = (t: Task) => { setHidden((h) => h.filter((x) => x !== t.id)); setSelectedId(t.id) }
  const decide = (t: Task, body: Record<string, unknown>) =>
    api<Task>(wpath(wid, `/tasks/${t.id}/decision`), { method: 'POST', json: body })

  const approve = (t: Task | undefined) => {
    if (!t) return
    setStamp({ id: t.id, label: 'Approved', color: 'var(--st-approved)' })
    decide(t, { action: 'approve' })
      .then(() => { toast.success(`Approved #${t.number}`); refresh() })
      .catch((e: Error) => { restore(t); toast.error(e.message) })
    setTimeout(() => { setStamp(null); hide(t) }, 350)
  }

  const confirmAsk = (duplicateOf?: Task) => {
    if (!asking) return
    const { action, task } = asking
    const body = action === 'duplicate' ? { action, duplicate_of: duplicateOf?.id } : { action, reason }
    setAsking(null); setReason(''); setDupQuery('')
    undoable({
      message: `${ASK[action].done} #${task.number}`,
      hide: () => hide(task),
      restore: () => restore(task),
      commit: () => decide(task, body).then(refresh),
    })
  }

  const snooze = (t: Task | undefined, days: number) => {
    if (!t) return
    hide(t)
    decide(t, { action: 'snooze', until: inDays(days) })
      .then(() => { toast(`Snoozed #${t.number}`); refresh() })
      .catch((e: Error) => { restore(t); toast.error(e.message) })
  }

  const bulk = async () => {
    const ids = checked
    setChecked([])
    const r = await api<{ approved: string[]; failed: { id: string; error: string }[] }>(
      wpath(wid, '/approvals/bulk-approve'), { method: 'POST', json: { task_ids: ids } })
    refresh()
    if (r.failed.length) toast.error(`Approved ${r.approved.length}, ${r.failed.length} failed: ${r.failed[0].error}`)
    else toast.success(`Approved ${r.approved.length}`)
  }

  const idle = !asking
  useShortcut('j', () => setSelectedId(items[Math.min(index + 1, items.length - 1)]?.id), { enabled: idle })
  useShortcut('k', () => setSelectedId(items[Math.max(index - 1, 0)]?.id), { enabled: idle })
  useShortcut('a', () => approve(current), { enabled: idle && !!current })
  useShortcut('r', () => current && setAsking({ action: 'reject', task: current }), { enabled: idle })
  useShortcut('c', () => current && setAsking({ action: 'request_changes', task: current }), { enabled: idle })
  useShortcut('d', () => current && setAsking({ action: 'duplicate', task: current }), { enabled: idle })

  const list = (
    <>
      <PageHeader title="Approvals" finding={queue.data && (items.length
        ? `${items.length} waiting. The oldest is #${items[0].number} from ${items[0].author.name}, submitted ${items[0].submitted_at ? ago(items[0].submitted_at) : ''}.`
        : 'Nothing is waiting.')}>
        {!!checked.length && <Button onClick={bulk}><Check />Approve {checked.length} selected</Button>}
      </PageHeader>
      {queue.isPending ? (
        <div className="space-y-3 px-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : queue.isError ? (
        <p role="alert" className="px-6 text-destructive">{queue.error.message}</p>
      ) : !items.length ? (
        <EmptyState title="Nothing waiting for approval"
          body="New tasks from your team show up here. Developer tasks skip this queue automatically."
          action={<Button variant="outline" render={<Link to={`/w/${wid}/tasks`} />}>Go to tasks</Button>} />
      ) : (
        <>
          <div role="listbox" aria-label="Waiting for approval" className="mx-4 mb-6 overflow-hidden rounded-lg border bg-card">
            {items.map((t) => (
              <div
                key={t.id} role="option" aria-selected={t.id === current?.id} onClick={() => setSelectedId(t.id)}
                className={cn('relative flex min-h-18 cursor-pointer items-start gap-3 border-t border-rule px-4 py-3 first:border-t-0 transition-colors duration-(--motion) hover:bg-accent/40',
                  t.id === current?.id && 'bg-accent', stamp?.id === t.id && 'opacity-70')}
              >
                <Checkbox className="mt-0.5" aria-label={`Select #${t.number}`} checked={checked.includes(t.id)} onClick={(e) => e.stopPropagation()}
                  onCheckedChange={(on) => setChecked(on ? [...checked, t.id] : checked.filter((x) => x !== t.id))} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                    <span className="num shrink-0 text-xs text-muted-foreground">{t.submitted_at ? ago(t.submitted_at) : ''}</span>
                  </p>
                  <p className="mt-0.5 flex gap-3 text-[0.8125rem] text-muted-foreground">
                    <span className="task-id">#{t.number}</span><span className="truncate">{t.author.name}</span>
                  </p>
                </div>
                {stamp?.id === t.id && <span className="stamp absolute right-6 text-base" style={{ color: stamp.color }}>{stamp.label}</span>}
              </div>
            ))}
          </div>
          <p className="px-6 pb-6 text-xs text-muted-foreground">J and K move between tasks. A, R, C and D decide.</p>
        </>
      )}
    </>
  )

  return (
    <>
      <SplitView variant="inbox" list={list} pane={current && templates.data && (
        <>
          <div className="sticky top-0 z-20 flex flex-wrap gap-2 border-b bg-card px-6 py-3">
            <Button onClick={() => approve(current)}><Check />Approve <kbd className="ml-1 text-xs opacity-70">A</kbd></Button>
            <Button variant="outline" onClick={() => current && setAsking({ action: 'reject', task: current })}><X />Reject <kbd className="ml-1 text-xs opacity-70">R</kbd></Button>
            <Button variant="outline" onClick={() => current && setAsking({ action: 'request_changes', task: current })}><CornerUpLeft />Ask for changes <kbd className="ml-1 text-xs opacity-70">C</kbd></Button>
            <Button variant="ghost" onClick={() => current && setAsking({ action: 'duplicate', task: current })}><Copy />Duplicate <kbd className="ml-1 text-xs opacity-70">D</kbd></Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" />}><AlarmClock />Snooze</DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => snooze(current, 1)}>Until tomorrow</DropdownMenuItem>
                <DropdownMenuItem onClick={() => snooze(current, 7)}>Until next week</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <TaskDetailPane key={current.id} wid={wid} taskId={current.id} templates={templates.data} readOnly />
        </>
      )} />
      <Dialog open={!!asking} onOpenChange={(o) => { if (!o) { setAsking(null); setReason(''); setDupQuery('') } }}>
        {asking && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{ASK[asking.action].title} #{asking.task.number}</DialogTitle>
              <DialogDescription>{ASK[asking.action].help}</DialogDescription>
            </DialogHeader>
            {asking.action === 'duplicate' ? (
              <div className="space-y-2">
                <Input autoFocus aria-label="Search for the original task" placeholder="Search tasks" value={dupQuery} onChange={(e) => setDupQuery(e.target.value)} />
                <ul className="max-h-64 overflow-y-auto">
                  {dupResults.data?.filter((t) => t.id !== asking.task.id).map((t) => (
                    <li key={t.id}>
                      <button className="flex w-full gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent" onClick={() => confirmAsk(t)}>
                        <span className="num text-muted-foreground">#{t.number}</span><span className="truncate">{t.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <Textarea autoFocus aria-label="Reason" rows={4} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && reason.trim()) confirmAsk() }} />
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAsking(null)}>Cancel</Button>
                  <Button disabled={!reason.trim()} onClick={() => confirmAsk()}>{ASK[asking.action].button}</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
