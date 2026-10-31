import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { NotificationBell } from './NotificationBell'

const N = (id: string, read: boolean) => ({ id, user_sub: 'dev', kind: 'decision', task_id: 't1', text: `#1 note ${id}`, read, created_at: '2026-10-31T10:00:00Z' })

it('shows the unread count and marks all read', async () => {
  const fn = mockApi({ 'GET /api/w/w1/notifications': [N('a', false), N('b', false), N('c', true)], 'POST /api/w/w1/notifications/read': undefined })
  renderWithProviders(<NotificationBell wid="w1" />)
  const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' })
  await userEvent.click(bell)
  expect(screen.getByText('#1 note a')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
  expect(fn).toHaveBeenCalledWith('/api/w/w1/notifications/read', expect.objectContaining({ method: 'POST', json: { all: true } }))
})
