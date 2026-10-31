import { useEffect, useState } from 'react'
import { Checklist } from '@/components/Checklist'
import { RecurrencePicker } from '@/components/RecurrencePicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useItemActions } from '@/lib/itemActions'
import { PRESETS, presetTime, toLocalInput } from '@/lib/remind'
import type { Item } from '@/lib/types'

/** Edit one personal task: title, notes, due date, steps, repeat, labels. */
export function ItemSheet({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const act = useItemActions()
  const [draft, setDraft] = useState<Item | null>(item)
  useEffect(() => setDraft(item), [item])
  if (!draft) return null
  const set = (patch: Partial<Item>) => setDraft({ ...draft, ...patch })
  const save = async () => {
    await act.update(draft, {
      title: draft.title, notes: draft.notes, due_on: draft.due_on || null, remind_at: draft.remind_at, checklist: draft.checklist, labels: draft.labels,
      ...(draft.kind === 'task' ? { recurrence: draft.recurrence } : {}),
    })
    onClose()
  }
  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>{draft.kind === 'waiting' ? 'Waiting on' : 'My task'}</SheetTitle></SheetHeader>
        <form className="space-y-5 px-4 pb-6" onSubmit={(e) => { e.preventDefault(); save() }}>
          <div className="space-y-1.5">
            <Label htmlFor="it-title">Title</Label>
            <Input id="it-title" value={draft.title} maxLength={500} required onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="it-due">Due</Label>
            <Input id="it-due" type="date" className="w-44" value={draft.due_on ?? ''} onChange={(e) => set({ due_on: e.target.value || null })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="it-remind">Remind me</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input id="it-remind" type="datetime-local" className="w-56" value={toLocalInput(draft.remind_at)}
                onChange={(e) => set({ remind_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              {PRESETS.map((p) => (
                <Button key={p.key} type="button" variant="outline" size="sm" onClick={() => set({ remind_at: presetTime(p.key).toISOString() })}>{p.label}</Button>
              ))}
              {draft.remind_at && <Button type="button" variant="ghost" size="sm" onClick={() => set({ remind_at: null })}>Clear</Button>}
            </div>
          </div>
          {draft.kind === 'task' && <RecurrencePicker value={draft.recurrence} onChange={(recurrence) => set({ recurrence })} />}
          <div className="space-y-1.5">
            <p className="font-medium">Steps</p>
            <Checklist items={draft.checklist} onChange={(checklist) => set({ checklist })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="it-notes">Notes</Label>
            <Textarea id="it-notes" rows={6} maxLength={20000} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="it-labels">Labels</Label>
            <Input id="it-labels" value={draft.labels.join(', ')} placeholder="vendor, finance"
              onChange={(e) => set({ labels: e.target.value.split(/[,\s]+/).filter(Boolean) })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!draft.title.trim()}>Save</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
