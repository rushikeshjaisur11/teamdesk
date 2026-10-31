import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { QuickCapture } from './QuickCapture'

it('captures an idea with I and Enter', async () => {
  const fn = mockApi({ 'POST /api/me/items': { id: 'i1', kind: 'idea', title: 'cache lookups' } })
  renderWithProviders(<QuickCapture />)
  await userEvent.keyboard('i')
  await userEvent.type(screen.getByRole('textbox', { name: 'Capture an idea' }), 'cache lookups{Enter}')
  expect(fn).toHaveBeenCalledWith('/api/me/items', expect.objectContaining({ method: 'POST', json: { kind: 'idea', title: 'cache lookups' } }))
  expect(screen.queryByRole('textbox', { name: 'Capture an idea' })).toBeNull()
})

it('ignores empty ideas and closes on Escape', async () => {
  const fn = mockApi({})
  renderWithProviders(<QuickCapture />)
  await userEvent.keyboard('i')
  await userEvent.type(screen.getByRole('textbox', { name: 'Capture an idea' }), '   {Enter}')
  expect(fn).not.toHaveBeenCalled()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('textbox', { name: 'Capture an idea' })).toBeNull()
})
