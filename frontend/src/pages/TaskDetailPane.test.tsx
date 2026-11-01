import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeTask, mockApi, renderWithProviders, STORY_TEMPLATE } from '@/test/utils'
import { TaskDetailPane } from './TaskDetailPane'

const CL = [{ id: 'a', text: 'Write the retry', done: false }]
const me = (sub: string, permissions: string[]) => ({ user: { sub, name: sub, email: '', is_platform_owner: false },
  workspaces: [{ id: 'w1', name: 'W', slug: 'w', roles: [], permissions }] })
const base = (sub: string, perms: string[]) => ({
  'GET /api/auth/me': me(sub, perms), 'GET /api/w/w1/tasks/t1': makeTask({ checklist: CL } as never),
  'GET /api/w/w1/tasks/t1/activity': [], 'GET /api/me/notes/w1/t1': { text: '', updated_at: null },
})
const render = () => renderWithProviders(<TaskDetailPane wid="w1" taskId="t1" templates={[STORY_TEMPLATE]} />,
  { route: '/w/w1/tasks/t1', path: '/w/:wid/tasks/:taskId' })

it('the author ticks a checklist step', async () => {
  const fn = mockApi({ ...base('dev', ['task.view', 'task.create']), 'PUT /api/w/w1/tasks/t1/checklist': makeTask() })
  render()
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Write the retry' }))
  expect(fn).toHaveBeenCalledWith('/api/w/w1/tasks/t1/checklist', expect.objectContaining({
    method: 'PUT', json: [{ id: 'a', text: 'Write the retry', done: true }] }))
})

it('someone else sees the checklist read-only, and their own private note', async () => {
  mockApi(base('view', ['task.view']))
  render()
  expect(await screen.findByRole('checkbox', { name: 'Write the retry' })).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByLabelText('My notes')).toBeInTheDocument()
})

it('a linked task shows its Jira key, opens it in Jira, and says comments go there too', async () => {
  const meJira = me('dev', ['task.view', 'task.create'])
  meJira.workspaces[0] = { ...meJira.workspaces[0], jira_connected: true } as never
  mockApi({ ...base('dev', []), 'GET /api/auth/me': meJira,
    'GET /api/w/w1/tasks/t1': makeTask({ status: 'in_jira', jira_key: 'DATA-7', jira_url: 'https://acme.atlassian.net/browse/DATA-7', jira_status: 'In Review' }) })
  render()
  expect(await screen.findByRole('link', { name: /Open DATA-7 in Jira/ })).toHaveAttribute('href', 'https://acme.atlassian.net/browse/DATA-7')
  expect(screen.getByText(/In Review in Jira/)).toBeInTheDocument()
  expect(screen.getByText(/Also added to DATA-7 in Jira/)).toBeInTheDocument()
})
