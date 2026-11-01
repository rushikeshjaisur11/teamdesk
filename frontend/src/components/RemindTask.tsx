import { useQueryClient } from '@tanstack/react-query'
import { BellPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api'
import { PRESETS, presetTime, type Preset } from '@/lib/remind'
import type { Task } from '@/lib/types'

/** "Remind me" on a team task: a private reminder in My space, linked back to the task. */
export function RemindTask({ wid, task }: { wid: string; task: Task }) {
  const qc = useQueryClient()
  const remind = async (key: Preset) => {
    const at = presetTime(key)
    try {
      await api('/api/me/items', {
        method: 'POST',
        json: { kind: 'task', title: `Follow up: #${task.number} ${task.title}`.slice(0, 500),
          link: { workspace_id: wid, task_id: task.id }, remind_at: at.toISOString() },
      })
      qc.invalidateQueries({ queryKey: ['me'] })
      toast.success(`Reminder set for ${at.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}. Only you will see this reminder.`)
    } catch (e) { toast.error((e as Error).message) }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}><BellPlus />Remind me</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {PRESETS.map((p) => <DropdownMenuItem key={p.key} onClick={() => remind(p.key)}>{p.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
