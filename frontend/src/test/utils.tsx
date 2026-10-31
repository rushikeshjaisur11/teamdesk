import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { api, ApiError } from '@/lib/api'
import type { Section, Task, Template } from '@/lib/types'

type Handler = unknown | ((init?: { json?: unknown }) => unknown)

/** Answer api() calls by "METHOD /path" (query string optional). ApiError values reject. Returns the mock. */
export function mockApi(routes: Record<string, Handler>) {
  const fn = vi.mocked(api)
  fn.mockImplementation(async (path: string, init?: RequestInit & { json?: unknown }) => {
    const method = init?.method ?? 'GET'
    const key = `${method} ${path}`
    const handler = key in routes ? routes[key] : routes[`${method} ${path.split('?')[0]}`]
    if (handler === undefined) throw new ApiError(404, `No mock for ${key}`)
    const value = typeof handler === 'function' ? (handler as (i?: unknown) => unknown)(init) : handler
    if (value instanceof ApiError) throw value
    return value as never
  })
  return fn
}

export function renderWithProviders(ui: ReactElement, { route = '/', path = '*' } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes><Route path={path} element={ui} /></Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

const sec = (key: string, label: string, required = true): Section => ({ key, label, required, hint: `${label} hint` })

export const STORY_TEMPLATE: Template = {
  id: 'tp1', key: 'story', name: 'Story', jira_issue_type: 'Story', default_labels: [],
  sections: [sec('context', 'Context'), sec('scope', 'Scope'), sec('acceptance', 'Acceptance criteria'), sec('out_of_scope', 'Out of scope', false)],
}

export function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: 't1', number: 1, type_key: 'story', title: 'Add retry to loader', labels: [],
    fields: { context: 'flaky', scope: 'loader', acceptance: 'retries 3x' }, status: 'pending_approval',
    author: { sub: 'dev', name: 'Dev One', email: 'dev@corp.test' }, decision: null, duplicate_of: null,
    snoozed_until: null, jira_key: null, created_at: '2026-10-31T10:00:00Z', updated_at: '2026-10-31T10:00:00Z',
    submitted_at: '2026-10-31T10:00:00Z', ...over,
  }
}
