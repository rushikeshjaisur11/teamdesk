export class ApiError extends Error {
  status: number
  detail: unknown
  fields?: Record<string, string>

  constructor(status: number, message: string, fields?: Record<string, string>, detail?: unknown) {
    super(message)
    this.status = status
    this.fields = fields
    this.detail = detail
  }
}

function messageOf(detail: unknown, status: number): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((d) => `${(d.loc ?? []).filter((l: unknown) => l !== 'body').join('.')}: ${d.msg}`).join('; ')
  }
  if (detail && typeof detail === 'object' && 'message' in detail) return String(detail.message)
  return status >= 500 ? 'Something went wrong on the server. Try again in a moment.' : `Request failed (${status}).`
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init
  const res = await fetch(path, {
    ...rest,
    credentials: 'include',
    headers: {
      'X-Requested-With': 'TeamDesk',
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers as Record<string, string>),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  if (res.status === 204) return undefined as T
  const body = res.headers.get('Content-Type')?.includes('json') ? await res.json() : null
  if (!res.ok) {
    const detail = body?.detail
    const fields = detail && typeof detail === 'object' && 'fields' in detail ? detail.fields : undefined
    throw new ApiError(res.status, messageOf(detail, res.status), fields, detail)
  }
  return body as T
}
