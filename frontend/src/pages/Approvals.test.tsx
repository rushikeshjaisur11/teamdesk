import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import { makeTask, mockApi, renderWithProviders, STORY_TEMPLATE } from '@/test/utils'
import { Approvals } from './Approvals'

const T1 = makeTask({ id: 't1', number: 1, title: 'Add retry to loader' })
const T2 = makeTask({ id: 't2', number: 2, title: 'Schema drift alert' })
const ME = { user: { sub: 'appr', name: 'Appr', email: '', is_platform_owner: false },
  workspaces: [{ id: 'w1', name: 'W', slug: 'w', roles: ['approver'], permissions: ['task.view', 'task.approve'] }] }
const BASE = {
  'GET /api/auth/me': ME, 'GET /api/w/w1/templates': [STORY_TEMPLATE],
  'GET /api/w/w1/tasks/t1': T1, 'GET /api/w/w1/tasks/t2': T2,
  'GET /api/w/w1/tasks/t1/activity': [], 'GET /api/w/w1/tasks/t2/activity': [],
}
const render = () => renderWithProviders(<Approvals />, { route: '/w/w1/approvals', path: '/w/:wid/approvals' })
const queue = () => within(screen.getByRole('listbox', { name: 'Waiting for approval' }))

afterEach(() => vi.useRealTimers())

it('approves the selected task with A and moves to the next', async () => {
  const fn = mockApi({ ...BASE, 'GET /api/w/w1/approvals': [T1, T2], 'POST /api/w/w1/tasks/t1/decision': { ...T1, status: 'approved' } })
  render()
  await screen.findByRole('listbox', { name: 'Waiting for approval' })
  await userEvent.keyboard('a')
  expect(fn).toHaveBeenCalledWith('/api/w/w1/tasks/t1/decision', expect.objectContaining({ method: 'POST', json: { action: 'approve' } }))
  await waitFor(() => expect(queue().queryByText(T1.title)).toBeNull())
  expect(queue().getByRole('option', { selected: true })).toHaveTextContent(T2.title)
})

it('J and K move the selection', async () => {
  mockApi({ ...BASE, 'GET /api/w/w1/approvals': [T1, T2] })
  render()
  await screen.findByRole('listbox', { name: 'Waiting for approval' })
  await userEvent.keyboard('j')
  expect(queue().getByRole('option', { selected: true })).toHaveTextContent(T2.title)
  await userEvent.keyboard('k')
  expect(queue().getByRole('option', { selected: true })).toHaveTextContent(T1.title)
})

it('reject waits for the undo window and undo sends nothing', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const fn = mockApi({ ...BASE, 'GET /api/w/w1/approvals': [T1], 'POST /api/w/w1/tasks/t1/decision': {} })
  render()
  await screen.findByRole('listbox', { name: 'Waiting for approval' })
  await userEvent.keyboard('r')
  await userEvent.type(screen.getByRole('textbox', { name: 'Reason' }), 'out of scope')
  await userEvent.click(screen.getByRole('button', { name: 'Reject task' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
  await act(() => vi.advanceTimersByTimeAsync(6000))
  expect(fn).not.toHaveBeenCalledWith('/api/w/w1/tasks/t1/decision', expect.anything())
  expect(queue().getByText(T1.title)).toBeInTheDocument()
})

it('puts the task back and shows the message on 409', async () => {
  mockApi({ ...BASE, 'GET /api/w/w1/approvals': [T1],
    'POST /api/w/w1/tasks/t1/decision': new ApiError(409, 'This task was already decided by someone else. Refresh to see the latest.') })
  render()
  await screen.findByRole('listbox', { name: 'Waiting for approval' })
  await userEvent.keyboard('a')
  expect(await screen.findByText(/already decided by someone else/)).toBeInTheDocument()
  await waitFor(() => expect(queue().getByText(T1.title)).toBeInTheDocument())
})

it('shows the empty state', async () => {
  mockApi({ ...BASE, 'GET /api/w/w1/approvals': [] })
  render()
  expect(await screen.findByText('Nothing waiting for approval')).toBeInTheDocument()
})
