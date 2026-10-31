import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { Inbox } from './Inbox'

const IDEA = { id: 'i1', owner_sub: 'dev', text: 'cache schema lookups?', promoted_task_id: null, created_at: '2026-10-31T10:00:00Z' }

it('deletes only after the undo window, and undo keeps the idea', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const fn = mockApi({ 'GET /api/w/w1/ideas': [IDEA], 'DELETE /api/w/w1/ideas/i1': undefined })
  renderWithProviders(<Inbox />, { route: '/w/w1/inbox', path: '/w/:wid/inbox' })
  await userEvent.click(await screen.findByRole('button', { name: 'Delete idea: cache schema lookups?' }))
  expect(screen.queryByText('cache schema lookups?')).toBeNull()
  await act(() => vi.advanceTimersByTimeAsync(6000))
  expect(fn).toHaveBeenCalledWith('/api/w/w1/ideas/i1', { method: 'DELETE' })
  vi.useRealTimers()
})

it('shows the empty state', async () => {
  mockApi({ 'GET /api/w/w1/ideas': [] })
  renderWithProviders(<Inbox />, { route: '/w/w1/inbox', path: '/w/:wid/inbox' })
  expect(await screen.findByText('Your inbox is empty')).toBeInTheDocument()
})
