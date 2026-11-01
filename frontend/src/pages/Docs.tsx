import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, FilePlus, FileText, Folder, FolderPlus, History, Pencil, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/EmptyState'
import { Markdownish } from '@/components/Markdownish'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { useWorkspace, wpath } from '@/lib/queries'
import { ago } from '@/lib/time'
import type { Doc, DocFolder, DocVersion } from '@/lib/types'
import { useDebounced } from '@/lib/useDebounced'
import { cn } from '@/lib/utils'

const TEMPLATES: Record<string, string> = {
  Blank: '',
  'Project setup': '## What this is\n\nOne or two lines about the project.\n\n## Get access\n\n- Repo:\n- Cloud project:\n- Groups to request:\n\n## Run it locally\n\n```\n# commands here\n```\n\n## Who to ask\n\n- Owner:',
  Runbook: '## When to use this\n\nThe alert or symptom that brings you here.\n\n## Steps\n\n1. Check\n2. Fix\n3. Confirm it worked\n\n## If that didn\'t work\n\nWho to page and what to tell them.',
  'How-to': '## Goal\n\nWhat you\'ll have at the end.\n\n## Steps\n\n1. First step\n\n## Notes\n\n- Anything to watch out for',
}

const keys = (wid: string) => ({ folders: ['w', wid, 'docs', 'folders'], list: ['w', wid, 'docs', 'list'], doc: (id: string) => ['w', wid, 'docs', id] })

