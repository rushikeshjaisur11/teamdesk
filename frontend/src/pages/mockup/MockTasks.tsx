import { Plus, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/AppShell'
import { StatusBadge, STATUS_LABELS, statusColor } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { MockLayout } from './MockLayout'
import { initials, MOCK_ACTIVITY, MOCK_TASKS, type MockTask } from './mockData'

const ORDER: TaskStatus[] = ['pending_approval', 'changes_requested', 'draft', 'approved', 'in_jira', 'jira_failed', 'in_progress', 'snoozed', 'done', 'rejected', 'duplicate']

export function Avatar({ name }: { name: string }) {
  return <span title={name} className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[0.7rem] font-semibold">{initials(name)}</span>
}

export function TaskRow({ t, selected, onSelect, trailing }: { t: MockTask; selected?: boolean; onSelect: () => void; trailing?: React.ReactNode }) {
  return (
    <button
      onClick={onSelect}
      aria-current={selected || undefined}
      className={cn('group flex w-full items-center gap-3 px-6 py-2.5 text-left transition-colors duration-(--motion) hover:bg-accent/60',
        selected && 'bg-accent')}
    >
      <span className="num w-9 shrink-0 text-muted-foreground">#{t.number}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
      <span className="hidden text-muted-foreground @4xl:inline">{t.type}</span>
      {t.labels.slice(0, 2).map((l) => <span key={l} className="hidden rounded-sm border px-1.5 text-xs text-muted-foreground @3xl:inline">{l}</span>)}
      {trailing ?? <StatusBadge status={t.status} />}
      <Avatar name={t.author} />
      <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground @xl:inline">{t.updated}</span>
    </button>
  )
}

export function TaskDetail({ t, onClose, readOnly }: { t: MockTask; onClose?: () => void; readOnly?: boolean }) {
  return (
    <div className="flex flex-col">
      <div className="sticky top-0 flex items-start gap-3 border-b bg-card px-6 py-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-muted-foreground"><span className="num">#{t.number}</span><span>{t.type}</span></div>
          <h2 className="text-lg leading-snug font-semibold">{t.title}</h2>
        </div>
        {onClose && <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close details"><X /></Button>}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 text-muted-foreground">
        <StatusBadge status={t.status} />
        <span className="flex items-center gap-2"><Avatar name={t.author} />{t.author}</span>
        <span>Updated {t.updated}</span>
      </div>
      <div className="space-y-5 px-6 pb-6">
        {t.fields.map(([label, text]) => (
          <section key={label}>
            <h3 className="mb-1 font-semibold">{label}</h3>
            <p className="whitespace-pre-line text-foreground/90">{text}</p>
          </section>
        ))}
      </div>
      <div className="border-t px-6 py-5">
        <h3 className="mb-3 font-semibold">Activity</h3>
        <ol className="space-y-3 border-l pl-4">
          {MOCK_ACTIVITY.map((a, i) => (
            <li key={i} className="relative">
              <span className="absolute top-2 -left-[1.3rem] size-2 rounded-full bg-border" aria-hidden />
              <p><span className="font-medium">{a.who}</span> <span className="text-muted-foreground">{a.what}</span> <span className="text-xs text-muted-foreground">{a.when}</span></p>
              {a.text && <p className="mt-1 rounded-md bg-muted px-3 py-2">{a.text}</p>}
            </li>
          ))}
        </ol>
        {!readOnly && (
          <div className="mt-4 space-y-2">
            <Textarea placeholder="Write a comment" aria-label="Comment" rows={3} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Ctrl + Enter to send</span>
              <Button size="sm">Comment</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function MockTasks() {
  const [selected, setSelected] = useState<MockTask | null>(MOCK_TASKS[0])
  const [q, setQ] = useState('')
  const [mine, setMine] = useState(false)
  const groups = useMemo(() => {
    const list = MOCK_TASKS.filter((t) => (!q || t.title.toLowerCase().includes(q.toLowerCase())) && (!mine || t.author === 'Asha Rao'))
    return ORDER.map((s) => [s, list.filter((t) => t.status === s)] as const).filter(([, ts]) => ts.length)
  }, [q, mine])

  return (
    <MockLayout pane={selected && <TaskDetail t={selected} onClose={() => setSelected(null)} />}>
      <PageHeader title="Tasks">
        <Button><Plus />New task<kbd className="ml-1 rounded border border-primary-foreground/30 px-1 text-xs">N</kbd></Button>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className="pl-8" />
        </div>
        <Button variant={mine ? 'secondary' : 'ghost'} aria-pressed={mine} onClick={() => setMine(!mine)}>Mine</Button>
        <Button variant="ghost">Status</Button>
        <Button variant="ghost">Type</Button>
      </div>
      <div className="pb-10">
        {groups.map(([status, ts]) => (
          <section key={status} aria-label={STATUS_LABELS[status]}>
            <h2 className="sticky top-0 z-10 flex items-center gap-2 border-y bg-background/95 px-6 py-1.5 text-xs font-semibold backdrop-blur">
              <span className="size-2 rounded-full" style={{ backgroundColor: statusColor(status) }} aria-hidden />
              {STATUS_LABELS[status]} <span className="num font-normal text-muted-foreground">{ts.length}</span>
            </h2>
            {ts.map((t) => <TaskRow key={t.id} t={t} selected={selected?.id === t.id} onSelect={() => setSelected(t)} />)}
          </section>
        ))}
      </div>
    </MockLayout>
  )
}
