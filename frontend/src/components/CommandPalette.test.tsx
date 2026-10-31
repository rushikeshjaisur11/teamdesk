import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { makeTask, mockApi, renderWithProviders, STORY_TEMPLATE } from '@/test/utils'
import { CommandPalette } from './CommandPalette'

function Where() { return <output aria-label="location">{useLocation().pathname}</output> }
const me = (permissions: string[]) => ({ user: { sub: 'dev', name: 'Dev', email: '', is_platform_owner: false },
  workspaces: [{ id: 'w1', name: 'W', slug: 'w', roles: [], permissions }, { id: 'w2', name: 'Other', slug: 'o', roles: [], permissions }] })
const T12 = makeTask({ id: 't12', number: 12, title: 'Twelfth task' })
const render = () => renderWithProviders(<><CommandPalette /><Where /></>, { route: '/w/w1/tasks', path: '/w/:wid/*' })

it('jumps to a task by #number', async () => {
  mockApi({ 'GET /api/auth/me': me(['task.view']), 'GET /api/w/w1/templates': [STORY_TEMPLATE], 'GET /api/w/w1/tasks?number=12': [T12] })
  render()
  await userEvent.keyboard('{Control>}k{/Control}')
  await userEvent.type(screen.getByRole('combobox'), '#12')
  await screen.findByText('Twelfth task')
  await userEvent.keyboard('{Enter}')
  expect(screen.getByLabelText('location')).toHaveTextContent('/w/w1/tasks/t12')
})

it('searches tasks by text', async () => {
  mockApi({ 'GET /api/auth/me': me(['task.view']), 'GET /api/w/w1/templates': [], 'GET /api/w/w1/tasks?q=twelfth&limit=8': [T12] })
  render()
  await userEvent.keyboard('{Control>}k{/Control}')
  await userEvent.type(screen.getByRole('combobox'), 'twelfth')
  expect(await screen.findByText('Twelfth task')).toBeInTheDocument()
})

it('hides Approvals for users without task.approve', async () => {
  mockApi({ 'GET /api/auth/me': me(['task.view']), 'GET /api/w/w1/templates': [] })
  render()
  await userEvent.keyboard('{Control>}k{/Control}')
  expect(await screen.findByRole('option', { name: /Go to Tasks/ })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: /Go to Approvals/ })).toBeNull()
})

it('switches workspace', async () => {
  mockApi({ 'GET /api/auth/me': me(['task.view', 'task.approve']), 'GET /api/w/w1/templates': [] })
  render()
  await userEvent.keyboard('{Control>}k{/Control}')
  await userEvent.click(await screen.findByRole('option', { name: /Switch to Other/ }))
  expect(screen.getByLabelText('location')).toHaveTextContent('/w/w2/tasks')
})
