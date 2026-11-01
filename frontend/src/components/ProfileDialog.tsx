import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { qk, useProfile } from '@/lib/queries'
import type { Away, Profile } from '@/lib/types'
import { formatDay, localToday } from '@/lib/days'
import { toast } from 'sonner'

function OutOfOffice({ open }: { open: boolean }) {
  const qc = useQueryClient()
  const key = ['me', 'away']
  const saved = useQuery({ queryKey: key, queryFn: () => api<Away | null>('/api/me/away'), enabled: open })
  const backups = useQuery({ queryKey: ['me', 'away', 'backups'], queryFn: () => api<{ sub: string; name: string; workspaces: string[] }[]>('/api/me/away/backups'), enabled: open })
  const [form, setForm] = useState<{ from: string; to: string; backup: string; note: string } | null>(null)
  const save = useMutation({
    mutationFn: () => api<Away>('/api/me/away', { method: 'PUT', json: { from: form!.from, to: form!.to, backup_sub: form!.backup || null, note: form!.note } }),
    onSuccess: (a) => { qc.setQueryData(key, a); setForm(null); toast.success('Out of office saved') },
    onError: (e) => toast.error(e.message),
  })
  const end = useMutation({
    mutationFn: () => api('/api/me/away', { method: 'DELETE' }),
    onSuccess: () => { qc.setQueryData(key, null); qc.invalidateQueries({ queryKey: ['me', 'today'] }) },
  })
  const a = saved.data
  return (
    <div>
      <dt className="font-medium">Out of office</dt>
      <dd className="space-y-2 text-muted-foreground">
        <p>While you're away, approval requests go to your backup instead of you, teammates see when you're back, and your 9:00 Teams summary pauses.</p>
        {form ? (
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-xs">First day away</span>
                <Input type="date" required value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></label>
              <label className="space-y-1"><span className="text-xs">Last day away</span>
                <Input type="date" required min={form.from} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
            </div>
            <label className="space-y-1"><span className="text-xs">Backup for approvals</span>
              <select value={form.backup} onChange={(e) => setForm({ ...form, backup: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-foreground">
                <option value="">No backup: the other approvers are asked</option>
                {backups.data?.map((b) => <option key={b.sub} value={b.sub}>{b.name} ({b.workspaces.join(', ')})</option>)}
              </select></label>
            <Input aria-label="Note for teammates" placeholder="Note for teammates (optional)" maxLength={200} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={!form.from || !form.to || save.isPending}>Save</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
            </div>
          </form>
        ) : a ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-foreground">Away {formatDay(a.from)} to {formatDay(a.to)}{a.backup_name && `, backup ${a.backup_name}`}</span>
            <Button variant="outline" size="sm" onClick={() => setForm({ from: a.from, to: a.to, backup: a.backup_sub ?? '', note: a.note })}>Change</Button>
            <Button variant="ghost" size="sm" onClick={() => end.mutate()}>I'm back</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setForm({ from: localToday(), to: localToday(), backup: '', note: '' })}>Set out of office</Button>
        )}
      </dd>
    </div>
  )
}

function TeamsReminders({ open }: { open: boolean }) {
  const qc = useQueryClient()
  const key = ['me', 'teams']
  const state = useQuery({ queryKey: key, queryFn: () => api<{ connected: boolean }>('/api/me/teams'), enabled: open })
  const [link, setLink] = useState('')
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const save = useMutation({
    mutationFn: () => api<{ connected: boolean }>('/api/me/teams', { method: 'PUT', json: { url: link.trim() } }),
    onSuccess: (r) => { qc.setQueryData(key, r); setLink(''); setResult(null) },
    onError: (e) => setResult({ ok: false, message: e.message }),
  })
  const test = useMutation({
    mutationFn: () => api<{ ok: boolean; message: string }>('/api/me/teams/test', { method: 'POST' }),
    onSuccess: setResult,
    onError: (e) => setResult({ ok: false, message: e.message }),
  })
  const remove = useMutation({
    mutationFn: () => api('/api/me/teams', { method: 'DELETE' }),
    onSuccess: () => { qc.setQueryData(key, { connected: false }); setResult(null) },
  })
  return (
    <div>
      <dt className="font-medium">Teams reminders</dt>
      <dd className="space-y-2 text-muted-foreground">
        <p>Get your reminders, follow-ups and a 9:00 summary of your day in a Teams chat. In Teams, open Workflows, pick
          "Send webhook alerts to a chat", choose yourself, and paste the link it gives you here.</p>
        {state.data?.connected ? (
          <div className="flex flex-wrap gap-2">
            <span className="mr-auto self-center text-foreground">Connected</span>
            <Button variant="outline" size="sm" disabled={test.isPending} onClick={() => test.mutate()}>Send a test</Button>
            <Button variant="ghost" size="sm" onClick={() => remove.mutate()}>Disconnect</Button>
          </div>
        ) : (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
            <Input aria-label="Teams workflow link" type="url" placeholder="https://…logic.azure.com/workflows/…" value={link} onChange={(e) => setLink(e.target.value)} />
            <Button type="submit" size="sm" className="h-9" disabled={!link.trim() || save.isPending}>Connect</Button>
          </form>
        )}
        {result && <p role="status" className={result.ok ? 'text-foreground' : 'text-destructive'}>{result.message}</p>}
      </dd>
    </div>
  )
}

export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const profile = useProfile()
  const save = useMutation({
    mutationFn: (use_ai: boolean) => api<Profile>('/api/me/profile', { method: 'PATCH', json: { use_ai } }),
    onSuccess: (p) => qc.setQueryData(qk.profile, p),
  })
  const feed = useQuery({ queryKey: ['me', 'calendar'], queryFn: () => api<{ enabled: boolean }>('/api/me/calendar'), enabled: open })
  const [url, setUrl] = useState('')
  const reset = useMutation({
    mutationFn: () => api<{ url: string }>('/api/me/calendar/reset', { method: 'POST' }),
    onSuccess: (r) => { setUrl(r.url); qc.invalidateQueries({ queryKey: ['me', 'calendar'] }) },
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>My settings</DialogTitle>
          <DialogDescription>Only you can see your Today, Inbox, tasks, waiting items and notes. Nobody else can, admins included.</DialogDescription>
        </DialogHeader>
        {profile.data && (
          <dl className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <dt className="font-medium">Use AI on my space</dt>
                <dd className="text-muted-foreground">Lets AI read your own items to parse captures, write your morning brief and draft your standup. Nothing goes to other people.</dd>
              </div>
              <Switch aria-label="Use AI on my space" checked={profile.data.use_ai} onCheckedChange={(on) => save.mutate(on)} />
            </div>
            <div>
              <dt className="font-medium">Time zone</dt>
              <dd className="text-muted-foreground">{profile.data.tz}, taken from this browser. It decides when your day starts.</dd>
            </div>
            <div>
              <dt className="font-medium">Calendar link</dt>
              <dd className="space-y-2 text-muted-foreground">
                <p>Shows the titles of your dated items and reminders in Outlook or Google Calendar. Never notes. Anyone with the link can see those titles, so reset it if it leaks.</p>
                {url && <Input readOnly aria-label="Calendar link" value={url} onFocus={(e) => e.currentTarget.select()} />}
                <Button variant="outline" size="sm" disabled={reset.isPending} onClick={() => reset.mutate()}>
                  {feed.data?.enabled || url ? 'Reset link' : 'Create link'}
                </Button>
              </dd>
            </div>
            <OutOfOffice open={open} />
            <TeamsReminders open={open} />
          </dl>
        )}
      </DialogContent>
    </Dialog>
  )
}
