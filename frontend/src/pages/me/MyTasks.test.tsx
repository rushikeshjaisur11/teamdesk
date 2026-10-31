import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { localToday, shiftDay } from '@/lib/days'
import type { Item } from '@/lib/types'
import { mockApi, renderWithProviders } from '@/test/utils'
import { MyTasks } from './MyTasks'

export function makeItem(over: Partial<Item> = {}): Item {
  return { id: 'i1', kind: 'task', title: 'Ring the vendor', notes: '', status: 'open', due_on: null, today_on: null,
    checklist: [], recurrence: null, labels: [], waiting: null, link: null, promoted_to: null, remind_at: null,
    created_at: '2026-10-31T10:00:00Z', updated_at: '2026-10-31T10:00:00Z', done_at: null, ...over }
}

it('quick add sends the title and date', async () => {
  const fn = mockApi({ 'GET /api/me/items': [], 'POST /api/me/items': makeItem() })
  renderWithProviders(<MyTasks />)
  await userEvent.type(await screen.findByLabelText('New task'), 'Ring the vendor')
  await userEvent.type(screen.getByLabelText('Due date'), '2026-11-06')
  await userEvent.click(screen.getByRole('button', { name: 'Add' }))
  expect(fn).toHaveBeenCalledWith('/api/me/items', expect.objectContaining({
    method: 'POST', json: { kind: 'task', title: 'Ring the vendor', due_on: '2026-11-06' } }))
})

it('shows overdue dates in the negative colour, grouped', async () => {
  mockApi({ 'GET /api/me/items': [makeItem({ due_on: shiftDay(localToday(), -2) })] })
  renderWithProviders(<MyTasks />)
  const group = await screen.findByRole('region', { name: 'Overdue' })
  expect(within(group).getByText(/Ring the vendor/)).toBeInTheDocument()
  expect(within(group).getByTestId('due')).toHaveClass('text-destructive')
})

it('completing a repeating task says when the next one is', async () => {
  const rec = makeItem({ recurrence: { freq: 'weekly', days: [4] }, due_on: localToday() })
  mockApi({ 'GET /api/me/items': [rec], 'POST /api/me/items/i1/complete': { item: { ...rec, status: 'done' }, next: { ...rec, id: 'i2', due_on: '2026-11-06' } } })
  renderWithProviders(<MyTasks />)
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Done: Ring the vendor' }))
  expect(await screen.findByText(/Next one on Fri 6 Nov/)).toBeInTheDocument()
})
