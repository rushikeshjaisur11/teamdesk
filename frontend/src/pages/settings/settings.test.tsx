import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import { mockApi, renderWithProviders, STORY_TEMPLATE } from '@/test/utils'
import { Members } from './Members'
import { describeRule } from './Rules'

const ROLES = {
  admin: { name: 'Admin', permissions: ['task.view', 'roles.manage', 'settings.manage'] },
  member: { name: 'Member', permissions: ['task.view', 'task.create'] },
}
const SETTINGS = { name: 'W', slug: 'w', group_mappings: [{ group: 'g-admin', role: 'admin' }], roles: ROLES }
const ME = { user: { sub: 'adm', name: 'Adm', email: '', is_platform_owner: false },
  workspaces: [{ id: 'w1', name: 'W', slug: 'w', roles: ['admin'], permissions: ['task.view', 'roles.manage', 'settings.manage'] }] }

it('shows the lockout message from the server', async () => {
  mockApi({
    'GET /api/auth/me': ME, 'GET /api/w/w1/settings': SETTINGS, 'GET /api/w/w1/members': [],
    'PUT /api/w/w1/group-mappings': new ApiError(422, 'At least one group must map to a role that can manage roles, or nobody could fix access.'),
  })
  renderWithProviders(<Members />, { route: '/w/w1/settings/members', path: '/w/:wid/settings/members' })
  await userEvent.selectOptions(await screen.findByLabelText('Role for g-admin'), 'member')
  await userEvent.click(screen.getByRole('button', { name: 'Save groups' }))
  expect(await screen.findByText(/nobody could fix access/)).toBeInTheDocument()
})

it('saves edited group mappings', async () => {
  const fn = mockApi({ 'GET /api/auth/me': ME, 'GET /api/w/w1/settings': SETTINGS, 'GET /api/w/w1/members': [], 'PUT /api/w/w1/group-mappings': [] })
  renderWithProviders(<Members />, { route: '/w/w1/settings/members', path: '/w/:wid/settings/members' })
  await userEvent.click(await screen.findByRole('button', { name: 'Add group' }))
  await userEvent.type(screen.getByLabelText('Group name 2'), 'g-dev')
  await userEvent.selectOptions(screen.getByLabelText('Role for g-dev'), 'member')
  await userEvent.click(screen.getByRole('button', { name: 'Save groups' }))
  expect(fn).toHaveBeenCalledWith('/api/w/w1/group-mappings', expect.objectContaining({
    method: 'PUT', json: [{ group: 'g-admin', role: 'admin' }, { group: 'g-dev', role: 'member' }] }))
})

it('previews a rule in plain English', () => {
  const tech = { ...STORY_TEMPLATE, key: 'tech_debt', name: 'Tech debt' }
  const roles = { member: { name: 'Member', permissions: [] }, approver: { name: 'Approver', permissions: [] } }
  expect(describeRule({ type_keys: ['tech_debt'], author_roles: ['member'], labels_any: [] }, [tech], roles))
    .toBe('Tech debt tasks by Members are approved automatically.')
  expect(describeRule({ type_keys: [], author_roles: ['member'], labels_any: ['deps', 'chore'] }, [tech], roles))
    .toBe('Tasks by Members labelled deps or chore are approved automatically.')
  expect(describeRule({ type_keys: [], author_roles: [], labels_any: [] }, [tech], roles))
    .toBe('Pick at least one condition.')
})
