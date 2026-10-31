import { Input } from '@/components/ui/input'
import type { Recurrence } from '@/lib/types'
import { cn } from '@/lib/utils'
import { selectClass } from '@/pages/settings/Members'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function RecurrencePicker({ value, onChange }: { value: Recurrence | null; onChange: (r: Recurrence | null) => void }) {
  const freq = value?.freq ?? 'none'
  const days = value?.days ?? []
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2">
        <span className="font-medium">Repeat</span>
        <select aria-label="Repeat" className={selectClass} value={freq} onChange={(e) => {
          const f = e.target.value
          onChange(f === 'none' ? null : f === 'weekly' ? { freq: 'weekly', days: [] }
            : f === 'monthly' ? { freq: 'monthly', day: 1 } : { freq: f as 'daily' | 'weekdays' })
        }}>
          <option value="none">Doesn't repeat</option>
          <option value="daily">Every day</option>
          <option value="weekdays">Every weekday</option>
          <option value="weekly">Every week on…</option>
          <option value="monthly">Every month on day…</option>
        </select>
      </label>
      {freq === 'weekly' && (
        <div className="flex gap-1" role="group" aria-label="Days of the week">
          {DAYS.map((name, i) => (
            <button key={name} type="button" aria-label={name} aria-pressed={days.includes(i)}
              onClick={() => onChange({ freq: 'weekly', days: days.includes(i) ? days.filter((d) => d !== i) : [...days, i].sort() })}
              className={cn('size-8 rounded-md border text-xs', days.includes(i) ? 'border-foreground bg-foreground text-background' : 'border-input hover:bg-accent/60')}>
              {name[0]}
            </button>
          ))}
        </div>
      )}
      {freq === 'monthly' && (
        <Input type="number" min={1} max={31} aria-label="Day of the month" className="w-24" value={value?.day ?? 1}
          onChange={(e) => onChange({ freq: 'monthly', day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
      )}
    </div>
  )
}
