import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type NavItem = { to: string; label: string; icon: LucideIcon; count?: number }
export type NavSection = { label?: string; top?: ReactNode; items: NavItem[] }

function Link({ item, compact }: { item: NavItem; compact: boolean }) {
  const link = (
    <NavLink
      to={item.to}
      className={({ isActive }) => cn(
        'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-muted-foreground transition-colors duration-(--motion) hover:bg-accent/60 hover:text-foreground',
        isActive && 'bg-accent text-foreground',
        compact && 'justify-center px-0',
      )}
    >
      <item.icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
      {compact ? <span className="sr-only">{item.label}</span> : <span className="flex-1 truncate">{item.label}</span>}
      {!!item.count && (
        <span className={cn('num text-xs font-medium text-foreground', compact && 'absolute ml-7 -mt-5')} aria-label={`${item.count} waiting`}>
          {item.count}
        </span>
      )}
    </NavLink>
  )
  return compact ? (
    <Tooltip>
      <TooltipTrigger render={<div className="relative" />}>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  ) : link
}

export function Sidebar({ compact, header, sections, footer }: {
  compact: boolean
  header: ReactNode
  sections: NavSection[]
  footer?: ReactNode
}) {
  return (
    <nav aria-label="Main" className="flex h-full w-full flex-col overflow-y-auto px-3 py-4">
      <div className="mb-4">{header}</div>
      {sections.map((s, i) => (
        <div key={i} className={cn('flex flex-col gap-0.5', i > 0 && 'mt-6')}>
          {s.label && !compact && <p className="mb-1 px-2.5 text-xs text-muted-foreground">{s.label}</p>}
          {s.top && <div className="mb-2">{s.top}</div>}
          {s.items.map((item) => <Link key={item.to} item={item} compact={compact} />)}
        </div>
      ))}
      <div className="mt-auto pt-4">{footer}</div>
    </nav>
  )
}
