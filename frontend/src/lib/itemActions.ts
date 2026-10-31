import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from './api'
import { formatDay } from './days'
import type { Item } from './types'
import { undoable } from './undoable'

/** Every change to a personal item, with the feedback each one gives. All of My space refreshes after each. */
export function useItemActions() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['me'] })
  const fail = (e: Error) => { toast.error(e.message); refresh() }

  return {
    refresh,
    create: (body: Partial<Item> & { kind: Item['kind']; title: string }) =>
      api<Item>('/api/me/items', { method: 'POST', json: body }).then((i) => { refresh(); return i }),
    update: (item: Item, patch: Partial<Item>) =>
      api<Item>(`/api/me/items/${item.id}`, { method: 'PATCH', json: patch }).then(refresh).catch(fail),
    complete: (item: Item) =>
      api<{ item: Item; next: Item | null }>(`/api/me/items/${item.id}/complete`, { method: 'POST' })
        .then(({ next }) => {
          toast.success(next?.due_on ? `Done. Next one on ${formatDay(next.due_on)}.` : 'Done.')
          refresh()
        })
        .catch(fail),
    reopen: (item: Item) => api(`/api/me/items/${item.id}/reopen`, { method: 'POST' }).then(refresh).catch(fail),
    pin: (item: Item, on: boolean) =>
      api(`/api/me/items/${item.id}/pin`, { method: 'POST', json: { on } }).then(refresh).catch(fail),
    drop: (item: Item) => api(`/api/me/items/${item.id}/drop`, { method: 'POST' }).then(() => { toast('Dropped'); refresh() }).catch(fail),
    remove: (item: Item, hide: () => void, restore: () => void) => undoable({
      message: 'Deleted', hide, restore,
      commit: () => api(`/api/me/items/${item.id}`, { method: 'DELETE' }).then(refresh),
    }),
  }
}
