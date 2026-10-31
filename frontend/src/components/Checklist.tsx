import { X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { ChecklistItem } from '@/lib/types'
import { cn } from '@/lib/utils'

const newId = () => Math.random().toString(36).slice(2, 10)

export function Checklist({ items, onChange, readOnly = false }: {
  items: ChecklistItem[]; onChange: (items: ChecklistItem[]) => void; readOnly?: boolean
}) {
  const [text, setText] = useState('')
  const add = () => {
    const t = text.trim()
    if (!t || items.length >= 50) return
    onChange([...items, { id: newId(), text: t.slice(0, 300), done: false }])
    setText('')
  }
  return (
    <div className="space-y-1">
      {items.map((c) => (
        <div key={c.id} className="group flex items-center gap-2">
          <Checkbox aria-label={c.text} checked={c.done} disabled={readOnly}
            onCheckedChange={(on) => onChange(items.map((x) => (x.id === c.id ? { ...x, done: !!on } : x)))} />
          <span className={cn('min-w-0 flex-1 break-words', c.done && 'text-muted-foreground line-through')}>{c.text}</span>
          {!readOnly && (
            <Button variant="ghost" size="icon-xs" aria-label={`Remove ${c.text}`} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => onChange(items.filter((x) => x.id !== c.id))}><X /></Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Input aria-label="Add a step" placeholder="Add a step, press Enter" value={text} maxLength={300}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
      )}
    </div>
  )
}
