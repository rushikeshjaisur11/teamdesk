import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { wpath } from '@/lib/queries'
import type { Template } from '@/lib/types'

type Preview = { columns: string[]; rows: string[][]; total: number }
type Result = { created: number; submitted: number; drafts_missing_fields: number[]; skipped_empty: number }

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error("The file couldn't be read."))
    r.readAsDataURL(file)
  })
}

const guess = (columns: string[], pattern: RegExp) => {
  const i = columns.findIndex((c) => pattern.test(c))
  return i < 0 ? '' : String(i)
}

function ColumnSelect({ id, columns, value, onChange, none = 'Not in the sheet' }: {
  id: string; columns: string[]; value: string; onChange: (v: string) => void; none?: string
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2">
      <option value="">{none}</option>
      {columns.map((c, i) => <option key={i} value={i}>{c}</option>)}
    </select>
  )
}

/** Import the manager's sheet: upload, map columns, import as drafts (or submit them). */
export function ImportTasks({ wid, templates, open, onOpenChange }: {
  wid: string; templates: Template[]; open: boolean; onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<{ name: string; data: string } | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [title, setTitle] = useState('')
  const [type, setType] = useState('')
  const [labels, setLabels] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [defaultType, setDefaultType] = useState(templates[0]?.key ?? '')
  const [submit, setSubmit] = useState(false)
  const reset = () => { setFile(null); setPreview(null); setFields({}) }
  const sections = templates.find((t) => t.key === defaultType)?.sections ?? []

  const read = useMutation({
    mutationFn: async (f: File) => {
      const data = await toBase64(f)
      const p = await api<Preview>(wpath(wid, '/tasks/import/preview'), { method: 'POST', json: { filename: f.name, data } })
      return { f: { name: f.name, data }, p }
    },
    onSuccess: ({ f, p }) => {
      setFile(f); setPreview(p)
      setTitle(guess(p.columns, /title|task|summary|name|item/i) || '0')
      setType(guess(p.columns, /type|kind|category/i))
      setLabels(guess(p.columns, /label|tag/i))
      setFields(Object.fromEntries(sections.map((s) => [s.key, guess(p.columns, new RegExp(`^${s.label.split(' ')[0]}`, 'i'))]).filter(([, v]) => v)))
    },
    onError: (e) => toast.error(e.message),
  })
  const run = useMutation({
    mutationFn: () => api<Result>(wpath(wid, '/tasks/import'), { method: 'POST', json: {
      filename: file!.name, data: file!.data, default_type: defaultType, submit,
      mapping: { title: Number(title), type: type === '' ? null : Number(type), labels: labels === '' ? null : Number(labels),
        fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])) } } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['w', wid] })
      const parts = [`${r.created} ${r.created === 1 ? 'task' : 'tasks'} imported`]
      if (submit) parts.push(`${r.submitted} submitted`)
      if (r.drafts_missing_fields.length) parts.push(`${r.drafts_missing_fields.length} kept as drafts because required sections are empty (${r.drafts_missing_fields.map((n) => `#${n}`).join(', ')})`)
      toast.success(`${parts.join(', ')}.`)
      reset(); onOpenChange(false)
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import tasks from Excel</DialogTitle>
          <DialogDescription>The first sheet is read; its first filled row is the header. Columns you don't map are kept in the task's first section, so nothing is lost.</DialogDescription>
        </DialogHeader>
        <input ref={input} type="file" accept=".xlsx,.xlsm" className="hidden" aria-label="Excel file"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) read.mutate(f); e.target.value = '' }} />
        {!preview ? (
          <div className="grid place-items-center gap-3 rounded-lg border border-dashed p-10 text-center">
            <p className="text-muted-foreground">Choose the .xlsx with your task list. Up to 1,000 rows at a time.</p>
            <Button disabled={read.isPending} onClick={() => input.current?.click()}><Upload />{read.isPending ? 'Reading' : 'Choose file'}</Button>
          </div>
        ) : (
          <div className="grid gap-5">
            <p className="text-muted-foreground">{file!.name}: <span className="num text-foreground">{preview.total}</span> rows.{' '}
              <button type="button" className="underline underline-offset-2" onClick={() => input.current?.click()}>Choose another file</button></p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-left text-xs">
                <thead><tr>{preview.columns.map((c, i) => <th key={i} className="border-b px-2 py-1.5 font-medium whitespace-nowrap text-muted-foreground">{c}</th>)}</tr></thead>
                <tbody>{preview.rows.slice(0, 4).map((r, i) => (
                  <tr key={i}>{r.map((v, j) => <td key={j} className="max-w-48 truncate border-b border-rule px-2 py-1.5">{v}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="imp-title">Title</Label>
                <ColumnSelect id="imp-title" columns={preview.columns} value={title} onChange={setTitle} none="Choose a column" /></div>
              <div className="space-y-1.5"><Label htmlFor="imp-type">Task type column</Label>
                <ColumnSelect id="imp-type" columns={preview.columns} value={type} onChange={setType} /></div>
              <div className="space-y-1.5"><Label htmlFor="imp-default">Type when the sheet doesn't say</Label>
                <select id="imp-default" value={defaultType} onChange={(e) => setDefaultType(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2">
                  {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
                </select></div>
              <div className="space-y-1.5"><Label htmlFor="imp-labels">Labels column (comma-separated)</Label>
                <ColumnSelect id="imp-labels" columns={preview.columns} value={labels} onChange={setLabels} /></div>
            </div>
            {!!sections.length && (
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="mb-2 font-medium">Sections</legend>
                {sections.map((s) => (
                  <div key={s.key} className="space-y-1.5"><Label htmlFor={`imp-${s.key}`}>{s.label}{s.required && ' (required to submit)'}</Label>
                    <ColumnSelect id={`imp-${s.key}`} columns={preview.columns} value={fields[s.key] ?? ''} onChange={(v) => setFields({ ...fields, [s.key]: v })} /></div>
                ))}
              </fieldset>
            )}
            <label className="flex items-start gap-2">
              <Checkbox checked={submit} onCheckedChange={(on) => setSubmit(!!on)} className="mt-0.5" />
              <span>Submit them for approval now. Your auto-approve rules apply; rows missing a required section stay as drafts.</span>
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onOpenChange(false) }}>Cancel</Button>
          {preview && <Button disabled={title === '' || run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? 'Importing' : `Import ${preview.total} ${preview.total === 1 ? 'row' : 'rows'}`}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
