import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/EmptyState'
import { ItemRow } from '@/components/ItemRow'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { daysBetween, localToday } from '@/lib/days'
import { useItemActions } from '@/lib/itemActions'
import { useItems } from '@/lib/queries'

export function Waiting() {
  const items = useItems({ kind: 'waiting' })
  const act = useItemActions()
  const [what, setWhat] = useState('')
  const [who, setWho] = useState('')
  const [nudge, setNudge] = useState(3)
  const today = localToday()
  const add = async () => {
    try {
      await act.create({ kind: 'waiting', title: what.trim(), waiting: { who: who.trim(), since: today, nudge_after_days: nudge } })
      setWhat(''); setWho('')
    } catch (e) { toast.error((e as Error).message) }
  }
  const list = items.data ?? []
  const overdue = list.filter((i) => daysBetween(i.waiting!.since, today) >= i.waiting!.nudge_after_days).length

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title="Waiting on" finding={items.data && (list.length
        ? `${list.length} open. ${overdue ? `${overdue} past their follow-up date.` : 'None past their follow-up date.'}`
        : 'Nothing you are waiting on.')} />
      <form className="mx-6 mb-6 grid gap-3 rounded-lg bg-card p-4 sm:grid-cols-[1fr_12rem_8rem_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); add() }}>
        <div className="space-y-1.5"><Label htmlFor="w-what">What</Label><Input id="w-what" value={what} maxLength={500} placeholder="Cost numbers for the embeddings job" onChange={(e) => setWhat(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="w-who">From whom</Label><Input id="w-who" value={who} maxLength={200} placeholder="Priya" onChange={(e) => setWho(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="w-nudge">Nudge after</Label>
          <div className="flex items-center gap-2"><Input id="w-nudge" type="number" min={1} max={60} value={nudge} className="w-16" onChange={(e) => setNudge(Math.min(60, Math.max(1, Number(e.target.value) || 1)))} /><span className="text-muted-foreground">days</span></div>
        </div>
        <Button type="submit" disabled={!what.trim() || !who.trim()}>Add</Button>
      </form>
      {items.isError ? <p role="alert" className="mx-6 text-destructive">{items.error.message}</p>
        : items.data && !list.length ? <EmptyState title="Nothing to chase" body="When you're waiting on someone, add it here and you'll be nudged to follow up." />
        : (
          <div className="mx-6 mb-10 overflow-hidden rounded-lg border bg-card">
            {list.map((i) => {
              const days = daysBetween(i.waiting!.since, today)
              return (
                <ItemRow key={i.id} item={i} actions={
                  <span className={days >= i.waiting!.nudge_after_days ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                    {i.waiting!.who}, {days === 0 ? 'since today' : `${days} ${days === 1 ? 'day' : 'days'}`}
                  </span>} />
              )
            })}
          </div>
        )}
    </div>
  )
}
