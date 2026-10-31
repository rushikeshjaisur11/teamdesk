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
    <nav aria-label="Main" className="flex h-full w-full flex-col gap-1 p-2">
      <div className="mb-2">{header}</div>
      {items.map((item) => {
        const link = (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => cn(
              'flex h-9 items-center gap-3 rounded-md px-2.5 text-muted-foreground transition-colors duration-(--motion) hover:bg-accent hover:text-foreground',
              isActive && 'bg-accent font-medium text-foreground',
              compact && 'justify-center px-0',
            )}
          >
            <item.icon className="size-4.5 shrink-0" aria-hidden />
            {compact ? <span className="sr-only">{item.label}</span> : <span className="flex-1 truncate">{item.label}</span>}
            {!!item.count && (
              <span
                className={cn('num rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground',
                  compact && 'absolute ml-6 -mt-5')}
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
