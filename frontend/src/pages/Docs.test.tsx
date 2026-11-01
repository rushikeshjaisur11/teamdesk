import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { Docs } from './Docs'

const me = (permissions: string[]) => ({ user: { sub: 'dev', name: 'Dev', email: '', is_platform_owner: false },
  workspaces: [{ id: 'w1', name: 'W', slug: 'w', roles: [], permissions }] })
const by = { sub: 'adm', name: 'Asha' }
const DOC = { id: 'd1', title: 'Restart the loader', body: '## Steps\n\n1. Scale down\n2. Scale up\n\n```\nkubectl rollout restart\n```',
  folder_id: 'f1', version: 2, updated_at: new Date().toISOString(), updated_by: by }

it('shows the folder tree, renders a doc, and searches', async () => {
  mockApi({
    'GET /api/auth/me': me(['task.view', 'doc.edit']),
    'GET /api/w/w1/docs/folders': [{ id: 'f1', name: 'Runbooks', parent_id: null }],
    'GET /api/w/w1/docs': [DOC],
    'GET /api/w/w1/docs?q=rollout': [{ ...DOC, snippet: '…kubectl rollout restart' }],
    'GET /api/w/w1/docs/d1': DOC,
  })
  renderWithProviders(<Docs />, { route: '/w/w1/docs/d1', path: '/w/:wid/docs/:docId?' })
  expect(await screen.findByRole('button', { name: /Runbooks/ })).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: 'Steps' })).toBeInTheDocument()
  expect(screen.getByText('kubectl rollout restart')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Edit/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Folder/ })).not.toBeInTheDocument() // no doc.manage_folders
  await userEvent.type(screen.getByLabelText('Search docs'), 'rollout')
  expect(await screen.findByText('…kubectl rollout restart')).toBeInTheDocument()
})
