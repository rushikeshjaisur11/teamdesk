import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useShortcut } from './useShortcut'

function Harness({ onA, onK }: { onA: () => void; onK?: () => void }) {
  useShortcut('a', onA)
  useShortcut('mod+k', onK ?? (() => {}))
  return <input aria-label="field" />
}

it('ignores shortcuts while typing', async () => {
  const fn = vi.fn()
  render(<Harness onA={fn} />)
  await userEvent.type(screen.getByRole('textbox'), 'a')
  expect(fn).not.toHaveBeenCalled()
  ;(document.activeElement as HTMLElement).blur()
  await userEvent.keyboard('a')
  expect(fn).toHaveBeenCalledOnce()
})

it('ignores plain keys with modifiers but fires mod+k', async () => {
  const a = vi.fn(), k = vi.fn()
  render(<Harness onA={a} onK={k} />)
  await userEvent.keyboard('{Control>}a{/Control}')
  expect(a).not.toHaveBeenCalled()
  await userEvent.keyboard('{Control>}k{/Control}')
  expect(k).toHaveBeenCalledOnce()
})

it('fires mod+k even inside an input', async () => {
  const k = vi.fn()
  render(<Harness onA={() => {}} onK={k} />)
  await userEvent.type(screen.getByRole('textbox'), '{Control>}k{/Control}')
  expect(k).toHaveBeenCalledOnce()
})
