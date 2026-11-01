import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { qk, useWorkspace, wpath } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { Section } from './SettingsLayout'

type Jira = { kind: 'cloud' | 'datacenter'; base_url: string; email: string; project_key: string; has_token: boolean }
type Test = { ok: boolean; message: string }

export function Connections() {
  const { wid } = useWorkspace()
  const qc = useQueryClient()
  const key = ['w', wid, 'connections', 'jira']
  const saved = useQuery({ queryKey: key, queryFn: () => api<Jira | null>(wpath(wid, '/connections/jira')) })
  const [kind, setKind] = useState<Jira['kind']>('cloud')
  const [baseUrl, setBaseUrl] = useState('')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [project, setProject] = useState('')
  const [test, setTest] = useState<Test | null>(null)
  useEffect(() => {
    if (!saved.data) return
    setKind(saved.data.kind); setBaseUrl(saved.data.base_url); setEmail(saved.data.email); setProject(saved.data.project_key)
  }, [saved.data])

  const after = (j: Jira | null) => { qc.setQueryData(key, j); qc.invalidateQueries({ queryKey: qk.me }); setToken(''); setTest(null) }
  const save = useMutation({
    mutationFn: () => api<Jira>(wpath(wid, '/connections/jira'), { method: 'PUT', json: { kind, base_url: baseUrl.trim(), email, token, project_key: project.trim().toUpperCase() } }),
    onSuccess: (j) => { after(j); toast.success('Jira connection saved') },
    onError: (e) => toast.error(e.message),
  })
  const check = useMutation({
    mutationFn: () => api<Test>(wpath(wid, '/connections/jira/test'), { method: 'POST' }),
    onSuccess: setTest,
    onError: (e) => setTest({ ok: false, message: e.message }),
  })
  const remove = useMutation({
    mutationFn: () => api(wpath(wid, '/connections/jira'), { method: 'DELETE' }),
    onSuccess: () => { after(null); setBaseUrl(''); setEmail(''); setProject(''); toast.success('Jira disconnected') },
  })

  const connected = !!saved.data
  const canSave = /^https:\/\/\S+$/.test(baseUrl.trim()) && /^[A-Za-z][A-Za-z0-9_]{1,19}$/.test(project.trim())
    && (kind === 'datacenter' || !!email.trim()) && (connected || !!token)

  return (
    <Section title="Jira" description={<>
      Tickets are created by this account. Works with Jira Cloud and Jira Data Center.
      {connected && <span className="mt-2 block text-foreground">Connected to {saved.data!.base_url}</span>}
    </>}>
      <form className="grid max-w-lg gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
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
          <Label htmlFor="j-project">Project key</Label>
          <Input id="j-project" value={project} placeholder="DATA" className="w-40 uppercase" onChange={(e) => setProject(e.target.value)} />
        </div>
        {test && <p role="status" className={test.ok ? 'text-foreground' : 'text-destructive'}>{test.message}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!canSave || save.isPending}>{connected ? 'Save changes' : 'Connect Jira'}</Button>
          {connected && <Button type="button" variant="outline" disabled={check.isPending} onClick={() => check.mutate()}>
            {check.isPending ? 'Testing' : 'Test connection'}</Button>}
          {connected && <Button type="button" variant="ghost" className="ml-auto" onClick={() => remove.mutate()}>Disconnect</Button>}
        </div>
      </form>
    </Section>
  )
}
