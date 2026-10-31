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

const VAR: Record<TaskStatus, string> = {
  draft: '--st-draft', pending_approval: '--st-pending', changes_requested: '--st-changes',
  approved: '--st-approved', in_jira: '--st-jira', jira_failed: '--st-jira-failed',
  in_progress: '--st-progress', done: '--st-done', rejected: '--st-rejected',
  duplicate: '--st-duplicate', snoozed: '--st-snoozed',
}

export function statusColor(status: TaskStatus) {
  return `var(${VAR[status]})`
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const c = statusColor(status)
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ color: c, backgroundColor: `color-mix(in oklab, ${c} 12%, transparent)` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: c }} />
      {STATUS_LABELS[status]}
    </span>
  )
}
