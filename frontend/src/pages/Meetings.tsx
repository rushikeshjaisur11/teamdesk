import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, FileText, ListPlus, Sparkles, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/EmptyState'
import { Markdownish } from '@/components/Markdownish'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { localToday, formatDay } from '@/lib/days'
import { useTemplates, useWorkspace, wpath } from '@/lib/queries'
import type { Doc, Meeting, MeetingSummary, Task } from '@/lib/types'
import { cn } from '@/lib/utils'

const OTHER = 'Other meetings'
const keys = (wid: string) => ({ list: ['w', wid, 'meetings'], one: (id: string) => ['w', wid, 'meetings', id] })

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error("The file couldn't be read."))
    r.readAsDataURL(file)
  })
}

/** Series first (newest meeting first within each), then meetings with no series. */
export function groupMeetings(list: MeetingSummary[]): [string, MeetingSummary[]][] {
  const groups = new Map<string, MeetingSummary[]>()
  for (const m of list) groups.set(m.series || OTHER, [...(groups.get(m.series || OTHER) ?? []), m])
  return [...groups.entries()].sort(([a, x], [b, y]) => (a === OTHER ? 1 : b === OTHER ? -1 : y[0].date.localeCompare(x[0].date) || a.localeCompare(b)))
}

function MeetingView({ wid, id, series, aiOn, canWrite }: { wid: string; id: string; series: string[]; aiOn: boolean; canWrite: boolean }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { can } = useWorkspace()
  const k = keys(wid)
  const templates = useTemplates(wid)
  const meeting = useQuery({ queryKey: k.one(id), queryFn: () => api<Meeting>(wpath(wid, `/meetings/${id}`)) })
  const [m, setM] = useState<Meeting | null>(null)
  const [keep, setKeep] = useState<boolean[]>([])
  const [editSummary, setEditSummary] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { if (meeting.data) { setM(meeting.data); setKeep(meeting.data.proposed.map(() => true)) } }, [meeting.data])

  const put = (next: Meeting) => api<Meeting>(wpath(wid, `/meetings/${id}`), { method: 'PUT', json: {
    title: next.title, series: next.series, date: next.date, notes: next.notes, summary: next.summary, proposed: next.proposed, created: next.created } })
  const saved = (r: Meeting) => { qc.setQueryData(k.one(id), r); qc.invalidateQueries({ queryKey: k.list, exact: true }) }
  const save = useMutation({ mutationFn: () => put(m!), onSuccess: (r) => { saved(r); toast.success('Meeting saved') }, onError: (e) => toast.error(e.message) })
  const upload = useMutation({
    mutationFn: async (f: File) => api<{ text: string }>(wpath(wid, '/meetings/parse'), { method: 'POST', json: { filename: f.name, data: await toBase64(f) } }),
    onSuccess: (r, f) => {
      setM({ ...m!, notes: m!.notes.trim() ? `${m!.notes.trim()}\n\n${r.text}` : r.text, title: m!.title || f.name.replace(/\.[^.]+$/, '') })
      toast.success(`${f.name} added to the notes. Save, or summarize now.`)
    },
    onError: (e) => toast.error(e.message),
  })
  const extract = useMutation({
    mutationFn: async () => { await put(m!); return api<Meeting>(wpath(wid, `/meetings/${id}/extract`), { method: 'POST' }) },
    onSuccess: (r) => { saved(r); setEditSummary(false) },
    onError: (e) => toast.error(e.message),
  })
  const firstSection = (key: string) => templates.data?.find((t) => t.key === key)?.sections[0]?.key
  const createTasks = useMutation({
    mutationFn: async () => {
      const made: Meeting['created'] = []
      const left: Meeting['proposed'] = []
      for (const [i, t] of m!.proposed.entries()) {
        if (!keep[i] || !t.title.trim()) { left.push(t); continue }
        const details = [t.details, t.owner && `Suggested owner: ${t.owner}`, `From the meeting "${m!.title}" on ${formatDay(m!.date)}.`].filter(Boolean).join('\n\n')
        const section = firstSection(t.type_key)
        const task = await api<Task>(wpath(wid, '/tasks'), { method: 'POST', json: { type_key: t.type_key, title: t.title.trim(), fields: section ? { [section]: details } : {} } })
        made.push({ id: task.id, number: task.number, title: task.title })
      }
      return put({ ...m!, proposed: left, created: [...m!.created, ...made] }).then((r) => ({ r, n: made.length }))
    },
    onSuccess: ({ r, n }) => { saved(r); qc.invalidateQueries({ queryKey: ['w', wid, 'tasks'] }); toast.success(`${n} draft ${n === 1 ? 'task' : 'tasks'} created. Open each to finish and submit it.`) },
    onError: (e) => toast.error(e.message),
  })
  const saveDoc = useMutation({
    mutationFn: () => api<Doc>(wpath(wid, '/docs'), { method: 'POST', json: { title: `${m!.title} (${formatDay(m!.date)})`, body: `${m!.summary}\n\n## Notes\n\n${m!.notes}` } }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ['w', wid, 'docs'] }); toast.success('Saved to Docs', { action: { label: 'Open', onClick: () => navigate(`/w/${wid}/docs/${d.id}`) } }) },
    onError: (e) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: () => api(wpath(wid, `/meetings/${id}`), { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: k.list }); navigate(`/w/${wid}/meetings`) },
  })

  if (meeting.isPending || !m) return <div className="space-y-3 p-8"><Skeleton className="h-7 w-1/2" /><Skeleton className="h-60 w-full" /></div>
  if (meeting.isError) return <p role="alert" className="p-8 text-destructive">{meeting.error.message}</p>
  const set = (patch: Partial<Meeting>) => setM({ ...m, ...patch })
  const setTask = (i: number, patch: Partial<Meeting['proposed'][number]>) => set({ proposed: m.proposed.map((t, j) => (j === i ? { ...t, ...patch } : t)) })
  const keepCount = m.proposed.filter((t, i) => keep[i] && t.title.trim()).length
  const dirty = JSON.stringify(m) !== JSON.stringify(meeting.data)

  return (
    <div className="grid gap-6 p-6 xl:grid-cols-2">
      <section className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem_10rem]">
          <div className="space-y-1.5"><Label htmlFor="m-title">Meeting</Label>
            <Input id="m-title" value={m.title} maxLength={200} disabled={!canWrite} onChange={(e) => set({ title: e.target.value })} className="bg-card" /></div>
          <div className="space-y-1.5"><Label htmlFor="m-series">Group</Label>
            <Input id="m-series" list="m-series-list" value={m.series} maxLength={100} disabled={!canWrite} placeholder="Daily standup" onChange={(e) => set({ series: e.target.value })} className="bg-card" />
            <datalist id="m-series-list">{series.map((s) => <option key={s} value={s} />)}</datalist></div>
          <div className="space-y-1.5"><Label htmlFor="m-date">Date</Label>
            <Input id="m-date" type="date" value={m.date} disabled={!canWrite} onChange={(e) => e.target.value && set({ date: e.target.value })} className="bg-card" /></div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-end justify-between gap-2">
            <Label htmlFor="m-notes">Notes or transcript</Label>
            {canWrite && <>
              <input ref={file} type="file" accept=".vtt,.docx,.txt,.md" className="hidden" aria-label="Transcript file"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = '' }} />
              <Button variant="outline" size="sm" disabled={upload.isPending} onClick={() => file.current?.click()}>
                <Upload />{upload.isPending ? 'Reading file' : 'Upload transcript'}</Button>
            </>}
          </div>
          <Textarea id="m-notes" rows={18} value={m.notes} maxLength={200000} disabled={!canWrite} className="bg-card"
            placeholder={'Upload the transcript (.vtt or .docx from Teams: Recap → Transcript → Download), or paste your notes.\n\nPriya: I can add retries to the loader by Friday.\nSam: Let\'s drop the old cron job.'}
            onChange={(e) => set({ notes: e.target.value })} />
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {aiOn
              ? <Button disabled={m.notes.trim().length < 20 || extract.isPending} onClick={() => extract.mutate()}>
                  <Sparkles />{extract.isPending ? 'Reading the notes' : m.summary ? 'Summarize again' : 'Summarize and find tasks'}</Button>
              : <p className="self-center text-muted-foreground">AI is off, so summaries and task suggestions aren't available. The platform team can turn it on.</p>}
            <Button variant="outline" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>Save</Button>
            <Button variant="ghost" size="icon" className="ml-auto" aria-label="Delete meeting" onClick={() => remove.mutate()}><Trash2 /></Button>
          </div>
        )}
      </section>

      <section className="space-y-6" aria-live="polite">
        {!m.summary && !m.proposed.length && !m.created.length ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">The summary and proposed tasks appear here.</div>
        ) : <>
          {(m.summary || editSummary) && (
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="mr-auto font-semibold">Summary</h2>
                {canWrite && <Button variant="ghost" size="sm" onClick={() => setEditSummary(!editSummary)}>{editSummary ? 'Preview' : 'Edit'}</Button>}
                {can('doc.edit') && <Button variant="outline" size="sm" disabled={!m.summary.trim() || saveDoc.isPending} onClick={() => saveDoc.mutate()}><FileText />Save to Docs</Button>}
              </div>
              {editSummary
                ? <Textarea aria-label="Summary" rows={10} value={m.summary} onChange={(e) => set({ summary: e.target.value })} className="font-mono text-sm" />
                : <Markdownish text={m.summary} />}
            </div>
          )}
          {!!m.proposed.length && (
            <div className="rounded-lg border bg-card">
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <h2 className="mr-auto font-semibold">Proposed tasks</h2>
                {canWrite && <Button size="sm" disabled={!keepCount || createTasks.isPending} onClick={() => createTasks.mutate()}>
                  <ListPlus />Create {keepCount} draft {keepCount === 1 ? 'task' : 'tasks'}</Button>}
              </div>
              <ul className="divide-y">
                {m.proposed.map((t, i) => (
                  <li key={i} className="flex gap-3 px-4 py-3">
                    <Checkbox className="mt-2.5" aria-label={`Keep: ${t.title}`} checked={!!keep[i]} disabled={!canWrite}
                      onCheckedChange={(on) => setKeep(keep.map((x, j) => (j === i ? !!on : x)))} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Input aria-label={`Task ${i + 1} title`} value={t.title} maxLength={200} disabled={!canWrite} onChange={(e) => setTask(i, { title: e.target.value })} />
                      {t.details && <p className="text-muted-foreground">{t.details}</p>}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <select aria-label={`Task ${i + 1} type`} value={t.type_key} disabled={!canWrite} onChange={(e) => setTask(i, { type_key: e.target.value })}
                          className="h-7 rounded-md border border-input bg-background px-1.5">
                          {templates.data?.map((tp) => <option key={tp.key} value={tp.key}>{tp.name}</option>)}
                        </select>
                        {t.owner && <span>Suggested owner: {t.owner}</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!m.created.length && (
            <div className="rounded-lg border bg-card p-4">
              <h2 className="mb-2 font-semibold">Tasks from this meeting</h2>
              <ul className="space-y-1">
                {m.created.map((t) => (
                  <li key={t.id}><Link to={`/w/${wid}/tasks/${t.id}`} className="hover:underline"><span className="task-id mr-2 text-muted-foreground">#{t.number}</span>{t.title}</Link></li>
                ))}
              </ul>
            </div>
          )}
        </>}
      </section>
    </div>
  )
}

export function Meetings() {
  const { wid, me, can } = useWorkspace()
  const { meetingId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const k = keys(wid)
  const list = useQuery({ queryKey: k.list, queryFn: () => api<MeetingSummary[]>(wpath(wid, '/meetings')) })
  const canWrite = can('task.create')
  const groups = groupMeetings(list.data ?? [])
  const series = groups.map(([g]) => g).filter((g) => g !== OTHER)
  const create = useMutation({
    mutationFn: (group: string) => api<Meeting>(wpath(wid, '/meetings'), { method: 'POST', json: {
      title: group ? `${group} ${formatDay(localToday())}` : `Meeting ${formatDay(localToday())}`, series: group, date: localToday() } }),
    onSuccess: (m) => { qc.invalidateQueries({ queryKey: k.list }); navigate(`/w/${wid}/meetings/${m.id}`) },
    onError: (e) => toast.error(e.message),
  })
  const current = list.data?.find((m) => m.id === meetingId)

  return (
    <div className="flex min-h-0 flex-1">
      <aside aria-label="Meetings" className="flex w-72 shrink-0 flex-col border-r bg-card/40">
        <div className="border-b p-3">
          {canWrite && <Button size="sm" className="w-full" disabled={create.isPending} onClick={() => create.mutate(current?.series ?? '')}>
            <CalendarPlus />New meeting{current?.series ? ` in ${current.series}` : ''}</Button>}
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto p-2">
          {list.isPending ? <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
            : groups.map(([group, ms]) => (
              <section key={group} aria-label={group} className="mb-4">
                <h2 className="flex items-center justify-between px-2 pb-1 text-xs font-medium text-muted-foreground">
                  <span className="truncate">{group}</span><span className="num">{ms.length}</span>
                </h2>
                {ms.map((m) => (
                  <Link key={m.id} to={`/w/${wid}/meetings/${m.id}`} aria-current={m.id === meetingId || undefined}
                    className={cn('flex items-baseline gap-2 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                      m.id === meetingId && 'bg-accent text-foreground')}>
                    <span className="min-w-0 flex-1 truncate">{m.title}</span>
                    <span className="num shrink-0 text-xs">{formatDay(m.date)}</span>
                  </Link>
                ))}
                {canWrite && group !== OTHER && (
                  <button type="button" className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => create.mutate(group)}>
                    + Add to {group}
                  </button>
                )}
              </section>
            ))}
        </nav>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {meetingId ? <MeetingView key={meetingId} wid={wid} id={meetingId} series={series} aiOn={!!me?.ai_enabled} canWrite={canWrite} />
          : list.data && !list.data.length
            ? <EmptyState title="No meetings yet" body="Upload a Teams transcript or paste notes. AI writes the summary and proposes tasks; you choose which become drafts."
                action={canWrite ? <Button onClick={() => create.mutate('')}><CalendarPlus />New meeting</Button> : undefined} />
            : <EmptyState title="Pick a meeting" body="Meetings are grouped by series, like Daily standup or Sprint planning. Set the group on each meeting." />}
      </section>
    </div>
  )
}