function Tree({ folders, docs, parent, depth, current, open }: {
  folders: DocFolder[]; docs: Doc[]; parent: string | null; depth: number; current?: string; open: (id: string) => void
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const pad = { paddingLeft: `${depth * 14 + 8}px` }
  return (
    <>
      {folders.filter((f) => f.parent_id === parent).map((f) => (
        <div key={f.id}>
          <button type="button" style={pad} aria-expanded={!closed[f.id]}
            className="flex h-8 w-full items-center gap-1.5 rounded-md pr-2 text-left hover:bg-accent/60"
            onClick={() => setClosed({ ...closed, [f.id]: !closed[f.id] })}>
            {closed[f.id] ? <ChevronRight className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
            <Folder className="size-4 text-muted-foreground" /><span className="truncate font-medium">{f.name}</span>
          </button>
          {!closed[f.id] && <Tree folders={folders} docs={docs} parent={f.id} depth={depth + 1} current={current} open={open} />}
        </div>
      ))}
      {docs.filter((d) => (d.folder_id ?? null) === parent).map((d) => (
        <button key={d.id} type="button" style={{ paddingLeft: `${depth * 14 + 28}px` }} aria-current={d.id === current || undefined}
          className={cn('flex h-8 w-full items-center gap-1.5 rounded-md pr-2 text-left text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            d.id === current && 'bg-accent text-foreground')}
          onClick={() => open(d.id)}>
          <FileText className="size-4 shrink-0" /><span className="truncate">{d.title}</span>
        </button>
      ))}
    </>
  )
}

function FolderSelect({ folders, value, onChange, id }: { folders: DocFolder[]; value: string; onChange: (v: string) => void; id: string }) {
  const path = (f: DocFolder): string => {
    const parent = folders.find((p) => p.id === f.parent_id)
    return parent ? `${path(parent)} / ${f.name}` : f.name
  }
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2">
      <option value="">No folder</option>
      {folders.map((f) => ({ f, p: path(f) })).sort((a, b) => a.p.localeCompare(b.p)).map(({ f, p }) => <option key={f.id} value={f.id}>{p}</option>)}
    </select>
  )
}

function DocView({ wid, docId, folders, canEdit, onDeleted }: { wid: string; docId: string; folders: DocFolder[]; canEdit: boolean; onDeleted: () => void }) {
  const qc = useQueryClient()
  const k = keys(wid)
  const doc = useQuery({ queryKey: k.doc(docId), queryFn: () => api<Doc>(wpath(wid, `/docs/${docId}`)) })
  const [editing, setEditing] = useState<{ title: string; body: string; folder: string; base: number } | null>(null)
  const [conflict, setConflict] = useState('')
  const [history, setHistory] = useState(false)
  const versions = useQuery({ queryKey: [...k.doc(docId), 'versions'], queryFn: () => api<DocVersion[]>(wpath(wid, `/docs/${docId}/versions`)), enabled: history })
  const [peek, setPeek] = useState<DocVersion | null>(null)

  const save = useMutation({
    mutationFn: (force: boolean) => api<Doc>(wpath(wid, `/docs/${docId}`), { method: 'PUT', json: {
      title: editing!.title.trim(), body: editing!.body, folder_id: editing!.folder || null, base_version: editing!.base, force } }),
    onSuccess: (d) => { qc.setQueryData(k.doc(docId), d); qc.invalidateQueries({ queryKey: k.list }); setEditing(null); setConflict(''); toast.success('Saved') },
    onError: (e) => (e.message.includes('after you opened it') ? setConflict(e.message) : toast.error(e.message)),
  })
  const remove = useMutation({
    mutationFn: () => api(wpath(wid, `/docs/${docId}`), { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: k.list }); toast.success('Doc deleted'); onDeleted() },
    onError: (e) => toast.error(e.message),
  })

  if (doc.isPending) return <div className="space-y-3 p-8"><Skeleton className="h-7 w-1/2" /><Skeleton className="h-40 w-full" /></div>
  if (doc.isError) return <p role="alert" className="p-8 text-destructive">{doc.error.message}</p>
  const d = doc.data
  const startEdit = (body = d.body) => { setEditing({ title: d.title, body, folder: d.folder_id ?? '', base: d.version }); setHistory(false); setPeek(null) }

  if (editing) {
    return (
      <form className="flex min-h-0 flex-1 flex-col gap-3 p-6" onSubmit={(e) => { e.preventDefault(); save.mutate(false) }}>
        <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
          <Input aria-label="Title" value={editing.title} maxLength={200} className="h-10 text-lg font-semibold" onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          <FolderSelect id="doc-folder" folders={folders} value={editing.folder} onChange={(folder) => setEditing({ ...editing, folder })} />
        </div>
        <div className="grid min-h-[28rem] flex-1 gap-3 lg:grid-cols-2">
          <Textarea aria-label="Doc text (Markdown)" value={editing.body} className="min-h-[28rem] resize-none font-mono text-sm"
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            onKeyDown={(e) => { if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save.mutate(false) } }} />
          <div className="hidden overflow-y-auto rounded-md border bg-card p-4 lg:block" aria-label="Preview"><Markdownish text={editing.body} /></div>
        </div>
        <p className="text-xs text-muted-foreground"># Heading, - bullet, 1. step, ``` code block ```, **bold**, `code`. Ctrl + S saves.</p>
        {conflict && (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md px-4 py-3" style={{ backgroundColor: 'var(--pill-warning-bg)', color: 'var(--pill-warning-ink)' }}>
            <span className="mr-auto">{conflict}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => save.mutate(true)}>Save anyway</Button>
          </div>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={!editing.title.trim() || save.isPending}>Save</Button>
          <Button type="button" variant="ghost" onClick={() => { setEditing(null); setConflict('') }}>Cancel</Button>
        </div>
      </form>
    )
  }

  return (
    <article className="mx-auto w-full max-w-3xl px-8 py-8">
      <header className="mb-6 flex flex-wrap items-start gap-3 border-b pb-4">
        <div className="mr-auto min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.01em] break-words">{d.title}</h1>
          <p className="mt-1 text-muted-foreground">Edited by {d.updated_by.name} {ago(d.updated_at)}</p>
        </div>
        {canEdit && <Button variant="outline" onClick={() => startEdit()}><Pencil />Edit</Button>}
        <Button variant="ghost" onClick={() => setHistory(true)}><History />History</Button>
        {canEdit && <Button variant="ghost" size="icon" aria-label="Delete doc" onClick={() => remove.mutate()}><Trash2 /></Button>}
      </header>
      {d.body.trim() ? <Markdownish text={d.body} /> : <p className="text-muted-foreground">This doc is empty.{canEdit && ' Click Edit to write it.'}</p>}

      <Dialog open={history} onOpenChange={(o) => { setHistory(o); if (!o) setPeek(null) }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>History of {d.title}</DialogTitle>
            <DialogDescription>Earlier versions, newest first. Restoring opens the editor with that text; nothing changes until you save.</DialogDescription>
          </DialogHeader>
          {peek ? (
            <div className="space-y-3">
              <p className="text-muted-foreground">Version {peek.version}, saved by {peek.saved_by.name} {ago(peek.saved_at)}</p>
              <div className="max-h-80 overflow-y-auto rounded-md border p-3"><Markdownish text={peek.body} /></div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPeek(null)}>Back</Button>
                {canEdit && <Button onClick={() => startEdit(peek.body)}>Restore this version</Button>}
              </DialogFooter>
            </div>
          ) : versions.data && !versions.data.length ? <p className="text-muted-foreground">No earlier versions yet.</p> : (
            <ul className="divide-y">
              {versions.data?.map((v) => (
                <li key={v.id}>
                  <button type="button" className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-accent/40" onClick={() => setPeek(v)}>
                    <span className="num w-10 text-muted-foreground">v{v.version}</span>
                    <span className="flex-1">{v.saved_by.name}</span>
                    <span className="text-xs text-muted-foreground">{ago(v.saved_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </article>
  )
}

export function Docs() {
  const { wid, can } = useWorkspace()
  const { docId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const k = keys(wid)
  const folders = useQuery({ queryKey: k.folders, queryFn: () => api<DocFolder[]>(wpath(wid, '/docs/folders')) })
  const docs = useQuery({ queryKey: k.list, queryFn: () => api<Doc[]>(wpath(wid, '/docs')) })
  const [q, setQ] = useState('')
  const query = useDebounced(q.trim(), 250)
  const hits = useQuery({ queryKey: [...k.list, 'q', query], queryFn: () => api<(Doc & { snippet: string })[]>(wpath(wid, `/docs?q=${encodeURIComponent(query)}`)), enabled: !!query })
  const [newDoc, setNewDoc] = useState<{ title: string; folder: string; template: string } | null>(null)
  const [newFolder, setNewFolder] = useState<{ name: string; parent: string } | null>(null)
  const open = (id: string) => { setQ(''); navigate(`/w/${wid}/docs/${id}`) }
  const canEdit = can('doc.edit')

  const create = useMutation({
    mutationFn: () => api<Doc>(wpath(wid, '/docs'), { method: 'POST', json: { title: newDoc!.title.trim(), body: TEMPLATES[newDoc!.template], folder_id: newDoc!.folder || null } }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: k.list }); setNewDoc(null); open(d.id) },
    onError: (e) => toast.error(e.message),
  })
  const createFolder = useMutation({
    mutationFn: () => api<DocFolder>(wpath(wid, '/docs/folders'), { method: 'POST', json: { name: newFolder!.name.trim(), parent_id: newFolder!.parent || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: k.folders }); setNewFolder(null) },
    onError: (e) => toast.error(e.message),
  })

  const f = folders.data ?? []
  return (
    <div className="flex min-h-0 flex-1">
      <aside aria-label="Docs" className="flex w-72 shrink-0 flex-col border-r bg-card/40">
        <div className="space-y-2 border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search docs" aria-label="Search docs" className="bg-background pl-8" />
          </div>
          {canEdit && (
            <div className="flex gap-1.5">
              <Button size="sm" className="flex-1" onClick={() => setNewDoc({ title: '', folder: '', template: 'Blank' })}><FilePlus />New doc</Button>
              {can('doc.manage_folders') && <Button size="sm" variant="outline" onClick={() => setNewFolder({ name: '', parent: '' })}><FolderPlus />Folder</Button>}
            </div>
          )}
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto p-2">
          {query ? (
            hits.data && !hits.data.length ? <p className="p-2 text-muted-foreground">No docs match "{query}".</p> : (
              <ul className="space-y-1">
                {hits.data?.map((h) => (
                  <li key={h.id}>
                    <button type="button" className="w-full rounded-md p-2 text-left hover:bg-accent/60" onClick={() => open(h.id)}>
                      <span className="block font-medium">{h.title}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{h.snippet}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : docs.isPending || folders.isPending ? <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
            : <Tree folders={f} docs={docs.data ?? []} parent={null} depth={0} current={docId} open={open} />}
        </nav>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {docId ? <DocView key={docId} wid={wid} docId={docId} folders={f} canEdit={canEdit} onDeleted={() => navigate(`/w/${wid}/docs`)} />
          : docs.data && !docs.data.length
            ? <EmptyState title="No docs yet" body="Write down how to set up a project, run a job or fix an alert, so nobody has to ask twice."
                action={canEdit ? <Button onClick={() => setNewDoc({ title: '', folder: '', template: 'Project setup' })}><FilePlus />Write the first doc</Button> : undefined} />
            : <EmptyState title="Pick a doc" body="Choose one on the left, or search across every doc in this team." />}
      </section>

      <Dialog open={!!newDoc} onOpenChange={(o) => !o && setNewDoc(null)}>
        {newDoc && (
          <DialogContent>
            <DialogHeader><DialogTitle>New doc</DialogTitle></DialogHeader>
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
              <div className="space-y-1.5"><Label htmlFor="nd-title">Title</Label>
                <Input id="nd-title" autoFocus value={newDoc.title} maxLength={200} placeholder="Set up the ingestion project" onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="nd-folder">Folder</Label>
                <FolderSelect id="nd-folder" folders={f} value={newDoc.folder} onChange={(folder) => setNewDoc({ ...newDoc, folder })} /></div>
              <div className="space-y-1.5"><Label>Start from</Label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(TEMPLATES).map((t) => (
                    <Button key={t} type="button" size="sm" variant={newDoc.template === t ? 'secondary' : 'outline'} aria-pressed={newDoc.template === t}
                      onClick={() => setNewDoc({ ...newDoc, template: t })}>{t}</Button>
                  ))}
                </div></div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setNewDoc(null)}>Cancel</Button>
                <Button type="submit" disabled={!newDoc.title.trim() || create.isPending}>Create</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!newFolder} onOpenChange={(o) => !o && setNewFolder(null)}>
        {newFolder && (
          <DialogContent>
            <DialogHeader><DialogTitle>New folder</DialogTitle></DialogHeader>
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); createFolder.mutate() }}>
              <div className="space-y-1.5"><Label htmlFor="nf-name">Name</Label>
                <Input id="nf-name" autoFocus value={newFolder.name} maxLength={100} placeholder="Runbooks" onChange={(e) => setNewFolder({ ...newFolder, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="nf-parent">Inside</Label>
                <FolderSelect id="nf-parent" folders={f} value={newFolder.parent} onChange={(parent) => setNewFolder({ ...newFolder, parent })} /></div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setNewFolder(null)}>Cancel</Button>
                <Button type="submit" disabled={!newFolder.name.trim() || createFolder.isPending}>Create folder</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
