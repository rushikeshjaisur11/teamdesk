import { render, screen } from '@testing-library/react'
import { Markdownish } from './Markdownish'

it('renders hostile text as text', () => {
  const { container } = render(<Markdownish text={'<script>alert(1)</script> **hi**'} />)
  expect(container.querySelector('script')).toBeNull()
  expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument()
  expect(screen.getByText('hi').tagName).toBe('STRONG')
})

it('renders bullets, code and safe links only', () => {
  const { container } = render(<Markdownish text={'- one `x`\n- see https://docs.corp.test/runbooks/loader\n- javascript:alert(1)'} />)
  expect(container.querySelectorAll('li')).toHaveLength(3)
  expect(screen.getByText('x').tagName).toBe('CODE')
  expect(screen.getByRole('link')).toHaveAttribute('href', 'https://docs.corp.test/runbooks/loader')
  expect(container.querySelectorAll('a')).toHaveLength(1)
})
