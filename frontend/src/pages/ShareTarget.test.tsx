import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { mockApi, renderWithProviders } from '@/test/utils'
import { ShareTarget } from './ShareTarget'

it('saves the shared text as an idea and lands in the Inbox', async () => {
  const fn = mockApi({ 'POST /api/me/items': { id: 'i1' } })
  renderWithProviders(<Routes><Route path="/share" element={<ShareTarget />} /><Route path="/me/inbox" element={<p>inbox page</p>} /></Routes>,
    { route: '/share?title=Doc&url=https%3A%2F%2Fx.test' })
  await screen.findByText('inbox page')
  expect(fn).toHaveBeenCalledWith('/api/me/items', expect.objectContaining({ method: 'POST', json: { kind: 'idea', title: 'Doc https://x.test' } }))
})
it('goes straight to the Inbox when nothing was shared', async () => {
  const fn = mockApi({})
  renderWithProviders(<Routes><Route path="/share" element={<ShareTarget />} /><Route path="/me/inbox" element={<p>inbox page</p>} /></Routes>, { route: '/share' })
  await screen.findByText('inbox page')
  await waitFor(() => expect(fn).not.toHaveBeenCalled())
})
