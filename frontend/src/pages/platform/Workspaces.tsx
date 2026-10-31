import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { qk } from '@/lib/queries'
import type { PlatformWorkspace } from '@/lib/types'

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
const SLUG = /^[a-z0-9-]{2,40}$/

export function Workspaces() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: qk.platform, queryFn: () => api<PlatformWorkspace[]>('/api/platform/workspaces') })
  const [creating, setCreating] = useState(false)
  const [archiving, setArchiving] = useState<PlatformWorkspace | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [group, setGroup] = useState('')
  const [error, setError] = useState('')

  const after = () => { qc.invalidateQueries({ queryKey: qk.platform }); qc.invalidateQueries({ queryKey: qk.me }) }
  const create = useMutation({
    mutationFn: () => api<PlatformWorkspace>('/api/platform/workspaces', { method: 'POST', json: { name, slug, admin_group: group } }),
    onMutate: () => setError(''),
    onSuccess: (w) => { after(); setCreating(false); setName(''); setSlug(''); setSlugTouched(false); setGroup(''); toast.success(`${w.name} created`) },
    onError: (e) => setError(e.message),
  })
  const archive = useMutation({
    mutationFn: (w: PlatformWorkspace) => api(`/api/platform/workspaces/${w.id}/archive`, { method: 'POST' }),
    onSuccess: () => { after(); setArchiving(null); toast.success('Workspace archived') },
    onError: (e) => toast.error(e.message),
  })

  const active = list.data?.filter((w) => !w.archived) ?? []
  return (
    <main className="mx-auto min-h-dvh w-full max-w-4xl bg-background">
      <PageHeader title="Workspaces">
        <Button variant="ghost" render={<Link to="/" />}>Back to TeamDesk</Button>
        <Button onClick={() => setCreating(true)}><Plus />Create workspace</Button>
      </PageHeader>
      <p className="-mt-2 px-6 pb-4 text-muted-foreground">Each team gets its own workspace. Teams never see each other's tasks or settings.</p>
      {list.isError ? <p role="alert" className="px-6 text-destructive">{list.error.message}</p> : list.data && !active.length ? (
        <EmptyState title="No workspaces yet" body="Create one for a team and choose the group that administers it." />
      ) : (
        <ul className="mx-6 divide-y rounded-lg border bg-card">
          {active.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{w.name}</p>
                <p className="text-muted-foreground">{w.slug}. Admin groups: {w.admin_groups.join(', ') || 'none'}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setArchiving(w)}>Archive</Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>People in the admin group can set up roles, task types and rules.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
            <div className="space-y-1.5">
              <Label htmlFor="pw-name">Name</Label>
              <Input id="pw-name" value={name} required maxLength={100} placeholder="Data Platform"
                onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)) }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-slug">Short name</Label>
              <Input id="pw-slug" value={slug} required aria-invalid={!!slug && !SLUG.test(slug)}
                onChange={(e) => { setSlugTouched(true); setSlug(e.target.value) }} />
              <p className="text-xs text-muted-foreground">Lowercase letters, numbers and dashes.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-group">Admin group</Label>
              <Input id="pw-group" value={group} required placeholder="grp-data-admins" onChange={(e) => setGroup(e.target.value)} />
            </div>
            {error && <p role="alert" className="text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
              <Button type="submit" disabled={!name.trim() || !SLUG.test(slug) || !group.trim() || create.isPending}>Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)}>
        {archiving && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Archive {archiving.name}?</DialogTitle>
              <DialogDescription>Nobody will be able to open it. Its data stays in the database.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setArchiving(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => archive.mutate(archiving)}>Archive workspace</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </main>
  )
}
