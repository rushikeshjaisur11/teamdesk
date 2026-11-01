import { useQuery } from '@tanstack/react-query'
import { Building2, FileText, Inbox, Lightbulb, ListTodo, Moon, Plus, Settings, Stamp } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StatusBadge } from '@/components/StatusBadge'
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command'
import { api } from '@/lib/api'
import { qk, useWorkspace, wpath } from '@/lib/queries'
import { currentTheme, setTheme } from '@/lib/theme'
import type { Doc, Item, Task } from '@/lib/types'
import { useDebounced } from '@/lib/useDebounced'
import { useShortcut } from '@/lib/useShortcut'

type Action = { id: string; label: string; icon: typeof Inbox; run: () => void; shortcut?: string }

/** Ctrl/⌘ K: find tasks (by words or #number), jump to a page, or run a command. */
export function CommandPalette({ onNewTask, onCapture, open: controlled, onOpenChange }: {
  onNewTask?: () => void; onCapture?: () => void; open?: boolean; onOpenChange?: (open: boolean) => void
}) {
  const { wid, me, can } = useWorkspace()
  const navigate = useNavigate()
  const [own, setOwn] = useState(false)
  const open = controlled ?? own
  const setOpen = onOpenChange ?? setOwn
  const [text, setText] = useState('')
  const query = useDebounced(text.trim(), 250)
  const number = /^#?(\d+)$/.exec(query)?.[1]
  useShortcut('mod+k', () => setOpen(!open))

  const mine = useQuery({
    queryKey: qk.items({ palette: query }),
    queryFn: () => api<Item[]>(`/api/me/items?q=${encodeURIComponent(query)}&limit=6`),
    enabled: open && query.length > 0 && !number,
  })
  const tasks = useQuery({
    queryKey: qk.tasks(wid, { palette: query }),
    queryFn: () => api<Task[]>(wpath(wid, number ? `/tasks?number=${number}` : `/tasks?q=${encodeURIComponent(query)}&limit=8`)),
    enabled: open && query.length > 0,
  })

  const docs = useQuery({
    queryKey: ['w', wid, 'docs', 'list', 'q', query],
    queryFn: () => api<Doc[]>(wpath(wid, `/docs?q=${encodeURIComponent(query)}&limit=6`)),
    enabled: open && query.length > 0 && !number,
  })

  const close = () => { setOpen(false); setText('') }
  const go = (path: string) => { close(); navigate(path) }
  const actions: Action[] = [
    { id: 'tasks', label: 'Go to Tasks', icon: ListTodo, run: () => go(`/w/${wid}/tasks`) },
    { id: 'docs', label: 'Go to Docs', icon: FileText, run: () => go(`/w/${wid}/docs`) },
    ...(can('task.create') ? [{ id: 'meetings', label: 'Tasks from meeting notes', icon: FileText, run: () => go(`/w/${wid}/meetings`) }] : []),
    ...(can('task.create') ? [{ id: 'inbox', label: 'Go to Inbox', icon: Inbox, run: () => go(`/w/${wid}/inbox`) }] : []),
    ...(can('task.approve') ? [{ id: 'approvals', label: 'Go to Approvals', icon: Stamp, run: () => go(`/w/${wid}/approvals`) }] : []),
    ...(can('settings.manage') ? [{ id: 'settings', label: 'Go to Settings', icon: Settings, run: () => go(`/w/${wid}/settings`) }] : []),
    ...(can('task.create') && onNewTask ? [{ id: 'new', label: 'New task', icon: Plus, shortcut: 'N', run: () => { close(); onNewTask() } }] : []),
    ...(can('task.create') && onCapture ? [{ id: 'idea', label: 'Capture an idea', icon: Lightbulb, shortcut: 'I', run: () => { close(); onCapture() } }] : []),
    { id: 'theme', label: 'Toggle light and dark theme', icon: Moon, run: () => { setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); close() } },
    ...(me?.workspaces ?? []).filter((w) => w.id !== wid).map((w) => (
      { id: `ws-${w.id}`, label: `Switch to ${w.name}`, icon: Building2, run: () => go(`/w/${w.id}/tasks`) })),
    ...(me?.user.is_platform_owner ? [{ id: 'platform', label: 'Manage workspaces', icon: Building2, run: () => go('/platform/workspaces') }] : []),
  ]
  const words = text.trim().toLowerCase()
  const shown = actions.filter((a) => !words || a.label.toLowerCase().includes(words))

  return (
    <CommandDialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())} title="Search and commands"
      description="Find a task by words or #number, or run a command.">
      <Command shouldFilter={false}>
        <CommandInput placeholder="Search tasks or type a command" value={text} onValueChange={setText} />
        <CommandList>
          {!!tasks.data?.length && (
            <CommandGroup heading="Tasks">
              {tasks.data.map((t) => (
                <CommandItem key={t.id} value={`task-${t.id}`} onSelect={() => go(`/w/${wid}/tasks/${t.id}`)}>
                  <span className="num w-10 text-muted-foreground">#{t.number}</span>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <StatusBadge status={t.status} />
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!docs.data?.length && (
            <CommandGroup heading="Docs">
              {docs.data.map((d) => (
                <CommandItem key={d.id} value={`doc-${d.id}`} onSelect={() => go(`/w/${wid}/docs/${d.id}`)}>
                  <FileText /><span className="min-w-0 flex-1 truncate">{d.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!mine.data?.length && (
            <CommandGroup heading="My items">
              {mine.data.map((i) => (
                <CommandItem key={i.id} value={`item-${i.id}`} onSelect={() => go(i.kind === 'idea' ? '/me/inbox' : i.kind === 'waiting' ? '/me/waiting' : `/me/tasks?item=${i.id}`)}>
                  <span className="min-w-0 flex-1 truncate">{i.title}</span>
                  <span className="text-xs text-muted-foreground">{i.kind === 'idea' ? 'Idea' : i.kind === 'waiting' ? 'Waiting on' : 'My task'}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!shown.length && (
            <CommandGroup heading="Actions">
              {shown.map((a) => (
                <CommandItem key={a.id} value={a.id} onSelect={a.run}>
                  <a.icon />{a.label}{a.shortcut && <CommandShortcut>{a.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandEmpty>{query && tasks.isFetching ? 'Searching' : 'Nothing found. Try other words.'}</CommandEmpty>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
