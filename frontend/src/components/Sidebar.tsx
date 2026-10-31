import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type NavItem = { to: string; label: string; icon: LucideIcon; count?: number }

export function Sidebar({ compact, header, items, footer }: {
  compact: boolean
  header: ReactNode
  items: NavItem[]
  footer?: ReactNode
}) {
  return (
    <nav aria-label="Main" className="flex h-full w-full flex-col gap-0.5 px-3 py-4">
      <div className="mb-4">{header}</div>
      {items.map((item) => {
        const link = (
          <NavLink
            key={item.to}
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
              <span
                className={cn('num text-xs font-medium text-foreground', compact && 'absolute ml-7 -mt-5')}
                aria-label={`${item.count} waiting`}
              >
                {item.count}
              </span>
            )}
          </NavLink>
        )
        return compact ? (
          <Tooltip key={item.to}>
            <TooltipTrigger render={<div className="relative" />}>{link}</TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ) : link
      })}
      <div className="mt-auto">{footer}</div>
    </nav>
  )
}
