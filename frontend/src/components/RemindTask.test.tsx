import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeTask, mockApi, renderWithProviders } from '@/test/utils'
import { RemindTask } from './RemindTask'

it('creates a private reminder linked to the team task', async () => {
  const fn = mockApi({ 'POST /api/me/items': { id: 'p1' } })
  renderWithProviders(<RemindTask wid="w1" task={makeTask({ id: 't1', number: 7, title: 'Alert routing' })} />)
  await userEvent.click(screen.getByRole('button', { name: 'Remind me' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Tomorrow 9:00' }))
  const call = fn.mock.calls.find(([p]) => p === '/api/me/items')!
  const body = (call[1] as { json: Record<string, unknown> }).json
  expect(body).toMatchObject({ kind: 'task', title: 'Follow up: #7 Alert routing', link: { workspace_id: 'w1', task_id: 't1' } })
  expect(new Date(body.remind_at as string).getHours()).toBe(9)
  expect(await screen.findByText(/Only you will see this reminder/)).toBeInTheDocument()
})
