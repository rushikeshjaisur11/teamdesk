import { APP_NAME } from '@/lib/brand'

/** TeamDesk's mark: a ticket stub (the thing every task becomes), drawn in ink. */
export function BrandMark({ withName = true }: { withName?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden>
        <path fill="currentColor" d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a3 3 0 0 0 0 6v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a3 3 0 0 0 0-6z" />
        <path stroke="var(--background)" strokeWidth="1.5" strokeDasharray="2 2" d="M15 5v14" />
      </svg>
      {withName ? <span className="font-semibold tracking-[-0.01em]">{APP_NAME}</span> : <span className="sr-only">{APP_NAME}</span>}
    </span>
  )
}
