import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api, ApiError } from '@/lib/api'
import { qk, wpath } from '@/lib/queries'
import type { SimilarTask, Task, Template } from '@/lib/types'
import { useDebounced } from '@/lib/useDebounced'
import { cn } from '@/lib/utils'

type Props = {
  wid: string
  templates: Template[]
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: Task
  prefill?: { title?: string; fromItem?: string }
  onSaved?: (task: Task) => void
}

export function savedMessage(t: Task) {
  if (t.status === 'approved') return `#${t.number} was approved automatically`
  if (t.status === 'pending_approval') return `#${t.number} sent for approval`
  return `Draft #${t.number} saved`
}

export function TaskForm({ wid, templates, open, onOpenChange, task, prefill, onSaved }: Props) {
  const qc = useQueryClient()
  const [typeKey, setTypeKey] = useState(task?.type_key ?? templates[0]?.key ?? '')
  const [title, setTitle] = useState(task?.title ?? prefill?.title ?? '')
  const [fields, setFields] = useState<Record<string, string>>(task?.fields ?? {})
  const [labels, setLabels] = useState((task?.labels ?? []).join(', '))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const template = templates.find((t) => t.key === typeKey)

  useEffect(() => {
    if (!open) return
    setTypeKey(task?.type_key ?? templates[0]?.key ?? '')
    setTitle(task?.title ?? prefill?.title ?? '')
    setFields(task?.fields ?? {})
    setLabels((task?.labels ?? []).join(', '))
    setErrors({}); setFormError('')
  }, [open, task, prefill?.title, templates])

  const similarText = useDebounced(task ? '' : title.trim(), 400)
  const similar = useQuery({
    queryKey: qk.similar(wid, similarText),
    queryFn: () => api<SimilarTask[]>(wpath(wid, `/tasks/similar?text=${encodeURIComponent(similarText)}`)),
    enabled: open && similarText.length >= 3,
  })

  const save = useMutation({
    mutationFn: (submit: boolean) => {
      const filled = Object.fromEntries(Object.entries(fields).filter(([k, v]) =>
        v.trim() && template?.sections.some((s) => s.key === k)))
      const labelList = labels.split(/[,\s]+/).filter(Boolean)
      if (task) {
        return api<Task>(wpath(wid, `/tasks/${task.id}`), { method: 'PATCH', json: { type_key: typeKey, title, fields: filled, labels: labelList } })
      }
      return api<Task>(wpath(wid, '/tasks'), {
        method: 'POST',
        json: { type_key: typeKey, title, fields: filled, labels: labelList.length ? labelList : undefined, submit, from_item_id: prefill?.fromItem },
      })
    },
    onMutate: () => {
      setErrors({}); setFormError('')
      if (!task) return undefined
      // Optimistic edit: show the new title/labels right away, roll back if the server refuses.
      const previous = qc.getQueryData<Task>(qk.task(wid, task.id))
      qc.setQueryData<Task>(qk.task(wid, task.id), { ...task, type_key: typeKey, title, fields, labels: labels.split(/[,\s]+/).filter(Boolean) })
      return { previous }
    },
    onSuccess: (saved) => {
      qc.setQueryData(qk.task(wid, saved.id), saved)
      qc.invalidateQueries({ queryKey: ['w', wid] })
      toast.success(task ? 'Changes saved' : savedMessage(saved))
      onOpenChange(false)
      onSaved?.(saved)
    },
    onError: (err, _vars, context) => {
      if (task && context?.previous) qc.setQueryData(qk.task(wid, task.id), context.previous)
      if (err instanceof ApiError && err.fields) setErrors(err.fields)
      setFormError(err.message)
    },
  })

  const submit = (asSubmit: boolean) => {
    if (!title.trim()) { setErrors({ title: 'Give the task a title.' }); return }
    save.mutate(asSubmit)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{task ? `Edit #${task.number}` : 'New task'}</DialogTitle></DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(e) => { e.preventDefault(); submit(!task) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(!task) } }}
        >
          <fieldset>
            <legend className="mb-2 font-medium">Type</legend>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  type="button" key={t.key} role="radio" aria-checked={t.key === typeKey} onClick={() => setTypeKey(t.key)}
                  className={cn('rounded-md border px-3 py-1.5 transition-colors duration-(--motion) hover:bg-accent',
                    t.key === typeKey && 'border-primary bg-primary/10 font-medium text-primary')}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
              aria-invalid={!!errors.title} placeholder="Say what will change, e.g. Add retry to the BigQuery loader" autoFocus />
            {errors.title && <p className="text-destructive">{errors.title}</p>}
          </div>

          {!task && !!similar.data?.length && (
            <aside aria-label="Possibly similar tasks" className="rounded-md border border-dashed p-3">
              <p className="mb-2 font-medium">Possibly similar</p>
              <ul className="space-y-1">
                {similar.data.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="num text-muted-foreground">#{s.number}</span>
                    <Link to={`/w/${wid}/tasks/${s.id}`} target="_blank" className="min-w-0 flex-1 truncate hover:underline">{s.title}</Link>
                    <StatusBadge status={s.status} />
                  </li>
                ))}
              </ul>
            </aside>
          )}

          {template?.sections.map((s) => (
            <div key={s.key} className="space-y-1.5">
              <Label htmlFor={`f-${s.key}`}>
                {s.label}
                {s.required ? <span className="text-muted-foreground" aria-hidden>*</span> : <span className="font-normal text-muted-foreground">(optional)</span>}
                {s.required && <span className="sr-only">(required)</span>}
              </Label>
              <Textarea
                id={`f-${s.key}`} rows={3} value={fields[s.key] ?? ''} placeholder={s.hint}
                onChange={(e) => setFields({ ...fields, [s.key]: e.target.value })}
                aria-invalid={!!errors[s.key]} aria-describedby={errors[s.key] ? `e-${s.key}` : undefined}
              />
              {errors[s.key] && <p id={`e-${s.key}`} className="text-destructive">{errors[s.key]}</p>}
            </div>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="task-labels">Labels <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="task-labels" value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="ingestion, performance" />
          </div>

          {formError && <p role="alert" className="text-destructive">{formError}</p>}

          <DialogFooter>
            {task ? (
              <Button type="submit" disabled={save.isPending}>Save changes</Button>
            ) : (
              <>
                <Button type="button" variant="outline" disabled={save.isPending} onClick={() => submit(false)}>Save draft</Button>
                <Button type="submit" disabled={save.isPending}>Submit for approval</Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
