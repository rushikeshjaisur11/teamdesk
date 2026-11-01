import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { qk, useProfile } from '@/lib/queries'
import type { Profile } from '@/lib/types'

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
            <TeamsReminders open={open} />
          </dl>
        )}
      </DialogContent>
    </Dialog>
  )
}
