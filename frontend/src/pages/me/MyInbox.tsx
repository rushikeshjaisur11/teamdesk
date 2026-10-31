import { useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { ItemRow } from '@/components/ItemRow'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useItemActions } from '@/lib/itemActions'
import { useItems, useMe } from '@/lib/queries'
import type { Item } from '@/lib/types'

export function MyInbox() {
  const ideas = useItems({ kind: 'idea' })
  const me = useMe()
  const act = useItemActions()
  const navigate = useNavigate()
  const teams = (me.data?.workspaces ?? []).filter((w) => w.permissions.includes('task.create'))
  const toTeam = (i: Item, wid: string) =>
    navigate(`/w/${wid}/tasks?${new URLSearchParams({ fromItem: i.id, title: i.title.slice(0, 200) })}`)

  const actions = (i: Item) => (
    <>
      <Button variant="outline" size="sm" onClick={() => act.update(i, { kind: 'task' })}>Make my task</Button>
      {teams.length === 1 && <Button variant="outline" size="sm" onClick={() => toTeam(i, teams[0].id)}>Make team task</Button>}
      {teams.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>Make team task</DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {teams.map((w) => <DropdownMenuItem key={w.id} onClick={() => toTeam(i, w.id)}>In {w.name}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title="Inbox" finding={ideas.data && `${ideas.data.length} ${ideas.data.length === 1 ? 'idea' : 'ideas'}. Only you can see these.`} />
      {ideas.isPending ? <div className="mx-6 space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
        : ideas.isError ? <p role="alert" className="mx-6 text-destructive">{ideas.error.message}</p>
        : !ideas.data.length ? <EmptyState title="Your inbox is empty" body={<>Press <kbd className="rounded border bg-muted px-1.5 text-xs">I</kbd> anywhere to capture a thought in a second. It lands here.</>} />
        : (
          <div className="mx-6 mb-10 overflow-hidden rounded-lg border bg-card">
            {ideas.data.map((i) => <ItemRow key={i.id} item={i} actions={actions(i)} />)}
          </div>
        )}
    </div>
  )
}
