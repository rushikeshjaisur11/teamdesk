import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { qk, useTemplates, useWorkspace, wpath } from '@/lib/queries'
import type { Section as Sec, Template } from '@/lib/types'
import { Section } from './SettingsLayout'

type Draft = Omit<Template, 'id'> & { isNew: boolean }
const toKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30)

export function Templates() {
  const { wid } = useWorkspace()
  const qc = useQueryClient()
  const templates = useTemplates(wid)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body = { name: d.name, jira_issue_type: d.jira_issue_type, default_labels: d.default_labels,
        sections: d.sections.map((s) => ({ ...s, key: s.key || toKey(s.label) })) }
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
      actions={<Button variant="outline" onClick={() => setDraft({ isNew: true, key: '', name: '', jira_issue_type: 'Task', default_labels: [], sections: [{ key: '', label: 'Context', required: true, hint: '' }] })}><Plus />Add type</Button>}
    >
      <ul className="divide-y">
        {templates.data?.map((t) => (
          <li key={t.key} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.name}</p>
              <p className="text-muted-foreground">Jira {t.jira_issue_type}. {t.sections.map((s) => s.label).join(', ')}.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDraft({ ...t, isNew: false })}>Edit</Button>
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
                  <Input aria-label={`Section ${i + 1} hint`} placeholder="Hint shown to the author" value={s.hint} onChange={(e) => setSection(i, { hint: e.target.value })} />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setDraft({ ...draft, sections: [...draft.sections, { key: '', label: '', required: false, hint: '' }] })}><Plus />Add section</Button>
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-labels">Default labels</Label>
              <Input id="tpl-labels" value={draft.default_labels.join(', ')} placeholder="feature"
                onChange={(e) => setDraft({ ...draft, default_labels: e.target.value.split(/[,\s]+/).filter(Boolean) })} />
            </div>
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
