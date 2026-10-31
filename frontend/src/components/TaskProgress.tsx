import { ago } from '@/lib/time'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/utils'

type Step = { label: string; detail: string; state: 'done' | 'current' | 'todo' | 'stopped' }

/** Where this task is: written, submitted, decided. A Jira step appears only once the task has a Jira ticket. */
export function pathSteps(t: Task): Step[] {
  const submitted = !!t.submitted_at
  const d = t.decision
  const approved = ['approved', 'in_jira', 'jira_failed', 'in_progress', 'done'].includes(t.status)
  const stopped = ['rejected', 'duplicate'].includes(t.status)
  const decision: Step = d && d.action !== 'snooze'
    ? {
        label: { approve: 'Approved', reject: 'Rejected', request_changes: 'Sent back', duplicate: 'Duplicate' }[d.action] ?? 'Decided',
        detail: d.by.sub === 'rule' ? `Automatically, by “${d.by.name}”` : `${d.by.name}, ${ago(d.at)}`,
        state: approved ? 'done' : stopped ? 'stopped' : 'current',
      }
    : { label: 'Approval', detail: submitted ? `Waiting ${ago(t.submitted_at!).replace(' ago', '')}` : 'Not submitted yet', state: submitted ? 'current' : 'todo' }
  const steps: Step[] = [
    { label: 'Written', detail: `${t.author.name}, ${ago(t.created_at)}`, state: 'done' },
    { label: 'Submitted', detail: submitted ? ago(t.submitted_at!) : 'Still a draft', state: submitted ? 'done' : 'current' },
    decision,
  ]
  if (t.jira_key) steps.push({ label: 'In Jira', detail: t.jira_key, state: 'done' })
  return steps
}

export function TaskProgress({ task }: { task: Task }) {
  const steps = pathSteps(task)
  return (
    <ol aria-label="Progress" className={cn('grid gap-2 px-6 py-4', steps.length === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
      {steps.map((s, i) => (
        <li key={s.label} aria-current={s.state === 'current' ? 'step' : undefined} className="min-w-0">
          <div className="mb-2 flex items-center">
            <span className={cn('size-2.5 shrink-0 rounded-full border-2',
              s.state === 'done' && 'border-foreground bg-foreground',
              s.state === 'current' && 'border-foreground bg-card',
              s.state === 'todo' && 'border-input bg-card',
              s.state === 'stopped' && 'border-muted-foreground bg-muted-foreground')} />
            {i < steps.length - 1 && <span className={cn('ml-1 h-0.5 flex-1', s.state === 'done' ? 'bg-foreground' : 'bg-border')} />}
          </div>
          <p className={cn('text-xs font-medium', s.state === 'todo' && 'text-muted-foreground')}>{s.label}</p>
          <p className={cn('truncate text-xs text-muted-foreground', s.label === 'In Jira' && 'font-medium text-hue')} title={s.detail}>{s.detail}</p>
        </li>
      ))}
    </ol>
  )
}
