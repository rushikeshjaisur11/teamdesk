import { Building2, Check, ChevronsUpDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Me, WorkspaceSummary } from '@/lib/types'
import { rememberWorkspace } from '@/lib/lastWorkspace'
import { cn } from '@/lib/utils'

function monogram(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function Tile({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn('grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-[11px] font-semibold text-background', className)}>
      {monogram(name)}
    </span>
  )
}

const role = (w: WorkspaceSummary) => w.roles.map((r) => r[0].toUpperCase() + r.slice(1)).join(', ') || 'Member'

export function WorkspaceSwitcher({ me, wid, compact }: { me: Me; wid: string; compact: boolean }) {
  const navigate = useNavigate()
  const current = me.workspaces.find((w) => w.id === wid)
  const go = (id: string) => { rememberWorkspace(id); navigate(`/w/${id}/tasks`) }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Switch workspace"
        className={cn('flex w-full min-w-0 items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-accent/60 data-popup-open:bg-accent',
          compact && 'justify-center')}
      >
        <Tile name={current?.name ?? '?'} />
        {!compact && current && <>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate font-medium">{current.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{role(current)}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {me.workspaces.map((w) => (
            <DropdownMenuItem key={w.id} onClick={() => go(w.id)} className="gap-2.5">
              <Tile name={w.name} className="size-6 text-[10px]" />
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.id === wid && <Check className="size-4" aria-label="Current workspace" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {me.user.is_platform_owner && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/platform/workspaces')} className="gap-2.5">
            <Building2 className="size-4" />Manage workspaces
          </DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
