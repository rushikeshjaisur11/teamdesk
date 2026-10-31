import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import { mockApi, renderWithProviders, STORY_TEMPLATE } from '@/test/utils'
import { TaskForm } from './TaskForm'

it('shows server field errors under the matching field', async () => {
  mockApi({
    'GET /api/w/w1/tasks/similar': [],
    'POST /api/w/w1/tasks': new ApiError(422, 'Some required fields are empty.', { scope: 'Scope is required.' }),
  })
  renderWithProviders(<TaskForm wid="w1" templates={[STORY_TEMPLATE]} open onOpenChange={() => {}} />)
  await userEvent.type(screen.getByLabelText('Title'), 'Retry loader')
  await userEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
  expect(await screen.findByText('Scope is required.')).toBeInTheDocument()
  expect(screen.getByLabelText(/^Scope/)).toHaveAttribute('aria-invalid', 'true')
})

it('sends the template fields and submit flag', async () => {
  const fn = mockApi({ 'GET /api/w/w1/tasks/similar': [], 'POST /api/w/w1/tasks': { id: 'x', number: 3, status: 'pending_approval' } })
  renderWithProviders(<TaskForm wid="w1" templates={[STORY_TEMPLATE]} open onOpenChange={() => {}} />)
  await userEvent.type(screen.getByLabelText('Title'), 'Retry loader')
  await userEvent.type(screen.getByLabelText(/^Context/), 'flaky')
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  expect(fn).toHaveBeenCalledWith('/api/w/w1/tasks', expect.objectContaining({
    method: 'POST', json: expect.objectContaining({ type_key: 'story', title: 'Retry loader', fields: { context: 'flaky' }, submit: false }),
  }))
})

it('shows possibly similar tasks', async () => {
  mockApi({ 'GET /api/w/w1/tasks/similar': [{ id: 't9', number: 9, title: 'Loader retries', status: 'approved' }] })
  renderWithProviders(<TaskForm wid="w1" templates={[STORY_TEMPLATE]} open onOpenChange={() => {}} />)
  await userEvent.type(screen.getByLabelText('Title'), 'loader retry')
  expect(await screen.findByText('Loader retries', {}, { timeout: 2000 })).toBeInTheDocument()
})
