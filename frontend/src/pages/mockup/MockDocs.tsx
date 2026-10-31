import { ChevronDown, ChevronRight, FileText, Folder, Plus, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { MockLayout } from './MockLayout'

const TREE = [
  { name: 'Getting started', docs: ['Team handbook', 'Access requests'] },
  { name: 'Setup guides', docs: ['Local setup: ingestion service', 'Local setup: embeddings worker', 'VPN and proxy settings'] },
  { name: 'Runbooks', docs: ['Nightly load failed', 'Rotating service credentials'] },
  { name: 'Decisions', docs: ['Why MongoDB for TeamDesk'] },
]

export function MockDocs() {
  const [open, setOpen] = useState<Record<string, boolean>>({ 'Setup guides': true, Runbooks: true })
  const [doc, setDoc] = useState('Local setup: ingestion service')
  const [asked, setAsked] = useState(false)

  return (
    <MockLayout>
      <div className="flex min-h-full">
        <nav aria-label="Docs" className="hidden w-72 shrink-0 border-r px-3 py-5 md:block">
          <div className="mb-3 flex items-center justify-between px-2">
            <h1 className="font-semibold">Docs</h1>
            <Button variant="ghost" size="icon-sm" aria-label="New doc"><Plus /></Button>
          </div>
          <ul className="space-y-0.5">
            {TREE.map((f) => (
              <li key={f.name}>
                <button onClick={() => setOpen({ ...open, [f.name]: !open[f.name] })} aria-expanded={!!open[f.name]}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-accent">
                  {open[f.name] ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                  <Folder className="size-4 text-muted-foreground" />
                  <span className="truncate">{f.name}</span>
                </button>
                {open[f.name] && (
                  <ul className="ml-5 border-l pl-2">
                    {f.docs.map((d) => (
                      <li key={d}>
                        <button onClick={() => setDoc(d)} aria-current={doc === d || undefined}
                          className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground hover:bg-accent hover:text-foreground',
                            doc === d && 'bg-accent font-medium text-foreground')}>
                          <FileText className="size-4 shrink-0" /><span className="truncate" title={d}>{d}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 px-6 py-6 md:px-10">
          <form onSubmit={(e) => { e.preventDefault(); setAsked(true) }} className="mx-auto mb-8 max-w-[70ch]">
            <label htmlFor="ask" className="mb-2 block font-medium">Ask your team's docs</label>
            <div className="flex gap-2">
              <Input id="ask" defaultValue="How do I run the ingestion service locally?" />
              <Button type="submit"><Sparkles />Ask</Button>
            </div>
            {asked && (
              <div className="mt-3 rounded-lg border bg-card p-4">
                <p>Start MongoDB in Docker, copy <code className="rounded bg-muted px-1">.env.example</code> to <code className="rounded bg-muted px-1">.env</code>, then run <code className="rounded bg-muted px-1">make dev</code>. The service listens on port 8080.</p>
                <p className="mt-3 text-xs text-muted-foreground">From <a className="text-primary underline underline-offset-2" href="#doc">Local setup: ingestion service</a> and <a className="text-primary underline underline-offset-2" href="#doc">VPN and proxy settings</a></p>
              </div>
            )}
          </form>

          <article id="doc" className="mx-auto max-w-[70ch]">
            <p className="mb-1 text-muted-foreground">Setup guides</p>
            <h2 className="mb-1 text-2xl font-semibold tracking-tight">{doc}</h2>
            <p className="mb-6 text-xs text-muted-foreground">Edited by Meera Kulkarni, 3 days ago. Linked to task #10.</p>
            <div className="space-y-4 leading-relaxed">
              <p>This gets the ingestion service running on your laptop in about fifteen minutes. You need Docker, Python 3.12 and access to the dev project.</p>
              <h3 className="pt-2 text-base font-semibold">1. Start the database</h3>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>docker run -d --name ingest-mongo -p 27017:27017 mongo:7</code></pre>
              <h3 className="pt-2 text-base font-semibold">2. Configure</h3>
              <p>Copy <code className="rounded bg-muted px-1">.env.example</code> to <code className="rounded bg-muted px-1">.env</code>. Ask in the team channel for the dev service account key if you don't have one yet.</p>
              <h3 className="pt-2 text-base font-semibold">3. Run</h3>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>make dev</code></pre>
              <p>Open <code className="rounded bg-muted px-1">http://localhost:8080/health</code>. You should see <code className="rounded bg-muted px-1">{'{"ok": true}'}</code>.</p>
            </div>
          </article>
        </div>
      </div>
    </MockLayout>
  )
}
