import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { qk, useWorkspace, wpath } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { Section } from './SettingsLayout'

type Mapped = 'in_jira' | 'in_progress' | 'done'
type Jira = {
  kind: 'cloud' | 'datacenter'; base_url: string; email: string; project_key: string; has_token: boolean
  status_map: Record<string, Mapped>; sync_comments: boolean; ai_comments: boolean
}
type Channel = { events: string[]; has_url: boolean }
type Test = { ok: boolean; message: string }

const MAPPED: [Mapped, string][] = [['in_jira', 'In Jira (to do)'], ['in_progress', 'In progress'], ['done', 'Done']]
const EVENTS: [string, string][] = [
  ['approval_needed', 'A task needs approval'], ['decision', 'A task is approved, rejected or sent back'],
  ['comment', 'Someone comments on a task'], ['jira', 'A Jira issue is created or fails'],
]

function Result({ test }: { test: Test | null }) {
  return test && <p role="status" className={test.ok ? 'text-foreground' : 'text-destructive'}>{test.message}</p>
}

function JiraConnection() {
  const { wid } = useWorkspace()
  const qc = useQueryClient()
  const key = ['w', wid, 'connections', 'jira']
  const saved = useQuery({ queryKey: key, queryFn: () => api<Jira | null>(wpath(wid, '/connections/jira')) })
  const [kind, setKind] = useState<Jira['kind']>('cloud')
  const [baseUrl, setBaseUrl] = useState('')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [project, setProject] = useState('')
  const [syncComments, setSyncComments] = useState(true)
  const [aiComments, setAiComments] = useState(true)
  const [statusMap, setStatusMap] = useState<Record<string, Mapped>>({})
  const [test, setTest] = useState<Test | null>(null)
  useEffect(() => {
    const j = saved.data
    if (!j) return
    setKind(j.kind); setBaseUrl(j.base_url); setEmail(j.email); setProject(j.project_key)
    setSyncComments(j.sync_comments ?? true); setAiComments(j.ai_comments ?? true); setStatusMap(j.status_map ?? {})
  }, [saved.data])

  const after = (j: Jira | null) => { qc.setQueryData(key, j); qc.invalidateQueries({ queryKey: qk.me }); setToken(''); setTest(null) }
  const save = useMutation({
    mutationFn: () => api<Jira>(wpath(wid, '/connections/jira'), { method: 'PUT', json: {
      kind, base_url: baseUrl.trim(), email, token, project_key: project.trim().toUpperCase(),
      status_map: statusMap, sync_comments: syncComments, ai_comments: aiComments } }),
    onSuccess: (j) => { after(j); toast.success('Jira settings saved') },
    onError: (e) => toast.error(e.message),
  })
  const check = useMutation({
    mutationFn: () => api<Test>(wpath(wid, '/connections/jira/test'), { method: 'POST' }),
    onSuccess: setTest,
    onError: (e) => setTest({ ok: false, message: e.message }),
  })
  const statuses = useMutation({
    mutationFn: () => api<{ name: string; default: Mapped }[]>(wpath(wid, '/connections/jira/statuses')),
    onError: (e) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: () => api(wpath(wid, '/connections/jira'), { method: 'DELETE' }),
    onSuccess: () => { after(null); setBaseUrl(''); setEmail(''); setProject(''); setStatusMap({}); toast.success('Jira disconnected') },
  })

  const connected = !!saved.data
  const canSave = /^https:\/\/\S+$/.test(baseUrl.trim()) && /^[A-Za-z][A-Za-z0-9_]{1,19}$/.test(project.trim())
    && (kind === 'datacenter' || !!email.trim()) && (connected || !!token)
  const rows = statuses.data ?? Object.keys(statusMap).map((name) => ({ name, default: 'in_jira' as Mapped }))

  return (
    <>
      <Section title="Jira" description={<>
        Each team connects its own Jira. Issues are created by this account. Works with Jira Cloud and Jira Data Center.
        {connected && <span className="mt-2 block text-foreground">Connected to {saved.data!.base_url}</span>}
      </>}>
        <form id="jira-form" className="grid max-w-lg gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          <div className="space-y-1.5">
            <Label>Jira type</Label>
            <div role="radiogroup" aria-label="Jira type" className="inline-flex rounded-md border bg-background p-0.5">
              {([['cloud', 'Cloud'], ['datacenter', 'Data Center']] as const).map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                  className={cn('rounded px-3 py-1 text-muted-foreground', kind === k && 'bg-accent text-foreground')}>{label}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="j-url">Address</Label>
            <Input id="j-url" value={baseUrl} placeholder={kind === 'cloud' ? 'https://yourcompany.atlassian.net' : 'https://jira.yourcompany.com'}
              onChange={(e) => setBaseUrl(e.target.value)} />
          </div>
          {kind === 'cloud' && (
            <div className="space-y-1.5">
              <Label htmlFor="j-email">Account email</Label>
              <Input id="j-email" type="email" value={email} placeholder="jira-bot@yourcompany.com" onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="j-token">{kind === 'cloud' ? 'API token' : 'Personal access token'}</Label>
            <Input id="j-token" type="password" autoComplete="off" value={token}
              placeholder={connected ? 'Saved. Type a new one to replace it.' : ''} onChange={(e) => setToken(e.target.value)} />
            <p className="text-xs text-muted-foreground">Stored encrypted. Never shown again.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="j-project">Default project key</Label>
            <Input id="j-project" value={project} placeholder="DATA" className="w-40 uppercase" onChange={(e) => setProject(e.target.value)} />
            <p className="text-xs text-muted-foreground">A task type can send its issues to another project. Set that under Task types.</p>
          </div>
          <Result test={test} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!canSave || save.isPending}>{connected ? 'Save changes' : 'Connect Jira'}</Button>
            {connected && <Button type="button" variant="outline" disabled={check.isPending} onClick={() => check.mutate()}>
              {check.isPending ? 'Testing' : 'Test connection'}</Button>}
            {connected && <Button type="button" variant="ghost" className="ml-auto" onClick={() => remove.mutate()}>Disconnect</Button>}
          </div>
        </form>
      </Section>

      {connected && (
        <Section title="Jira comments" description="Comments written on a task that has a Jira issue are added to that issue.">
          <div className="grid max-w-lg gap-4">
            <label className="flex items-start justify-between gap-4">
              <span><span className="block font-medium">Copy comments to Jira</span>
                <span className="text-muted-foreground">Each comment is posted with the writer's name.</span></span>
              <Switch checked={syncComments} onCheckedChange={setSyncComments} aria-label="Copy comments to Jira" />
            </label>
            <label className="flex items-start justify-between gap-4">
              <span><span className="block font-medium">Tidy comments with AI</span>
                <span className="text-muted-foreground">Fixes grammar and wording before posting, keeping every fact. Needs AI to be turned on for TeamDesk; otherwise the comment is posted as written.</span></span>
              <Switch checked={aiComments} disabled={!syncComments} onCheckedChange={setAiComments} aria-label="Tidy comments with AI" />
            </label>
            <Button className="self-start" form="jira-form" type="submit" disabled={!canSave || save.isPending}>Save</Button>
          </div>
        </Section>
      )}

      {connected && (
        <Section title="Jira workflow" description="How your team's Jira statuses show in TeamDesk. Checked every 10 minutes. Statuses you don't set follow their Jira category.">
          <div className="grid max-w-lg gap-3">
            {!rows.length && <p className="text-muted-foreground">Load your project's statuses to map them.</p>}
            {rows.map((s) => (
              <div key={s.name} className="flex items-center justify-between gap-4">
                <span className="truncate">{s.name}</span>
                <select aria-label={`TeamDesk status for ${s.name}`} value={statusMap[s.name] ?? ''}
                  className="h-9 rounded-md border border-input bg-background px-2"
                  onChange={(e) => {
                    const next = { ...statusMap }
                    if (e.target.value) next[s.name] = e.target.value as Mapped
                    else delete next[s.name]
                    setStatusMap(next)
                  }}>
                  <option value="">Automatic ({MAPPED.find(([k]) => k === s.default)?.[1]})</option>
                  {MAPPED.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={statuses.isPending} onClick={() => statuses.mutate()}>
                {statuses.isPending ? 'Loading' : 'Load statuses from Jira'}</Button>
              <Button form="jira-form" type="submit" disabled={!canSave || save.isPending}>Save mapping</Button>
            </div>
          </div>
        </Section>
      )}
    </>
  )
}

function TeamsChannel() {
  const { wid } = useWorkspace()
  const qc = useQueryClient()
  const key = ['w', wid, 'connections', 'teams']
  const saved = useQuery({ queryKey: key, queryFn: () => api<Channel | null>(wpath(wid, '/connections/teams')) })
  const [link, setLink] = useState('')
  const [events, setEvents] = useState<string[]>(EVENTS.map(([k]) => k))
  const [test, setTest] = useState<Test | null>(null)
  useEffect(() => { if (saved.data) setEvents(saved.data.events) }, [saved.data])
  const save = useMutation({
    mutationFn: () => api<Channel>(wpath(wid, '/connections/teams'), { method: 'PUT', json: { url: link.trim(), events } }),
    onSuccess: (c) => { qc.setQueryData(key, c); setLink(''); setTest(null); toast.success('Teams channel saved') },
    onError: (e) => setTest({ ok: false, message: e.message }),
  })
  const check = useMutation({
    mutationFn: () => api<Test>(wpath(wid, '/connections/teams/test'), { method: 'POST' }),
    onSuccess: setTest,
    onError: (e) => setTest({ ok: false, message: e.message }),
  })
  const remove = useMutation({
    mutationFn: () => api(wpath(wid, '/connections/teams'), { method: 'DELETE' }),
    onSuccess: () => { qc.setQueryData(key, null); setTest(null); toast.success('Teams disconnected') },
  })
  const connected = !!saved.data

  return (
    <Section title="Microsoft Teams" description={<>
      Posts team updates to a Teams channel. In the channel, open Workflows, choose "Send webhook alerts to a channel", and paste the link it gives you.
      {connected && <span className="mt-2 block text-foreground">Connected</span>}
    </>}>
      <form className="grid max-w-lg gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <div className="space-y-1.5">
          <Label htmlFor="t-url">Workflow link</Label>
          <Input id="t-url" type="url" value={link} placeholder={connected ? 'Saved. Paste a new link to replace it.' : 'https://…logic.azure.com/workflows/…'}
            onChange={(e) => setLink(e.target.value)} />
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1 font-medium">Post when</legend>
          {EVENTS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2">
              <Checkbox checked={events.includes(k)} onCheckedChange={(on) => setEvents(on ? [...events, k] : events.filter((x) => x !== k))} />{label}
            </label>
          ))}
        </fieldset>
        <Result test={test} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={(!connected && !link.trim()) || save.isPending}>{connected ? 'Save changes' : 'Connect Teams'}</Button>
          {connected && <Button type="button" variant="outline" disabled={check.isPending} onClick={() => check.mutate()}>Send a test</Button>}
          {connected && <Button type="button" variant="ghost" className="ml-auto" onClick={() => remove.mutate()}>Disconnect</Button>}
        </div>
      </form>
    </Section>
  )
}

export function Connections() {
  return (
    <>
      <JiraConnection />
      <TeamsChannel />
    </>
  )
}
