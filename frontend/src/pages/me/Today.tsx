import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { ItemRow } from '@/components/ItemRow'
import { ItemSheet } from '@/components/ItemSheet'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { daysBetween, formatDay } from '@/lib/days'
import { useItemActions } from '@/lib/itemActions'
import { useToday } from '@/lib/queries'
import type { Item } from '@/lib/types'

function Section({ name, children, note }: { name: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section aria-label={name} className="mx-6 mb-6">
      <h2 className="mb-2 flex items-baseline justify-between text-xs font-medium text-muted-foreground">{name}{note}</h2>
      <div className="overflow-hidden rounded-lg border bg-card">{children}</div>
    </section>
  )
}

function Rollover({ item }: { item: Item }) {
  const act = useItemActions()
  const [moving, setMoving] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-rule px-5 py-2.5 first:border-t-0">
      <span className="min-w-0 flex-1 break-words">{item.title}</span>
      {moving ? (
        <Input type="date" aria-label={`New date for ${item.title}`} className="w-40" autoFocus
          onChange={(e) => e.target.value && act.update(item, { due_on: e.target.value }).then(() => act.pin(item, false))} />
      ) : (
        <>
          <Button size="sm" variant="secondary" aria-label={`Keep for today: ${item.title}`} onClick={() => act.pin(item, true)}>Keep for today</Button>
          <Button size="sm" variant="ghost" onClick={() => setMoving(true)}>Reschedule</Button>
          <Button size="sm" variant="ghost" onClick={() => act.drop(item)}>Drop</Button>
        </>
      )}
    </div>
  )
}

export function Today() {
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const t = today.data
  const all = t ? [...t.rollover, ...t.pinned, ...t.due, ...t.followups] : []
  const editing = all.find((i) => i.id === params.get('item')) ?? null
  const open = (i: Item) => setParams({ item: i.id })

  if (today.isPending) return <div className="space-y-3 p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
  if (today.isError) return <p role="alert" className="p-6 text-destructive">{today.error.message}</p>

  const waitingOnYou = t!.sent_back.length + t!.approvals.length
  const empty = !all.length && !waitingOnYou
  const finding = [
    t!.pinned.length && `${t!.pinned.length} pinned`,
    t!.due.length && `${t!.due.length} due`,
    t!.followups.length && `${t!.followups.length} to follow up`,
    waitingOnYou && `${waitingOnYou} waiting on you`,
  ].filter(Boolean).join(', ')

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title="Today" finding={`${formatDay(t!.date)}. ${finding ? `${finding[0].toUpperCase()}${finding.slice(1)}.` : 'A clear day.'}`} />

      {t!.is_friday && (
        <p className="mx-6 mb-6 rounded-lg bg-card px-5 py-3">It's Friday. Clear your <Link className="underline underline-offset-2" to="/me/inbox">Inbox</Link> before the weekend?</p>
      )}

      {empty && <EmptyState title="Nothing pinned or due" body={<>Press <kbd className="rounded border bg-muted px-1.5 text-xs">I</kbd> to capture a thought, or pin up to three things from <Link className="underline underline-offset-2" to="/me/tasks">My tasks</Link>.</>} />}

      {!!t!.rollover.length && (
        <Section name="From earlier" note={<span>Pinned on an earlier day and not done</span>}>
          {t!.rollover.map((i) => <Rollover key={i.id} item={i} />)}
        </Section>
      )}
      {!!t!.pinned.length && (
        <Section name="Pinned for today" note={<span className="num">{t!.pinned.length} of 3</span>}>
          {t!.pinned.map((i) => <ItemRow key={i.id} item={i} onOpen={() => open(i)} />)}
        </Section>
      )}
      {!!t!.due.length && (
        <Section name="Due">{t!.due.map((i) => <ItemRow key={i.id} item={i} onOpen={() => open(i)} />)}</Section>
      )}
      {!!waitingOnYou && (
        <Section name="Waiting on you">
          {t!.approvals.map((a) => (
            <Link key={a.workspace_id} to={`/w/${a.workspace_id}/approvals`} className="flex min-h-11 items-center border-t border-rule px-5 first:border-t-0 hover:bg-accent/40">
              {a.count} waiting for your approval in {a.workspace_name}
            </Link>
          ))}
          {t!.sent_back.map((s) => (
            <Link key={s.task.id} to={`/w/${s.workspace_id}/tasks/${s.task.id}`} className="flex min-h-11 items-center gap-3 border-t border-rule px-5 first:border-t-0 hover:bg-accent/40">
              <span className="task-id text-muted-foreground">#{s.task.number}</span>
              <span className="min-w-0 flex-1 truncate">{s.task.title}</span>
              <span className="text-xs text-muted-foreground">Sent back in {s.workspace_name}</span>
            </Link>
          ))}
        </Section>
      )}
      {!!t!.followups.length && (
        <Section name="Follow-ups due">
          {t!.followups.map((i) => (
            <ItemRow key={i.id} item={i} onOpen={() => open(i)}
              actions={<span className="text-xs text-muted-foreground">{i.waiting!.who}, {daysBetween(i.waiting!.since, t!.date)} days</span>} />
          ))}
        </Section>
      )}

      <ItemSheet item={editing} onClose={() => setParams({})} />
    </div>
  )
}
