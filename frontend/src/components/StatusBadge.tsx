import type { TaskStatus } from '@/lib/types'

export const STATUS_LABELS: Record<TaskStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  in_jira: 'In Jira',
  jira_failed: 'Jira failed',
  in_progress: 'In progress',
  done: 'Done',
  rejected: 'Rejected',
  duplicate: 'Duplicate',
  snoozed: 'Snoozed',
}

type Tone = 'neutral' | 'warning' | 'positive' | 'negative' | 'info'

/** Colour only where someone has to act or where the outcome matters; closed and idle states stay grey. */
const TONE: Record<TaskStatus, Tone> = {
  draft: 'neutral', pending_approval: 'warning', changes_requested: 'negative', approved: 'positive',
  in_jira: 'info', jira_failed: 'negative', in_progress: 'neutral', done: 'positive',
  rejected: 'neutral', duplicate: 'neutral', snoozed: 'neutral',
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const tone = TONE[status]
  return (
    <span
      className="inline-flex h-6 flex-none items-center rounded-sm px-2 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: `var(--pill-${tone}-bg)`, color: `var(--pill-${tone}-ink)` }}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
