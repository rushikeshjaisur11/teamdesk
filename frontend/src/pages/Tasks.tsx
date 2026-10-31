import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/AppShell'
import { EmptyState } from '@/components/EmptyState'
import { SplitView } from '@/components/SplitView'
import { StatusBadge, STATUS_LABELS, statusColor } from '@/components/StatusBadge'
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
  const fromIdea = params.get('fromIdea') ?? undefined
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
  const closeIdea = () => { params.delete('fromIdea'); params.delete('title'); params.delete('new'); setParams(params, { replace: true }) }

  const list = (
    <>
      <PageHeader title="Tasks">
        {can('task.create') && (
          <Button onClick={() => setCreating(true)}>
            <Plus />New task<kbd className="ml-1 rounded border border-primary-foreground/30 px-1 text-xs">N</kbd>
          </Button>
        )}
      </PageHeader>
      <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className="pl-8" />
        </div>
        <Button variant={mine ? 'secondary' : 'ghost'} aria-pressed={mine} onClick={() => setMine(!mine)}>Mine</Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant={statuses.length ? 'secondary' : 'ghost'} />}>
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
          <DropdownMenuTrigger render={<Button variant={type ? 'secondary' : 'ghost'} />}>
            {type ? typeName(type) : 'Type'}<ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {templates.data?.map((t) => (
              <DropdownMenuCheckboxItem key={t.key} checked={type === t.key} onCheckedChange={(on) => setType(on ? t.key : '')}>
                {t.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" className="ml-auto" aria-pressed={grouped} onClick={() => setGrouped(!grouped)}>
          {grouped ? 'Grouped by status' : 'Not grouped'}
        </Button>
      </div>

      {tasks.isPending ? (
        <div className="space-y-3 px-6 py-2" aria-label="Loading tasks">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : tasks.isError ? (
        <p role="alert" className="px-6 text-destructive">{tasks.error.message}</p>
      ) : !tasks.data.length ? (
        filtering ? (
          <EmptyState title="No tasks match these filters" body="Try fewer filters or a different search."
            action={<Button variant="outline" onClick={() => { setQ(''); setMine(false); setStatuses([]); setType('') }}>Clear filters</Button>} />
        ) : (
          <EmptyState title="No tasks yet" body="Tasks your team adds show up here, grouped by where they are in the flow."
            action={can('task.create') ? <Button onClick={() => setCreating(true)}><Plus />New task</Button> : undefined} />
        )
      ) : (
        <div className={cn('pb-10', tasks.isPlaceholderData && 'opacity-60')}>
          {groups.map(([status, ts]) => (
            <section key={status ?? 'all'} aria-label={status ? STATUS_LABELS[status] : 'Tasks'}>
              {status && (
                <h2 className="sticky top-0 z-10 flex items-center gap-2 border-y bg-background/95 px-6 py-1.5 text-xs font-semibold backdrop-blur">
                  <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: statusColor(status) }} />
                  {STATUS_LABELS[status]} <span className="num font-normal text-muted-foreground">{ts.length}</span>
                </h2>
              )}
              {ts.map((t) => (
                <button key={t.id} onClick={() => open(t.id)} aria-current={t.id === taskId || undefined}
                  className={cn('flex w-full items-center gap-3 px-6 py-2.5 text-left transition-colors duration-(--motion) hover:bg-accent/60',
                    t.id === taskId && 'bg-accent')}>
                  <span className="num w-10 shrink-0 text-muted-foreground">#{t.number}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                  <span className="hidden text-muted-foreground @4xl:inline">{typeName(t.type_key)}</span>
                  {t.labels.slice(0, 2).map((l) => <span key={l} className="hidden rounded-sm border px-1.5 text-xs text-muted-foreground @3xl:inline">{l}</span>)}
                  <StatusBadge status={t.status} />
                  <span className="hidden w-28 shrink-0 truncate text-muted-foreground @2xl:inline">{t.author.name}</span>
                  <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground @xl:inline">{ago(t.updated_at)}</span>
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
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
          open={creating || !!fromIdea || wantsNew}
          onOpenChange={(o) => { setCreating(o); if (!o) closeIdea() }}
          prefill={fromIdea ? { fromIdea, title: params.get('title') ?? '' } : undefined}
          onSaved={(t) => open(t.id)}
        />
      )}
    </>
  )
}
