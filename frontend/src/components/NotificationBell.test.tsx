import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { NotificationBell } from './NotificationBell'

const N = (id: string, read: boolean) => ({ id, user_sub: 'dev', kind: 'decision', task_id: 't1', text: `#1 note ${id}`, read, created_at: '2026-10-31T10:00:00Z' })

it('shows the unread count and marks all read', async () => {
  const fn = mockApi({ 'GET /api/w/w1/notifications': [N('a', false), N('b', false), N('c', true)], 'GET /api/me/notifications': [], 'POST /api/w/w1/notifications/read': undefined })
  renderWithProviders(<NotificationBell wid="w1" />)
  const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' })
  await userEvent.click(bell)
  expect(screen.getByText('#1 note a')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
  expect(fn).toHaveBeenCalledWith('/api/w/w1/notifications/read', expect.objectContaining({ method: 'POST', json: { all: true } }))
})

it('shows your own reminders next to team notifications and marks them read', async () => {
  const mine = { id: 'r1', kind: 'reminder', text: 'Reminder: call vendor', item_id: 'i1', read: false, created_at: '2026-10-31T11:00:00Z' }
  const fn = mockApi({ 'GET /api/w/w1/notifications': [N('a', true)], 'GET /api/me/notifications': [mine], 'POST /api/me/notifications/read': undefined })
  renderWithProviders(<NotificationBell wid="w1" />)
  await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }))
  await userEvent.click(screen.getByText('Reminder: call vendor'))
  expect(fn).toHaveBeenCalledWith('/api/me/notifications/read', expect.objectContaining({ json: { ids: ['r1'] } }))
})
