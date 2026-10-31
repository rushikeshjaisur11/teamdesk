import { Building2, Check, ChevronsUpDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Me } from '@/lib/types'
import { rememberWorkspace } from '@/lib/lastWorkspace'

function monogram(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

export function WorkspaceSwitcher({ me, wid, compact }: { me: Me; wid: string; compact: boolean }) {
  const navigate = useNavigate()
  const current = me.workspaces.find((w) => w.id === wid)
  const go = (id: string) => { rememberWorkspace(id); navigate(`/w/${id}/tasks`) }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Switch workspace"
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-card px-2.5 text-left hover:bg-accent/60"
      >
        {compact ? <span className="w-full text-center text-xs font-semibold">{monogram(current?.name ?? '?')}</span> : <>
          <span className="flex-1 truncate">{current?.name}</span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {me.workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onClick={() => go(w.id)}>
            <span className="flex-1 truncate">{w.name}</span>
            {w.id === wid && <Check className="size-4" aria-label="Current workspace" />}
          </DropdownMenuItem>
        ))}
        {me.user.is_platform_owner && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/platform/workspaces')}>
            <Building2 className="size-4" />Manage workspaces
          </DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
