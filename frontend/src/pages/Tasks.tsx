import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { SplitView } from '@/components/SplitView'
import { StatusBadge, STATUS_LABELS } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { qk, useTemplates, useWorkspace, wpath } from '@/lib/queries'
import { ago } from '@/lib/time'
import type { Task, TaskStatus } from '@/lib/types'
import { useDebounced } from '@/lib/useDebounced'
import { useShortcut } from '@/lib/useShortcut'
import { cn } from '@/lib/utils'
import { TaskDetailPane } from './TaskDetailPane'
import { TaskForm } from './TaskForm'

const ORDER: TaskStatus[] = ['pending_approval', 'changes_requested', 'draft', 'approved', 'in_jira', 'jira_failed', 'in_progress', 'snoozed', 'done', 'rejected', 'duplicate']

/** The line under the title: what in this view needs someone's attention. */
export function tasksFinding(tasks: Task[]) {
  const waiting = tasks.filter((t) => t.status === 'pending_approval')
  const sentBack = tasks.filter((t) => t.status === 'changes_requested').length
  const oldest = waiting.map((t) => t.submitted_at).filter(Boolean).sort()[0]
  const parts = [
    waiting.length
      ? `${waiting.length} waiting for approval${oldest ? `, the oldest submitted ${ago(oldest)}` : ''}.`
      : 'Nothing is waiting for approval.',
  ]
  if (sentBack) parts.push(`${sentBack} sent back for changes.`)
  return parts.join(' ')
}

