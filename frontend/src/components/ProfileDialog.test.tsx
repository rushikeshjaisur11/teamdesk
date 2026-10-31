import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { ProfileDialog } from './ProfileDialog'

it('creates a calendar link and shows it once', async () => {
  const fn = mockApi({
    'GET /api/me/profile': { sub: 'dev', name: 'Dev', email: 'd@x', tz: 'UTC', use_ai: true },
    'GET /api/me/calendar': { enabled: false },
    'POST /api/me/calendar/reset': { url: 'https://td.test/api/calendar/tok.ics' },
  })
  renderWithProviders(<ProfileDialog open onOpenChange={() => {}} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Create link' }))
  expect(await screen.findByDisplayValue('https://td.test/api/calendar/tok.ics')).toBeInTheDocument()
  expect(fn).toHaveBeenCalledWith('/api/me/calendar/reset', expect.objectContaining({ method: 'POST' }))
})
