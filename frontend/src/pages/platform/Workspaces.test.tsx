import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { Workspaces } from './Workspaces'

it('suggests a short name and creates the workspace', async () => {
  const fn = mockApi({ 'GET /api/platform/workspaces': [], 'POST /api/platform/workspaces': { id: 'w9', name: 'Data Platform', slug: 'data-platform', archived: false, admin_groups: ['g'] } })
  renderWithProviders(<Workspaces />)
  await userEvent.click(await screen.findByRole('button', { name: 'Create workspace' }))
  await userEvent.type(screen.getByLabelText('Name'), 'Data Platform')
  expect(screen.getByLabelText('Short name')).toHaveValue('data-platform')
  await userEvent.type(screen.getByLabelText('Admin group'), 'grp-data-admins')
  await userEvent.click(screen.getByRole('button', { name: 'Create' }))
  expect(fn).toHaveBeenCalledWith('/api/platform/workspaces', expect.objectContaining({
    method: 'POST', json: { name: 'Data Platform', slug: 'data-platform', admin_group: 'grp-data-admins' } }))
})
