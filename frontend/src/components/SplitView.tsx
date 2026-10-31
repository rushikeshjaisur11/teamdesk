import type { ReactNode } from 'react'

/** List plus an optional detail pane: side by side from 1024px, pane overlays the list below that. */
export function SplitView({ list, pane }: { list: ReactNode; pane?: ReactNode }) {
  return (
    <div className="relative flex min-h-0 flex-1">
      <div className="@container min-w-0 flex-1 overflow-y-auto">{list}</div>
      {pane && (
        <section
          aria-label="Details"
          className="absolute inset-0 z-20 flex flex-col overflow-y-auto border-l bg-card shadow-xl animate-in fade-in slide-in-from-right-4 duration-(--motion) lg:static lg:z-auto lg:w-[30rem] lg:shrink-0 lg:shadow-none"
        >
          {pane}
        </section>
      )}
    </div>
  )
}
