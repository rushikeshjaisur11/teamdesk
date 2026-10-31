import { MoreHorizontal, Pin, Repeat } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { dayWords, localToday } from '@/lib/days'
import { useItemActions } from '@/lib/itemActions'
import type { Item } from '@/lib/types'
import { cn } from '@/lib/utils'

/** One personal item: complete, open, pin for today, and a menu for the rest. */
export function ItemRow({ item, onOpen, actions }: { item: Item; onOpen?: () => void; actions?: React.ReactNode }) {
  const act = useItemActions()
  const [hidden, setHidden] = useState(false)
  if (hidden) return null
  const today = localToday()
  const done = item.status !== 'open'
  const pinned = item.today_on === today
  const steps = item.checklist.length ? `${item.checklist.filter((c) => c.done).length}/${item.checklist.length}` : null

  return (
    <div className="group flex min-h-11 items-center gap-3 border-t border-rule px-5 py-2 first:border-t-0">
      {item.kind !== 'idea' && (
        <Checkbox aria-label={`Done: ${item.title}`} checked={done}
          onCheckedChange={(on) => (on ? act.complete(item) : act.reopen(item))} />
      )}
      <button onClick={onOpen} disabled={!onOpen} className="min-w-0 flex-1 text-left">
        <span className={cn('break-words', done && 'text-muted-foreground line-through')}>{item.title}</span>
        {steps && <span className="num ml-2 text-xs text-muted-foreground">{steps}</span>}
        {item.recurrence && <Repeat className="ml-2 inline size-3.5 text-muted-foreground" aria-label="Repeats" />}
      </button>
      {item.due_on && !done && (
        <span data-testid="due" className={cn('num shrink-0 text-xs', item.due_on < today ? 'text-destructive' : 'text-muted-foreground')}>
          {dayWords(item.due_on, today)}
        </span>
      )}
      {actions}
      {!done && item.kind !== 'idea' && (
        <Button variant="ghost" size="icon-sm" aria-pressed={pinned} aria-label={pinned ? `Unpin: ${item.title}` : `Pin for today: ${item.title}`}
          className={cn(!pinned && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')} onClick={() => act.pin(item, !pinned)}>
          <Pin className={cn(pinned && 'fill-current')} />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More for ${item.title}`} />}><MoreHorizontal /></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onOpen && <DropdownMenuItem onClick={onOpen}>Edit</DropdownMenuItem>}
          {!done && <DropdownMenuItem onClick={() => act.drop(item)}>Drop</DropdownMenuItem>}
          <DropdownMenuItem onClick={() => act.remove(item, () => setHidden(true), () => setHidden(false))}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
