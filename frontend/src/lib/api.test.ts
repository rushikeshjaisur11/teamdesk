vi.unmock('./api')

import { api, ApiError } from './api'

afterEach(() => vi.unstubAllGlobals())

function respond(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })))
}

it('turns 422 field errors into ApiError.fields', async () => {
  respond({ detail: { message: 'Some required fields are empty.', fields: { scope: 'Scope is required.' } } }, 422)
  await expect(api('/x')).rejects.toMatchObject({
    status: 422, message: 'Some required fields are empty.', fields: { scope: 'Scope is required.' } })
})

it('uses a string detail as the message', async () => {
  respond({ detail: "You can't approve your own task. Ask another approver." }, 403)
  const err = await api<never>("/x").catch((e: unknown) => e as ApiError)
  expect(err).toBeInstanceOf(ApiError)
  expect(err.message).toBe("You can't approve your own task. Ask another approver.")
})

it('sends JSON with credentials and returns parsed body', async () => {
  respond({ ok: true })
  expect(await api('/api/x', { method: 'POST', json: { a: 1 } })).toEqual({ ok: true })
  const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
  expect(url).toBe('/api/x')
  expect(init).toMatchObject({ method: 'POST', credentials: 'include', body: '{"a":1}' })
  expect(init.headers['Content-Type']).toBe('application/json')
  expect(init.headers['X-Requested-With']).toBe('TeamDesk')
})

it('returns undefined for 204', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
  expect(await api('/x')).toBeUndefined()
})

it('explains a pydantic 422 list in plain words', async () => {
  respond({ detail: [{ loc: ['body', 'title'], msg: 'String should have at most 200 characters' }] }, 422)
  await expect(api('/x')).rejects.toMatchObject({ message: 'title: String should have at most 200 characters' })
})
