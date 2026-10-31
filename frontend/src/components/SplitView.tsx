import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A list plus an optional detail pane.
 * "detail": the list is the main thing and a 30rem pane opens beside it (tasks).
 * "inbox": a fixed list column and the open item fills the rest (approval queue).
 * Below 1024px the pane overlays the list.
 */
export function SplitView({ list, pane, variant = 'detail' }: { list: ReactNode; pane?: ReactNode; variant?: 'detail' | 'inbox' }) {
  const inbox = variant === 'inbox'
  return (
    <div className="relative flex min-h-0 flex-1">
      <div className={cn('@container min-w-0 overflow-y-auto', inbox ? 'flex-1 lg:w-[27rem] lg:flex-none' : 'flex-1')}>{list}</div>
      {pane && (
        <section
          aria-label="Details"
          className={cn('absolute inset-0 z-20 flex flex-col overflow-y-auto border-l bg-card shadow-xl animate-in fade-in slide-in-from-right-4 duration-(--motion) lg:static lg:z-auto lg:shadow-none',
            inbox ? 'lg:min-w-0 lg:flex-1' : 'lg:w-[30rem] lg:shrink-0')}
        >
          {pane}
        </section>
      )}
    </div>
  )
}
