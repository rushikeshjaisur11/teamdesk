import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { qk, useTemplates, useWorkspace, wpath } from '@/lib/queries'
import type { Section as Sec, Template } from '@/lib/types'
import { Section } from './SettingsLayout'

type Draft = Omit<Template, 'id'> & { isNew: boolean; extraText: string }
const toKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30)

export function Templates() {
  const { wid } = useWorkspace()
  const qc = useQueryClient()
  const templates = useTemplates(wid)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const edit = (t: Omit<Template, 'id'>, isNew: boolean) => setDraft({
    ...t, isNew, jira_project_key: t.jira_project_key ?? '',
    extraText: t.jira_extra_fields && Object.keys(t.jira_extra_fields).length ? JSON.stringify(t.jira_extra_fields, null, 2) : '' })

  const save = useMutation({
    mutationFn: (d: Draft) => {
      let extra: Record<string, unknown>
      try { extra = d.extraText.trim() ? JSON.parse(d.extraText) : {} } catch { throw new Error('Extra Jira fields must be valid JSON, for example {"components": [{"name": "ETL"}]}.') }
      const body = { name: d.name, jira_issue_type: d.jira_issue_type, default_labels: d.default_labels,
        jira_project_key: (d.jira_project_key ?? '').trim().toUpperCase(), jira_extra_fields: extra,
        sections: d.sections.map((s) => ({ ...s, key: s.key || toKey(s.label), jira_field: (s.jira_field ?? '').trim() })) }
      return d.isNew
        ? api(wpath(wid, '/templates'), { method: 'POST', json: { ...body, key: d.key } })
        : api(wpath(wid, `/templates/${d.key}`), { method: 'PUT', json: body })
    },
    onMutate: () => setError(''),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.templates(wid) }); setDraft(null); toast.success('Task type saved') },
    onError: (e) => setError(e.message),
  })
  const archive = useMutation({
    mutationFn: (key: string) => api(wpath(wid, `/templates/${key}`), { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.templates(wid) }); toast.success('Task type removed') },
    onError: (e) => toast.error(e.message),
  })

  const setSection = (i: number, s: Partial<Sec>) => draft && setDraft({ ...draft, sections: draft.sections.map((x, j) => (j === i ? { ...x, ...s } : x)) })
  const move = (i: number, by: number) => {
    if (!draft) return
    const s = [...draft.sections]
    ;[s[i], s[i + by]] = [s[i + by], s[i]]
    setDraft({ ...draft, sections: s })
  }

  return (
    <Section
      title="Task types"
      description="Each type is a ticket template: the sections people fill in and the Jira issue type it becomes."
      actions={<Button variant="outline" onClick={() => edit({ key: '', name: '', jira_issue_type: 'Task', default_labels: [], sections: [{ key: '', label: 'Context', required: true, hint: '' }] }, true)}><Plus />Add type</Button>}
    >
      <ul className="divide-y">
        {templates.data?.map((t) => (
          <li key={t.key} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.name}</p>
              <p className="text-muted-foreground">Jira {t.jira_issue_type}{t.jira_project_key ? ` in ${t.jira_project_key}` : ''}. {t.sections.map((s) => s.label).join(', ')}.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => edit(t, false)}>Edit</Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${t.name}`} onClick={() => archive.mutate(t.key)}><Trash2 /></Button>
          </li>
        ))}
      </ul>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        {draft && (
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader><DialogTitle>{draft.isNew ? 'New task type' : `Edit ${draft.name}`}</DialogTitle></DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Name</Label>
                <Input id="tpl-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value, key: draft.isNew ? toKey(e.target.value) : draft.key })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-jira">Jira issue type</Label>
                <Input id="tpl-jira" value={draft.jira_issue_type} onChange={(e) => setDraft({ ...draft, jira_issue_type: e.target.value })} />
              </div>
            </div>
            <fieldset className="space-y-3">
              <legend className="mb-2 font-medium">Sections</legend>
              {draft.sections.map((s, i) => (
                <div key={i} className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input aria-label={`Section ${i + 1} label`} value={s.label} className="max-w-56 flex-1"
                      onChange={(e) => setSection(i, { label: e.target.value, key: draft.isNew || !s.key ? toKey(e.target.value) : s.key })} />
                    <label className="flex items-center gap-2"><Checkbox checked={s.required} onCheckedChange={(on) => setSection(i, { required: !!on })} />Required</label>
                    <div className="ml-auto flex">
                      <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === draft.sections.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove section ${s.label}`} disabled={draft.sections.length === 1}
                        onClick={() => setDraft({ ...draft, sections: draft.sections.filter((_, j) => j !== i) })}><Trash2 /></Button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_14rem]">
                    <Input aria-label={`Section ${i + 1} hint`} placeholder="Hint shown to the author" value={s.hint} onChange={(e) => setSection(i, { hint: e.target.value })} />
                    <Input aria-label={`Section ${i + 1} Jira field`} placeholder="Jira field (empty: description)" value={s.jira_field ?? ''}
                      onChange={(e) => setSection(i, { jira_field: e.target.value })} />
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setDraft({ ...draft, sections: [...draft.sections, { key: '', label: '', required: false, hint: '' }] })}><Plus />Add section</Button>
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-labels">Default labels</Label>
              <Input id="tpl-labels" value={draft.default_labels.join(', ')} placeholder="feature"
                onChange={(e) => setDraft({ ...draft, default_labels: e.target.value.split(/[,\s]+/).filter(Boolean) })} />
            </div>
            <fieldset className="grid gap-4 rounded-md border p-3">
              <legend className="px-1 font-medium">Jira for this type</legend>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-project">Project key</Label>
                <Input id="tpl-project" className="w-40 uppercase" placeholder="Default" value={draft.jira_project_key ?? ''}
                  onChange={(e) => setDraft({ ...draft, jira_project_key: e.target.value })} />
                <p className="text-xs text-muted-foreground">Leave empty to use the project from Settings → Connections.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-extra">Extra Jira fields (JSON)</Label>
                <Textarea id="tpl-extra" rows={4} className="font-mono text-xs" value={draft.extraText}
                  placeholder={'{\n  "components": [{ "name": "ETL" }],\n  "customfield_10010": "Team Data"\n}'}
                  onChange={(e) => setDraft({ ...draft, extraText: e.target.value })} />
                <p className="text-xs text-muted-foreground">Sent with every issue of this type: components, priority, required custom fields. See the setup guide for how to find field ids.</p>
              </div>
            </fieldset>
            {error && <p role="alert" className="text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
              <Button onClick={() => save.mutate(draft)} disabled={!draft.name.trim() || save.isPending}>Save task type</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Section>
  )
}