export function Tasks() {
  const { wid, can } = useWorkspace()
  const { taskId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const templates = useTemplates(wid)
  const [q, setQ] = useState('')
  const [mine, setMine] = useState(false)
  const [statuses, setStatuses] = useState<TaskStatus[]>([])
  const [type, setType] = useState('')
  const [grouped, setGrouped] = useState(true)
  const [creating, setCreating] = useState(false)
  const query = useDebounced(q.trim(), 250)
  const fromItem = params.get('fromItem') ?? undefined
  const wantsNew = params.has('new')

  const filters = { q: query, mine, status: statuses.join(','), type }
  const tasks = useQuery({
    queryKey: qk.tasks(wid, filters),
    queryFn: () => api<Task[]>(wpath(wid, `/tasks?${new URLSearchParams({ ...filters, mine: String(mine) })}`)),
    placeholderData: (prev) => prev,
  })
  useShortcut('n', () => setCreating(true), { enabled: can('task.create') })

  const groups = useMemo(() => {
    const list = tasks.data ?? []
    if (!grouped || query) return [[null, list] as const]
    return ORDER.map((s) => [s, list.filter((t) => t.status === s)] as const).filter(([, ts]) => ts.length)
  }, [tasks.data, grouped, query])

  const filtering = !!(query || mine || statuses.length || type)
  const typeName = (key: string) => templates.data?.find((t) => t.key === key)?.name ?? key
  const open = (id: string) => navigate(`/w/${wid}/tasks/${id}`)
  const closeIdea = () => { params.delete('fromItem'); params.delete('title'); params.delete('new'); setParams(params, { replace: true }) }
  const filterButton = (active: boolean) => <Button variant={active ? 'secondary' : 'outline'} />

  const list = (
    <>
      <PageHeader title="Tasks" finding={tasks.data && tasksFinding(tasks.data)}>
        {can('task.create') && <Button onClick={() => setCreating(true)}><Plus />New task</Button>}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 px-6 pb-4">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className="bg-card pl-8" />
        </div>
        <Button variant={mine ? 'secondary' : 'outline'} aria-pressed={mine} onClick={() => setMine(!mine)}>Mine</Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={filterButton(!!statuses.length)}>
            Status{statuses.length ? ` (${statuses.length})` : ''}<ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {ORDER.map((s) => (
              <DropdownMenuCheckboxItem key={s} checked={statuses.includes(s)}
                onCheckedChange={(on) => setStatuses(on ? [...statuses, s] : statuses.filter((x) => x !== s))}>
                {STATUS_LABELS[s]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger render={filterButton(!!type)}>{type ? typeName(type) : 'Type'}<ChevronDown /></DropdownMenuTrigger>
          <DropdownMenuContent>
            {templates.data?.map((t) => (
              <DropdownMenuCheckboxItem key={t.key} checked={type === t.key} onCheckedChange={(on) => setType(on ? t.key : '')}>
                {t.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" className="ml-auto text-muted-foreground" aria-pressed={grouped} onClick={() => setGrouped(!grouped)}>
          {grouped ? 'Grouped by status' : 'Not grouped'}
        </Button>
      </div>

      <div className="mx-6 mb-8 overflow-hidden rounded-lg border bg-card">
        {tasks.isPending ? (
          <div className="space-y-4 p-5" aria-label="Loading tasks">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)}
          </div>
        ) : tasks.isError ? (
          <p role="alert" className="p-5 text-destructive">{tasks.error.message} <Button variant="link" onClick={() => tasks.refetch()}>Retry</Button></p>
        ) : !tasks.data.length ? (
          filtering ? (
            <EmptyState title="No tasks match these filters" body="Try fewer filters or a different search."
              action={<Button variant="outline" onClick={() => { setQ(''); setMine(false); setStatuses([]); setType('') }}>Clear filters</Button>} />
          ) : (
            <EmptyState title="No tasks yet" body="Tasks your team adds show up here, grouped by where they are."
              action={can('task.create') ? <Button onClick={() => setCreating(true)}><Plus />New task</Button> : undefined} />
          )
        ) : (
          <div className={cn(tasks.isPlaceholderData && 'opacity-60')}>
            <div className="flex items-center gap-3 border-b px-5 py-2.5 text-xs text-muted-foreground" aria-hidden>
              <span className="w-12 shrink-0">ID</span>
              <span className="flex-1">Title</span>
              <span className="hidden w-24 shrink-0 @4xl:inline">Type</span>
              <span className="w-36 shrink-0">Status</span>
              <span className="hidden w-32 shrink-0 @2xl:inline">Author</span>
              <span className="hidden w-24 shrink-0 text-right @xl:inline">Updated</span>
            </div>
            {groups.map(([status, ts]) => (
              <section key={status ?? 'all'} aria-label={status ? STATUS_LABELS[status] : 'Tasks'}>
                {status && (
                  <h2 className="flex items-baseline gap-2 px-5 pt-4 pb-1.5 text-xs font-medium text-muted-foreground">
                    {STATUS_LABELS[status]}<span className="num">{ts.length}</span>
                  </h2>
                )}
                {ts.map((t) => (
                  <button key={t.id} onClick={() => open(t.id)} aria-current={t.id === taskId || undefined}
                    className={cn('flex h-11 w-full items-center gap-3 border-t border-rule px-5 text-left transition-colors duration-(--motion) hover:bg-accent/40',
                      t.id === taskId && 'bg-accent')}>
                    <span className="task-id w-12 shrink-0 text-muted-foreground">#{t.number}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{t.title}</span>
                      {!!t.checklist?.length && <span className="num ml-2 text-xs text-muted-foreground">{t.checklist.filter((c) => c.done).length}/{t.checklist.length}</span>}
                      {t.labels.slice(0, 2).map((l) => <span key={l} className="ml-2 hidden text-xs text-muted-foreground @3xl:inline">{l}</span>)}
                    </span>
                    <span className="hidden w-24 shrink-0 truncate text-muted-foreground @4xl:inline">{typeName(t.type_key)}</span>
                    <span className="w-36 shrink-0"><StatusBadge status={t.status} /></span>
                    <span className="hidden w-32 shrink-0 truncate text-muted-foreground @2xl:inline">{t.author.name}</span>
                    <span className="num hidden w-24 shrink-0 text-right text-xs text-muted-foreground @xl:inline">{ago(t.updated_at)}</span>
                  </button>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  )

  return (
    <>
      <SplitView
        list={list}
        pane={taskId && templates.data && (
          <TaskDetailPane key={taskId} wid={wid} taskId={taskId} templates={templates.data} onClose={() => navigate(`/w/${wid}/tasks`)} />
        )}
      />
      {templates.data && (
        <TaskForm
          wid={wid} templates={templates.data}
          open={creating || !!fromItem || wantsNew}
          onOpenChange={(o) => { setCreating(o); if (!o) closeIdea() }}
          prefill={fromItem ? { fromItem, title: params.get('title') ?? '' } : undefined}
          onSaved={(t) => open(t.id)}
        />
      )}
    </>
  )
}
