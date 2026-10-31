import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { api } from '@/lib/api'
import { qk, wpath } from '@/lib/queries'
import { ago } from '@/lib/time'
import type { Notification } from '@/lib/types'
import { cn } from '@/lib/utils'

export function NotificationBell({ wid }: { wid: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const list = useQuery({
    queryKey: qk.notifications(wid),
    queryFn: () => api<Notification[]>(wpath(wid, '/notifications?limit=30')),
    refetchInterval: 30_000,
  })
  const read = useMutation({
    mutationFn: (body: { ids?: string[]; all?: boolean }) => api(wpath(wid, '/notifications/read'), { method: 'POST', json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications(wid) }),
  })
  const unread = list.data?.filter((n) => !n.read).length ?? 0

  const openOne = (n: Notification) => {
    if (!n.read) read.mutate({ ids: [n.id] })
    setOpen(false)
    navigate(`/w/${wid}/tasks/${n.task_id}`)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} />}>
        <Bell />
        {!!unread && <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="font-semibold">Notifications</p>
          {!!unread && <Button variant="ghost" size="xs" onClick={() => read.mutate({ all: true })}>Mark all read</Button>}
        </div>
        {!list.data?.length ? (
          <p className="px-4 py-6 text-center text-muted-foreground">Nothing new. Decisions and comments on your tasks show up here.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {list.data.map((n) => (
              <li key={n.id}>
                <button onClick={() => openOne(n)} className={cn('flex w-full gap-3 px-4 py-2.5 text-left hover:bg-accent', n.read && 'text-muted-foreground')}>
                  <span aria-hidden className={cn('mt-2 size-1.5 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words">{n.text}</span>
                    <span className="text-xs text-muted-foreground">{ago(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
