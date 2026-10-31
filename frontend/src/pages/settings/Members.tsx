import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { qk, useWorkspace, wpath } from '@/lib/queries'
import { PERMISSIONS, type GroupMapping, type Member, type RoleDef, type WorkspaceSettings } from '@/lib/types'
import { Section } from './SettingsLayout'

const PERM_LABELS: Record<string, string> = {
  'task.view': 'See tasks', 'task.create': 'Create tasks', 'task.edit_any': "Edit anyone's tasks",
  'task.approve': 'Approve tasks', 'jira.view_all': 'See all Jira tickets', 'doc.edit': 'Edit docs',
  'doc.manage_folders': 'Manage doc folders', 'settings.manage': 'Manage settings',
  'connections.manage': 'Manage connections', 'roles.manage': 'Manage roles and access',
}
export const selectClass = 'h-8 rounded-md border border-input bg-background px-2 focus-visible:outline-2'

function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
}

export function Members() {
  const { wid, can } = useWorkspace()
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: qk.settings(wid), queryFn: () => api<WorkspaceSettings>(wpath(wid, '/settings')) })
  const members = useQuery({ queryKey: qk.members(wid), queryFn: () => api<Member[]>(wpath(wid, '/members')) })
  const [maps, setMaps] = useState<GroupMapping[]>([])
  const [roles, setRoles] = useState<Record<string, RoleDef>>({})
  const [mapError, setMapError] = useState('')
  const [roleError, setRoleError] = useState('')
  const [newRole, setNewRole] = useState('')
  const editable = can('roles.manage')

  useEffect(() => {
    if (!settings.data) return
    setMaps(settings.data.group_mappings)
    setRoles(settings.data.roles)
  }, [settings.data])

  const mapsDirty = JSON.stringify(maps) !== JSON.stringify(settings.data?.group_mappings ?? [])
  const rolesDirty = JSON.stringify(roles) !== JSON.stringify(settings.data?.roles ?? {})
  useUnsavedWarning(mapsDirty || rolesDirty)

  const after = () => { qc.invalidateQueries({ queryKey: qk.settings(wid) }); qc.invalidateQueries({ queryKey: qk.me }); qc.invalidateQueries({ queryKey: qk.members(wid) }) }
  const saveMaps = useMutation({
    mutationFn: () => api(wpath(wid, '/group-mappings'), { method: 'PUT', json: maps.filter((m) => m.group.trim()) }),
    onMutate: () => setMapError(''),
    onSuccess: () => { after(); toast.success('Group access saved') },
    onError: (e) => setMapError(e.message),
  })
  const saveRoles = useMutation({
    mutationFn: () => api(wpath(wid, '/roles'), { method: 'PUT', json: roles }),
    onMutate: () => setRoleError(''),
    onSuccess: () => { after(); toast.success('Roles saved') },
    onError: (e) => setRoleError(e.message),
  })

  if (settings.isError) return <p role="alert" className="text-destructive">{settings.error.message}</p>
  if (!settings.data) return null
  const roleKeys = Object.keys(roles)

  return (
    <>
      <Section title="Group access" description="People get access through their company groups. Map each group to a role.">
        <div className="space-y-2">
          {maps.map((m, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input aria-label={`Group name ${i + 1}`} value={m.group} disabled={!editable} className="max-w-xs flex-1" placeholder="grp-data-eng"
                onChange={(e) => setMaps(maps.map((x, j) => (j === i ? { ...x, group: e.target.value } : x)))} />
              <select aria-label={`Role for ${m.group || `group ${i + 1}`}`} value={m.role} disabled={!editable} className={selectClass}
                onChange={(e) => setMaps(maps.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}>
                {roleKeys.map((k) => <option key={k} value={k}>{roles[k].name}</option>)}
              </select>
              {editable && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.group || 'group'}`} onClick={() => setMaps(maps.filter((_, j) => j !== i))}><Trash2 /></Button>}
            </div>
          ))}
        </div>
        {mapError && <p role="alert" className="mt-3 text-destructive">{mapError}</p>}
        {editable && (
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => setMaps([...maps, { group: '', role: roleKeys.includes('member') ? 'member' : roleKeys[0] }])}><Plus />Add group</Button>
            <Button onClick={() => saveMaps.mutate()} disabled={!mapsDirty || saveMaps.isPending}>Save groups</Button>
          </div>
        )}
      </Section>

      <Section title="People" description="Everyone who has opened this workspace, with the roles their groups give them.">
        {!members.data?.length ? <p className="text-muted-foreground">Nobody has opened this workspace yet.</p> : (
          <ul className="divide-y">
            {members.data.map((p) => (
              <li key={p.sub} className="flex flex-wrap items-center gap-x-4 py-2">
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">{p.email}</span>
                <span className="ml-auto text-muted-foreground">{p.roles.map((r) => roles[r]?.name ?? r).join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Roles" description="What each role can do in this workspace.">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="py-2 pr-4 font-medium text-muted-foreground">Permission</th>
                {roleKeys.map((k) => (
                  <th key={k} className="px-2 py-2 text-center font-medium">
                    <Input aria-label={`Name of role ${k}`} value={roles[k].name} disabled={!editable} className="h-7 w-28 text-center"
                      onChange={(e) => setRoles({ ...roles, [k]: { ...roles[k], name: e.target.value } })} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {PERMISSIONS.map((p) => (
                <tr key={p}>
                  <td className="py-2 pr-4">{PERM_LABELS[p]}</td>
                  {roleKeys.map((k) => (
                    <td key={k} className="px-2 py-2 text-center">
                      <Checkbox aria-label={`${roles[k].name}: ${PERM_LABELS[p]}`} disabled={!editable} checked={roles[k].permissions.includes(p)}
                        onCheckedChange={(on) => setRoles({ ...roles, [k]: { ...roles[k], permissions: on ? [...roles[k].permissions, p] : roles[k].permissions.filter((x) => x !== p) } })} />
                    </td>
                  ))}
                </tr>
              ))}
              {editable && (
                <tr>
                  <td />
                  {roleKeys.map((k) => (
                    <td key={k} className="px-2 py-2 text-center">
                      <Button variant="ghost" size="xs" onClick={() => { const { [k]: _, ...rest } = roles; setRoles(rest) }}>Delete</Button>
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {roleError && <p role="alert" className="mt-3 text-destructive">{roleError}</p>}
        {editable && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Input aria-label="New role key" placeholder="new-role" value={newRole} className="w-40"
              onChange={(e) => setNewRole(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} />
            <Button variant="outline" disabled={newRole.length < 2 || newRole in roles}
              onClick={() => { setRoles({ ...roles, [newRole]: { name: newRole, permissions: ['task.view'] } }); setNewRole('') }}><Plus />Add role</Button>
            <Button onClick={() => saveRoles.mutate()} disabled={!rolesDirty || saveRoles.isPending}>Save roles</Button>
          </div>
        )}
      </Section>
    </>
  )
}
