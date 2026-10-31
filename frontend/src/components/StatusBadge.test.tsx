import { render, screen } from '@testing-library/react'
import { StatusBadge, STATUS_LABELS } from './StatusBadge'

it.each([
  ['pending_approval', 'Pending approval'], ['changes_requested', 'Changes requested'],
  ['in_jira', 'In Jira'], ['jira_failed', 'Jira failed'], ['draft', 'Draft'], ['snoozed', 'Snoozed'],
])('labels %s', (status, label) => {
  render(<StatusBadge status={status as keyof typeof STATUS_LABELS} />)
  expect(screen.getByText(label)).toBeInTheDocument()
})

it('covers every status', () => {
  expect(Object.keys(STATUS_LABELS).sort()).toEqual([
    'approved', 'changes_requested', 'done', 'draft', 'duplicate', 'in_jira', 'in_progress',
    'jira_failed', 'pending_approval', 'rejected', 'snoozed'])
})
