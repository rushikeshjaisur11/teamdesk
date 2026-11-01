import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { ProfileDialog } from './ProfileDialog'

it('sets out of office with a backup approver', async () => {
  const fn = mockApi({
    'GET /api/me/profile': { sub: 'appr', name: 'Asha', email: '', tz: 'UTC', use_ai: true },
    'GET /api/me/calendar': { enabled: false }, 'GET /api/me/teams': { connected: false }, 'GET /api/me/away': null,
    'GET /api/me/away/backups': [{ sub: 'sam', name: 'Sam', workspaces: ['Data'] }],
    'PUT /api/me/away': { from: '2026-11-10', to: '2026-11-14', backup_sub: 'sam', backup_name: 'Sam', note: '' },
  })
  renderWithProviders(<ProfileDialog open onOpenChange={() => {}} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Set out of office' }))
  await userEvent.selectOptions(screen.getByLabelText('Backup for approvals'), 'sam')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText(/backup Sam/)).toBeInTheDocument()
  expect(fn).toHaveBeenCalledWith('/api/me/away', expect.objectContaining({ method: 'PUT', json: expect.objectContaining({ backup_sub: 'sam' }) }))
})
