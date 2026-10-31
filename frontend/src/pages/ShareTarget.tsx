import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { sharedTitle } from '@/lib/shareText'

/** Landing page for the installed app's share target: saves what was shared as an idea in your Inbox. */
export function ShareTarget() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    const title = sharedTitle(params)
    if (!title) { navigate('/me/inbox', { replace: true }); return }
    api('/api/me/items', { method: 'POST', json: { kind: 'idea', title } })
      .then(() => { qc.invalidateQueries({ queryKey: ['me'] }); toast.success('Saved to your Inbox') })
      .catch((e) => toast.error(e.message))
      .finally(() => navigate('/me/inbox', { replace: true }))
  }, [params, navigate, qc])
  return <p className="p-6 text-muted-foreground">Saving to your Inbox…</p>
}
