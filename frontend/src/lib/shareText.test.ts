import { sharedTitle } from './shareText'

it('joins title, text and url without repeating', () => {
  expect(sharedTitle(new URLSearchParams({ title: 'Doc', text: 'Read this', url: 'https://x.test/a' }))).toBe('Doc Read this https://x.test/a')
  expect(sharedTitle(new URLSearchParams({ text: 'Read https://x.test/a', url: 'https://x.test/a' }))).toBe('Read https://x.test/a')
})
it('caps at 500 and handles empty', () => {
  expect(sharedTitle(new URLSearchParams({ text: 'a'.repeat(900) }))).toHaveLength(500)
  expect(sharedTitle(new URLSearchParams())).toBe('')
})
