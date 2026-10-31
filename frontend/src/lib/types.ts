export type TaskStatus =
  | 'draft' | 'pending_approval' | 'changes_requested' | 'approved' | 'in_jira' | 'jira_failed'
  | 'in_progress' | 'done' | 'rejected' | 'duplicate' | 'snoozed'

export type Person = { sub: string; name: string }

export type Me = {
  user: { sub: string; name: string; email: string; is_platform_owner: boolean }
  workspaces: WorkspaceSummary[]
}
export type WorkspaceSummary = { id: string; name: string; slug: string; roles: string[]; permissions: string[] }

export type Decision = { action: string; by: Person; at: string; reason: string | null }
export type Task = {
  id: string; number: number; type_key: string; title: string; fields: Record<string, string>; labels: string[]
  status: TaskStatus; author: Person & { email: string }; decision: Decision | null; duplicate_of: string | null
  snoozed_until: string | null; jira_key: string | null; created_at: string; updated_at: string; submitted_at: string | null
}
export type SimilarTask = Pick<Task, 'id' | 'number' | 'title' | 'status'>

export type Section = { key: string; label: string; required: boolean; hint: string }
export type Template = { id: string; key: string; name: string; jira_issue_type: string; sections: Section[]; default_labels: string[] }

export type Idea = { id: string; owner_sub: string; text: string; promoted_task_id: string | null; created_at: string }
export type Activity = {
  id: string; task_id: string; at: string; actor: Person
  kind: 'created' | 'edited' | 'submitted' | 'decision' | 'comment' | 'auto_approved'
  data: Record<string, unknown>
}
export type Rule = { id: string; name: string; enabled: boolean; type_keys: string[]; author_roles: string[]; labels_any: string[] }
export type Notification = { id: string; user_sub: string; kind: string; task_id: string; text: string; read: boolean; created_at: string }
export type Member = { sub: string; name: string; email: string; roles: string[] }
export type AuditEntry = { id: string; at: string; actor: Person; action: string; target: string; data: Record<string, unknown> }
export type RoleDef = { name: string; permissions: string[] }
export type GroupMapping = { group: string; role: string }
export type WorkspaceSettings = { name: string; slug: string; group_mappings: GroupMapping[]; roles: Record<string, RoleDef> }
export type PlatformWorkspace = { id: string; name: string; slug: string; archived: boolean; admin_groups: string[] }

export const PERMISSIONS = [
  'task.view', 'task.create', 'task.edit_any', 'task.approve', 'jira.view_all',
  'doc.edit', 'doc.manage_folders', 'settings.manage', 'connections.manage', 'roles.manage',
] as const
