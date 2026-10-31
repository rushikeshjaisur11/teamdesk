import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { qk, useTemplates, useWorkspace, wpath } from '@/lib/queries'
import type { RoleDef, Rule, Template, WorkspaceSettings } from '@/lib/types'
import { Section } from './SettingsLayout'

type Conditions = Pick<Rule, 'type_keys' | 'author_roles' | 'labels_any'>
const plural = (s: string) => (s.endsWith('s') ? s : `${s}s`)
const either = (xs: string[]) => xs.join(' or ')

export function describeRule(r: Conditions, templates: Template[], roles: Record<string, RoleDef>) {
  if (!r.type_keys.length && !r.author_roles.length && !r.labels_any.length) return 'Pick at least one condition.'
  const types = r.type_keys.map((k) => templates.find((t) => t.key === k)?.name ?? k)
  let text = types.length ? `${either(types)} tasks` : 'Tasks'
  if (r.author_roles.length) text += ` by ${either(r.author_roles.map((k) => plural(roles[k]?.name ?? k)))}`
  if (r.labels_any.length) text += ` labelled ${either(r.labels_any)}`
  return `${text} are approved automatically.`
}

type Draft = Omit<Rule, 'id'> & { id?: string }

export function Rules() {
  const { wid } = useWorkspace()
  const qc = useQueryClient()
  const templates = useTemplates(wid)
  const settings = useQuery({ queryKey: qk.settings(wid), queryFn: () => api<WorkspaceSettings>(wpath(wid, '/settings')) })
  const rules = useQuery({ queryKey: qk.rules(wid), queryFn: () => api<Rule[]>(wpath(wid, '/rules')) })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const roles = settings.data?.roles ?? {}
  const tpls = templates.data ?? []

  const save = useMutation({
    mutationFn: ({ id, ...body }: Draft) => id
      ? api(wpath(wid, `/rules/${id}`), { method: 'PUT', json: body })
      : api(wpath(wid, '/rules'), { method: 'POST', json: body }),
    onMutate: () => setError(''),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.rules(wid) }); setDraft(null); toast.success('Rule saved') },
    onError: (e) => { setError(e.message); toast.error(e.message) },
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(wpath(wid, `/rules/${id}`), { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.rules(wid) }); toast.success('Rule deleted') },
  })

  const toggle = (list: string[], v: string, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v))

  return (
    <Section
      title="Auto-approve rules"
      description="Tasks that match an enabled rule skip the approval queue and are approved as soon as they're submitted."
      actions={<Button variant="outline" onClick={() => setDraft({ name: '', enabled: true, type_keys: [], author_roles: [], labels_any: [] })}><Plus />Add rule</Button>}
    >
      {!rules.data?.length ? <p className="text-muted-foreground">No rules. Every submitted task waits for an approver.</p> : (
        <ul className="divide-y">
          {rules.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
              <Switch aria-label={`${r.name} enabled`} checked={r.enabled}
                onCheckedChange={(on) => save.mutate({ ...r, enabled: on })} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.name}</p>
                <p className="text-muted-foreground">{describeRule(r, tpls, roles)}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setDraft(r)}>Edit</Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${r.name}`} onClick={() => remove.mutate(r.id)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        {draft && (
          <DialogContent className="sm:max-w-xl">
            <DialogHeader><DialogTitle>{draft.id ? 'Edit rule' : 'New rule'}</DialogTitle></DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="rule-name">Name</Label>
              <Input id="rule-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <fieldset>
              <legend className="mb-2 font-medium">Task types <span className="font-normal text-muted-foreground">(any if none picked)</span></legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {tpls.map((t) => (
                  <label key={t.key} className="flex items-center gap-2">
                    <Checkbox checked={draft.type_keys.includes(t.key)} onCheckedChange={(on) => setDraft({ ...draft, type_keys: toggle(draft.type_keys, t.key, !!on) })} />{t.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 font-medium">Author's role <span className="font-normal text-muted-foreground">(any if none picked)</span></legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {Object.entries(roles).map(([k, r]) => (
                  <label key={k} className="flex items-center gap-2">
                    <Checkbox checked={draft.author_roles.includes(k)} onCheckedChange={(on) => setDraft({ ...draft, author_roles: toggle(draft.author_roles, k, !!on) })} />{r.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor="rule-labels">Labels <span className="font-normal text-muted-foreground">(any of these)</span></Label>
              <Input id="rule-labels" value={draft.labels_any.join(', ')} placeholder="deps, chore"
                onChange={(e) => setDraft({ ...draft, labels_any: e.target.value.split(/[,\s]+/).filter(Boolean) })} />
            </div>
            <p className="rounded-md bg-muted px-3 py-2">{describeRule(draft, tpls, roles)}</p>
            <label className="flex items-center gap-2"><Switch checked={draft.enabled} onCheckedChange={(on) => setDraft({ ...draft, enabled: on })} />Enabled</label>
            {error && <p role="alert" className="text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
              <Button onClick={() => save.mutate(draft)} disabled={!draft.name.trim() || save.isPending}>Save rule</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Section>
  )
}
