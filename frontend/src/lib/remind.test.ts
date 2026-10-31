import { presetTime, toLocalInput } from './remind'

const wed = new Date(2026, 10, 4, 10, 0) // Wed 4 Nov 2026, local
it('tomorrow is 9:00 the next day', () => {
  const t = presetTime('tomorrow', wed)
  expect([t.getDate(), t.getHours(), t.getMinutes()]).toEqual([5, 9, 0])
})
it('next Monday is never today, even on a Monday', () => {
  expect(presetTime('monday', wed).getDate()).toBe(9)
  expect(presetTime('monday', new Date(2026, 10, 2, 8, 0)).getDate()).toBe(9)
  expect(presetTime('monday', new Date(2026, 10, 8, 8, 0)).getDate()).toBe(9) // Sunday -> Monday
})
it('later today is +3h, or 23:00 when that would pass midnight', () => {
  expect(presetTime('later', wed).getHours()).toBe(13)
  const t = presetTime('later', new Date(2026, 10, 4, 22, 0))
  expect([t.getDate(), t.getHours()]).toEqual([4, 23])
})
it('formats for datetime-local', () => {
  expect(toLocalInput(new Date(2026, 10, 4, 9, 5).toISOString())).toBe('2026-11-04T09:05')
  expect(toLocalInput(null)).toBe('')
})
