import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/EmptyState'
import { ItemRow } from '@/components/ItemRow'
import { ItemSheet } from '@/components/ItemSheet'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { localToday, taskGroup, type TaskGroup } from '@/lib/days'
import { useItemActions } from '@/lib/itemActions'
import { useItems } from '@/lib/queries'
import type { Item } from '@/lib/types'

const GROUPS: [TaskGroup, string][] = [['overdue', 'Overdue'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['no_date', 'No date']]

export function MyTasks() {
  const act = useItemActions()
  const [params, setParams] = useSearchParams()
  const open = useItems({ kind: 'task' })
  const done = useItems({ kind: 'task', status: 'done' })
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const editing = [...(open.data ?? []), ...(done.data ?? [])].find((i) => i.id === params.get('item')) ?? null
  const today = localToday()

  const add = async () => {
    const t = title.trim()
    if (!t) return
    try {
      await act.create({ kind: 'task', title: t, ...(due ? { due_on: due } : {}) })
      setTitle(''); setDue('')
    } catch (e) { toast.error((e as Error).message) }
  }
  const openItem = (i: Item) => setParams({ item: i.id })
  const list = open.data ?? []
  const count = (g: TaskGroup) => list.filter((i) => taskGroup(i, today) === g).length
  const archived = (done.data ?? []).filter((i) => i.status !== 'open')

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title="My tasks" finding={open.data && (list.length
        ? `${list.length} open. ${count('overdue') ? `${count('overdue')} overdue, ` : ''}${count('today')} due today.`
        : 'Nothing open.')} />

      <form className="mx-6 mb-6 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); add() }}>
        <Input aria-label="New task" placeholder="Add a task" value={title} maxLength={500} onChange={(e) => setTitle(e.target.value)} className="min-w-56 flex-1 bg-card" />
        <Input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-44 bg-card" />
        <Button type="submit" disabled={!title.trim()}>Add</Button>
      </form>

      {open.isPending ? <div className="mx-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
        : open.isError ? <p role="alert" className="mx-6 text-destructive">{open.error.message}</p>
        : !list.length ? <EmptyState title="No open tasks" body="Add one above, or press I anywhere to capture a thought and sort it later." />
        : GROUPS.filter(([g]) => count(g)).map(([g, label]) => (
          <section key={g} aria-label={label} className="mx-6 mb-6">
            <h2 className="mb-2 text-xs font-medium text-muted-foreground">{label} <span className="num">{count(g)}</span></h2>
            <div className="overflow-hidden rounded-lg border bg-card">
              {list.filter((i) => taskGroup(i, today) === g).map((i) => <ItemRow key={i.id} item={i} onOpen={() => openItem(i)} />)}
            </div>
          </section>
        ))}

      {!!archived.length && (
        <section aria-label="Archived" className="mx-6 mb-10">
          <h2 className="mb-2 text-xs font-medium text-muted-foreground">Archived <span className="num">{archived.length}</span></h2>
          <div className="overflow-hidden rounded-lg border bg-card">
            {archived.map((i) => <ItemRow key={i.id} item={i} />)}
          </div>
        </section>
      )}

      <ItemSheet item={editing} onClose={() => setParams({})} />
    </div>
  )
}
