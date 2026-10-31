export type TaskStatus =
  | 'draft' | 'pending_approval' | 'changes_requested' | 'approved' | 'in_jira' | 'jira_failed'
  | 'in_progress' | 'done' | 'rejected' | 'duplicate' | 'snoozed'
