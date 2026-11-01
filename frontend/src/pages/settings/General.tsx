import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { qk, useWorkspace, wpath } from '@/lib/queries'
import type { WorkspaceSettings } from '@/lib/types'
import { Section } from './SettingsLayout'

export function General() {
  const { wid } = useWorkspace()
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: qk.settings(wid), queryFn: () => api<WorkspaceSettings>(wpath(wid, '/settings')) })
  const [name, setName] = useState('')
  useEffect(() => { if (settings.data) setName(settings.data.name) }, [settings.data])
  const save = useMutation({
    mutationFn: () => api<WorkspaceSettings>(wpath(wid, '/settings'), { method: 'PATCH', json: { name } }),
    onSuccess: (s) => { qc.setQueryData(qk.settings(wid), s); qc.invalidateQueries({ queryKey: qk.me }); toast.success('Workspace renamed') },
    onError: (e) => toast.error(e.message),
  })

  return (
    <>
      <Section title="Workspace">
        <form className="flex max-w-md flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">Name</Label>
            <Input id="ws-name" value={name} maxLength={100} required onChange={(e) => setName(e.target.value)} />
            {settings.data && <p className="text-xs text-muted-foreground">Short name: {settings.data.slug}</p>}
          </div>
          <Button type="submit" className="self-start" disabled={!name.trim() || name === settings.data?.name || save.isPending}>Save</Button>
        </form>
      </Section>
    </>
  )
}
