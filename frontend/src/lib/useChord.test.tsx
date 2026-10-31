import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useChord } from './useChord'

function Harness({ fn }: { fn: () => void }) {
  useChord('g', 't', fn)
  return <input aria-label="field" />
}

it('fires on G then T', async () => {
  const fn = vi.fn()
  render(<Harness fn={fn} />)
  await userEvent.keyboard('gt')
  expect(fn).toHaveBeenCalledOnce()
})

it('needs the second key within a second', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const fn = vi.fn()
  render(<Harness fn={fn} />)
  await userEvent.keyboard('g')
  vi.advanceTimersByTime(1200)
  await userEvent.keyboard('t')
  expect(fn).not.toHaveBeenCalled()
  vi.useRealTimers()
})

it('ignores typing', async () => {
  const fn = vi.fn()
  render(<Harness fn={fn} />)
  await userEvent.type(screen.getByRole('textbox'), 'gt')
  expect(fn).not.toHaveBeenCalled()
})
