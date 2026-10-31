import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { api } from './api'
import type { Activity, Me, Task, Template } from './types'

export const qk = {
  me: ['me'] as const,
  ws: (wid: string) => ['w', wid] as const,
  tasks: (wid: string, filters: object = {}) => ['w', wid, 'tasks', filters] as const,
  task: (wid: string, id: string) => ['w', wid, 'task', id] as const,
  activity: (wid: string, id: string) => ['w', wid, 'task', id, 'activity'] as const,
  similar: (wid: string, text: string) => ['w', wid, 'similar', text] as const,
  templates: (wid: string) => ['w', wid, 'templates'] as const,
  ideas: (wid: string) => ['w', wid, 'ideas'] as const,
  approvals: (wid: string) => ['w', wid, 'approvals'] as const,
  approvalCount: (wid: string) => ['w', wid, 'approvals', 'count'] as const,
  notifications: (wid: string) => ['w', wid, 'notifications'] as const,
  settings: (wid: string) => ['w', wid, 'settings'] as const,
  members: (wid: string) => ['w', wid, 'members'] as const,
  rules: (wid: string) => ['w', wid, 'rules'] as const,
  audit: (wid: string) => ['w', wid, 'audit'] as const,
  platform: ['platform', 'workspaces'] as const,
}

export const wpath = (wid: string, path: string) => `/api/w/${wid}${path}`

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => api<Me>('/api/auth/me'), staleTime: 60_000 })
}

/** The workspace from the URL plus the caller's permissions in it. */
export function useWorkspace() {
  const { wid = '' } = useParams()
  const me = useMe()
  const ws = me.data?.workspaces.find((w) => w.id === wid)
  return { wid, ws, me: me.data, can: (perm: string) => !!ws?.permissions.includes(perm) }
}

export function useApprovalCount(wid: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.approvalCount(wid),
    queryFn: () => api<{ count: number }>(wpath(wid, '/approvals/count')),
    enabled, refetchInterval: 30_000,
  })
}

export function useTemplates(wid: string) {
  return useQuery({ queryKey: qk.templates(wid), queryFn: () => api<Template[]>(wpath(wid, '/templates')), staleTime: 300_000 })
}

export function useTask(wid: string, id: string | undefined) {
  return useQuery({ queryKey: qk.task(wid, id ?? ''), queryFn: () => api<Task>(wpath(wid, `/tasks/${id}`)), enabled: !!id })
}

export function useActivity(wid: string, id: string | undefined) {
  return useQuery({ queryKey: qk.activity(wid, id ?? ''), queryFn: () => api<Activity[]>(wpath(wid, `/tasks/${id}/activity`)), enabled: !!id })
}
