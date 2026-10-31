import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { PrivateNote } from './PrivateNote'

it('loads my note and saves on blur', async () => {
  const fn = mockApi({
    'GET /api/me/notes/w1/t1': { text: 'Ask Priya', updated_at: '2026-11-02T09:00:00Z' },
    'PUT /api/me/notes/w1/t1': { text: 'Ask Priya about storage', updated_at: '2026-11-02T09:05:00Z' },
  })
  renderWithProviders(<PrivateNote wid="w1" taskId="t1" />)
  const box = await screen.findByDisplayValue('Ask Priya')
  expect(screen.getByText('Only you can see this.')).toBeInTheDocument()
  await userEvent.type(box, ' about storage')
  await userEvent.tab()
  expect(fn).toHaveBeenCalledWith('/api/me/notes/w1/t1', expect.objectContaining({ method: 'PUT', json: { text: 'Ask Priya about storage' } }))
  expect(await screen.findByText('Saved')).toBeInTheDocument()
})

it('does not save when nothing changed', async () => {
  const fn = mockApi({ 'GET /api/me/notes/w1/t1': { text: '', updated_at: null } })
  renderWithProviders(<PrivateNote wid="w1" taskId="t1" />)
  await screen.findByLabelText('My notes')
  await userEvent.click(screen.getByLabelText('My notes'))
  await userEvent.tab()
  expect(fn).not.toHaveBeenCalledWith('/api/me/notes/w1/t1', expect.objectContaining({ method: 'PUT' }))
})
