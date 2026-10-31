import '@testing-library/jest-dom/vitest'

// Components talk to the server through `api`; tests replace it via mockApi() in src/test/utils.tsx.
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), api: vi.fn() }))

// jsdom lacks pointer-capture APIs that Base UI calls on press.
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
// cmdk measures its list and scrolls items into view; jsdom has neither API.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
Element.prototype.scrollIntoView ??= () => {}
