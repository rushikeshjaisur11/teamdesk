import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { qk, useProfile } from '@/lib/queries'
import type { Profile } from '@/lib/types'

export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const profile = useProfile()
  const save = useMutation({
    mutationFn: (use_ai: boolean) => api<Profile>('/api/me/profile', { method: 'PATCH', json: { use_ai } }),
    onSuccess: (p) => qc.setQueryData(qk.profile, p),
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
          </dl>
        )}
      </DialogContent>
    </Dialog>
  )
}
