import type { ReactNode } from 'react'

/** The screen's noun title, an optional one-line finding about the data, and real actions on the right. */
export function PageHeader({ title, finding, children }: { title: string; finding?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start gap-x-4 gap-y-2 px-6 pt-8 pb-5">
      <div className="mr-auto min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">{title}</h1>
        {finding && <p className="mt-1 text-muted-foreground">{finding}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}
