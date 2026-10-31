import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { qk, useWorkspace, wpath } from '@/lib/queries'
import type { AuditEntry } from '@/lib/types'
import { Section } from './SettingsLayout'

const ACTIONS: Record<string, string> = {
  'settings.updated': 'renamed the workspace', 'group_mappings.updated': 'changed group access',
  'roles.updated': 'changed roles', 'template.created': 'added a task type', 'template.updated': 'edited a task type',
  'template.archived': 'removed a task type', 'rule.created': 'added a rule', 'rule.updated': 'edited a rule',
  'rule.deleted': 'deleted a rule', 'rule.fired': 'had a task approved automatically',
  'task.approve': 'approved', 'task.reject': 'rejected', 'task.request_changes': 'asked for changes on',
  'task.duplicate': 'marked as duplicate', 'task.snooze': 'snoozed',
}

function detail(e: AuditEntry) {
  if (e.action.startsWith('task.')) return `#${e.data.number}`
  if (e.action === 'rule.fired') return `#${e.data.number} by "${e.data.rule}"`
  if (e.action.startsWith('template.')) return e.target
  if (e.data.name) return String(e.data.name)
  return ''
}

export function Audit() {
  const { wid } = useWorkspace()
  const log = useQuery({ queryKey: qk.audit(wid), queryFn: () => api<AuditEntry[]>(wpath(wid, '/audit?limit=200')) })
  return (
    <Section title="Audit log" description="Who changed what in this workspace, newest first.">
      {log.isPending ? <Skeleton className="h-40 w-full" /> : log.isError ? (
        <p role="alert" className="text-destructive">{log.error.message}</p>
      ) : !log.data.length ? <p className="text-muted-foreground">Nothing recorded yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-xs text-muted-foreground">
              <tr><th className="py-2 pr-4 font-medium">When</th><th className="py-2 pr-4 font-medium">Who</th><th className="py-2 font-medium">What</th></tr>
            </thead>
            <tbody className="divide-y">
              {log.data.map((e) => (
                <tr key={e.id}>
                  <td className="num py-2 pr-4 whitespace-nowrap text-muted-foreground">{new Date(e.at).toLocaleString()}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{e.actor.name}</td>
                  <td className="py-2">{ACTIONS[e.action] ?? e.action} <span className="text-muted-foreground">{detail(e)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
