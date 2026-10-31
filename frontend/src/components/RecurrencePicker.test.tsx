import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { Recurrence } from '@/lib/types'
import { RecurrencePicker } from './RecurrencePicker'

function Harness({ onChange }: { onChange: (r: Recurrence | null) => void }) {
  const [v, setV] = useState<Recurrence | null>(null)
  return <RecurrencePicker value={v} onChange={(r) => { setV(r); onChange(r) }} />
}

it('weekly on Monday and Thursday', async () => {
  const fn = vi.fn()
  render(<Harness onChange={fn} />)
  await userEvent.selectOptions(screen.getByLabelText('Repeat'), 'weekly')
  await userEvent.click(screen.getByRole('button', { name: 'Monday' }))
  await userEvent.click(screen.getByRole('button', { name: 'Thursday' }))
  expect(fn).toHaveBeenLastCalledWith({ freq: 'weekly', days: [0, 3] })
})

it('none clears the rule', async () => {
  const fn = vi.fn()
  render(<Harness onChange={fn} />)
  await userEvent.selectOptions(screen.getByLabelText('Repeat'), 'daily')
  await userEvent.selectOptions(screen.getByLabelText('Repeat'), 'none')
  expect(fn).toHaveBeenLastCalledWith(null)
})
