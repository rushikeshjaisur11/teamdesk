import type { ReactNode } from 'react'

export function EmptyState({ title, body, action }: { title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-6 py-16 text-center">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-muted-foreground">{body}</p>
      {action}
    </div>
  )
}
