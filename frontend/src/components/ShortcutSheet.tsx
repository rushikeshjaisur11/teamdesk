import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export const SHORTCUTS: [string, string][] = [
  ['Ctrl K', 'Search and run commands'],
  ['N', 'New task'],
  ['I', 'Capture an idea'],
  ['?', 'Show this list'],
  ['J / K', 'Next / previous task in the approval queue'],
  ['A', 'Approve'],
  ['R', 'Reject'],
  ['C', 'Ask for changes'],
  ['D', 'Mark as duplicate'],
  ['S', 'Snooze'],
  ['Ctrl Enter', 'Send a comment or confirm a dialog'],
]

export function ShortcutSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle></DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className="contents">
              <dt><kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-medium">{keys}</kbd></dt>
              <dd className="text-muted-foreground">{what}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
