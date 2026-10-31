import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { makeItem } from './MyTasks.test'
import { Today } from './Today'

const TODAY = {
  date: '2026-11-02', is_friday: false,
  rollover: [makeItem({ id: 'r1', title: 'From last week', today_on: '2026-10-30' })],
  pinned: [makeItem({ id: 'p1', title: 'Pinned one', today_on: '2026-11-02' })],
  due: [makeItem({ id: 'd1', title: 'Due thing', due_on: '2026-11-01' })],
  followups: [makeItem({ id: 'w1', kind: 'waiting', title: 'Cost numbers', waiting: { who: 'Priya', since: '2026-10-28', nudge_after_days: 3 } })],
  sent_back: [{ workspace_id: 'w1', workspace_name: 'Data Platform', task: { id: 't3', number: 3, title: 'Alert routing' } }],
  approvals: [{ workspace_id: 'w1', workspace_name: 'Data Platform', count: 2 }],
}

it('renders every section from the data', async () => {
  mockApi({ 'GET /api/me/today': TODAY })
  renderWithProviders(<Today />)
  for (const name of ['From earlier', 'Pinned for today', 'Due', 'Waiting on you', 'Follow-ups due']) {
    expect(await screen.findByRole('region', { name })).toBeInTheDocument()
  }
  expect(screen.getByText('Alert routing')).toBeInTheDocument()
  expect(screen.getByText(/2 waiting for your approval in Data Platform/)).toBeInTheDocument()
})

it('keep for today pins the rolled-over item', async () => {
  const fn = mockApi({ 'GET /api/me/today': TODAY, 'POST /api/me/items/r1/pin': makeItem({ id: 'r1' }) })
  renderWithProviders(<Today />)
  await userEvent.click(await screen.findByRole('button', { name: 'Keep for today: From last week' }))
  expect(fn).toHaveBeenCalledWith('/api/me/items/r1/pin', expect.objectContaining({ method: 'POST', json: { on: true } }))
})

it('says what to do when the day is empty', async () => {
  mockApi({ 'GET /api/me/today': { ...TODAY, rollover: [], pinned: [], due: [], followups: [], sent_back: [], approvals: [] } })
  renderWithProviders(<Today />)
  expect(await screen.findByText(/Nothing pinned or due/)).toBeInTheDocument()
})
