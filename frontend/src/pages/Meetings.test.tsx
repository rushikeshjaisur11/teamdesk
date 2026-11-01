import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders, STORY_TEMPLATE } from '@/test/utils'
import { groupMeetings, Meetings } from './Meetings'

const me = (ai: boolean) => ({ user: { sub: 'dev', name: 'Dev', email: '', is_platform_owner: false }, ai_enabled: ai,
  workspaces: [{ id: 'w1', name: 'W', slug: 'w', roles: [], permissions: ['task.view', 'task.create', 'doc.edit'] }] })
const by = { sub: 'dev', name: 'Dev' }
const LIST = [
  { id: 'm1', title: 'Standup', series: 'Daily standup', date: '2026-11-03', created_by: by },
  { id: 'm2', title: 'Vendor call', series: '', date: '2026-11-03', created_by: by },
  { id: 'm3', title: 'Planning', series: 'Sprint planning', date: '2026-11-02', created_by: by },
  { id: 'm4', title: 'Standup', series: 'Daily standup', date: '2026-11-02', created_by: by },
]
const M1 = { ...LIST[0], notes: 'Priya will add retries to the loader by Friday.', summary: '', proposed: [], created: [] }
const render = (route = '/w/w1/meetings/m1') => renderWithProviders(<Meetings />, { route, path: '/w/:wid/meetings/:meetingId?' })

it('groups meetings by series, newest group first, ungrouped last', () => {
  expect(groupMeetings(LIST).map(([g, ms]) => [g, ms.length])).toEqual([['Daily standup', 2], ['Sprint planning', 1], ['Other meetings', 1]])
})

it('shows the groups in the list', async () => {
  mockApi({ 'GET /api/auth/me': me(false), 'GET /api/w/w1/meetings': LIST, 'GET /api/w/w1/templates': [STORY_TEMPLATE] })
  render('/w/w1/meetings')
  const standups = await screen.findByRole('region', { name: 'Daily standup' })
  expect(within(standups).getAllByRole('link')).toHaveLength(2)
  expect(screen.getByRole('region', { name: 'Other meetings' })).toBeInTheDocument()
})

it('uploads a transcript into the notes', async () => {
  const fn = mockApi({ 'GET /api/auth/me': me(false), 'GET /api/w/w1/meetings': LIST, 'GET /api/w/w1/meetings/m1': { ...M1, notes: '' },
    'GET /api/w/w1/templates': [STORY_TEMPLATE], 'POST /api/w/w1/meetings/parse': { text: 'Sam: ship it' } })
  render()
  await userEvent.upload(await screen.findByLabelText('Transcript file'), new File(['WEBVTT'], 'standup.vtt', { type: 'text/vtt' }))
  expect(await screen.findByDisplayValue('Sam: ship it')).toBeInTheDocument()
  expect(fn).toHaveBeenCalledWith('/api/w/w1/meetings/parse', expect.objectContaining({ json: expect.objectContaining({ filename: 'standup.vtt' }) }))
})

it('summarizes and creates only the ticked tasks as drafts', async () => {
  const done = { ...M1, summary: '## Decisions\n\n- Drop the cron job', proposed: [
    { title: 'Add retries to the loader', details: 'By Friday.', type_key: 'story', owner: 'Priya' },
    { title: 'Write the runbook', details: '', type_key: 'story', owner: '' }] }
  const fn = mockApi({
    'GET /api/auth/me': me(true), 'GET /api/w/w1/meetings': LIST, 'GET /api/w/w1/meetings/m1': M1, 'GET /api/w/w1/templates': [STORY_TEMPLATE],
    'PUT /api/w/w1/meetings/m1': done, 'POST /api/w/w1/meetings/m1/extract': done,
    'POST /api/w/w1/tasks': { id: 't9', number: 9, title: 'Add retries to the loader' },
  })
  render()
  await userEvent.click(await screen.findByRole('button', { name: /Summarize and find tasks/ }))
  expect(await screen.findByRole('heading', { name: 'Decisions' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('checkbox', { name: 'Keep: Write the runbook' }))
  await userEvent.click(screen.getByRole('button', { name: /Create 1 draft task/ }))
  await screen.findByText(/1 draft task created/)
  const creates = fn.mock.calls.filter(([path, init]) => path === '/api/w/w1/tasks' && init?.method === 'POST')
  expect(creates).toHaveLength(1)
  const body = creates[0][1]!.json as { title: string; fields: object }
  expect(body.title).toBe('Add retries to the loader')
  expect(JSON.stringify(body.fields)).toContain('Suggested owner: Priya')
  const last = fn.mock.calls.filter(([path, init]) => path === '/api/w/w1/meetings/m1' && init?.method === 'PUT').at(-1)!
  expect(last[1]!.json).toMatchObject({ created: [{ id: 't9', number: 9 }], proposed: [{ title: 'Write the runbook' }] })
})
