import { Check, CornerUpLeft, Copy, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/AppShell'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { MockLayout } from './MockLayout'
import { TaskDetail, Avatar } from './MockTasks'
import { MOCK_TASKS } from './mockData'

type Stamp = { id: string; label: string; color: string }

export function MockApprovals() {
  const [queue, setQueue] = useState(MOCK_TASKS.filter((t) => t.status === 'pending_approval'))
  const [index, setIndex] = useState(0)
  const [stamp, setStamp] = useState<Stamp | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const current = queue[Math.min(index, queue.length - 1)]

  const decide = (label: string, color: string, undoable: boolean) => {
    if (!current) return
    const t = current
    setStamp({ id: t.id, label, color })
    setTimeout(() => {
      setStamp(null)
      setQueue((q) => q.filter((x) => x.id !== t.id))
      if (undoable) {
        toast(`${label} #${t.number}`, { action: { label: 'Undo', onClick: () => setQueue((q) => [t, ...q]) }, duration: 5000 })
      } else {
        toast.success(`${label} #${t.number}. Jira ticket is being created.`)
      }
    }, 450)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (rejecting || e.ctrlKey || e.metaKey || e.altKey || el.closest('input, textarea, select, [contenteditable]')) return
      if (e.key === 'j') setIndex((i) => Math.min(i + 1, queue.length - 1))
      if (e.key === 'k') setIndex((i) => Math.max(i - 1, 0))
      if (e.key === 'a') decide('Approved', 'var(--st-approved)', false)
      if (e.key === 'r') { e.preventDefault(); setRejecting(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <MockLayout approvals={queue.length} pane={current && <TaskDetail t={current} readOnly />}>
      <PageHeader title="Approvals">
        <span className="text-muted-foreground"><span className="num">{queue.length}</span> waiting, oldest first</span>
      </PageHeader>
      {queue.length === 0 ? (
        <EmptyState title="Nothing waiting for approval" body="New tasks from your team show up here. Developer tasks skip this queue automatically." />
      ) : (
        <>
          <div role="listbox" aria-label="Waiting for approval" className="border-y">
            {queue.map((t, i) => (
              <div
                key={t.id}
                role="option"
                aria-selected={current?.id === t.id}
                onClick={() => setIndex(i)}
                className={cn('relative flex cursor-pointer items-center gap-3 px-6 py-3 transition-colors duration-(--motion) hover:bg-accent/60',
                  current?.id === t.id && 'bg-accent', stamp?.id === t.id && 'opacity-70')}
              >
                <span className="num w-9 shrink-0 text-muted-foreground">#{t.number}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.title}</p>
                  <p className="flex gap-3 text-xs text-muted-foreground"><span>{t.type}</span><span>{t.author}</span><span>Submitted {t.submitted}</span></p>
                </div>
                <Avatar name={t.author} />
                {stamp?.id === t.id && (
                  <span className="stamp absolute right-24 text-base" style={{ color: stamp.color }}>{stamp.label}</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 px-6 py-4">
            <Button onClick={() => decide('Approved', 'var(--st-approved)', false)}><Check />Approve <kbd className="ml-1 text-xs opacity-70">A</kbd></Button>
            <Button variant="outline" onClick={() => setRejecting(true)}><X />Reject <kbd className="ml-1 text-xs opacity-70">R</kbd></Button>
            <Button variant="outline"><CornerUpLeft />Ask for changes <kbd className="ml-1 text-xs opacity-70">C</kbd></Button>
            <Button variant="ghost"><Copy />Duplicate <kbd className="ml-1 text-xs opacity-70">D</kbd></Button>
          </div>
          <p className="px-6 text-xs text-muted-foreground">J and K move between tasks.</p>
        </>
      )}
      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject #{current?.number}</DialogTitle>
            <DialogDescription>The author sees this reason.</DialogDescription>
          </DialogHeader>
          <Textarea autoFocus aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this isn't going ahead"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && reason.trim()) { setRejecting(false); setReason(''); decide('Rejected', 'var(--st-rejected)', true) } }} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
            <Button disabled={!reason.trim()} onClick={() => { setRejecting(false); setReason(''); decide('Rejected', 'var(--st-rejected)', true) }}>Reject task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MockLayout>
  )
}
