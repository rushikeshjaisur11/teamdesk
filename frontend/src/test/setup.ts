import '@testing-library/jest-dom/vitest'

// Components talk to the server through `api`; tests replace it via mockApi() in src/test/utils.tsx.
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: vi.fn() }))
