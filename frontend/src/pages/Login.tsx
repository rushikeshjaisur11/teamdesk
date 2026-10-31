import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, ApiError } from '@/lib/api'
import { APP_NAME } from '@/lib/brand'

export function Login() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [groups, setGroups] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/api/auth/dev-login', {
        method: 'POST',
        json: {
          sub: email.trim().toLowerCase(), name: name.trim(), email: email.trim(),
          groups: groups.split(/[,\s]+/).filter(Boolean),
        },
      })
      await qc.invalidateQueries()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404
        ? 'Temporary sign-in is turned off on this server.'
        : (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-8 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sign in to {APP_NAME}</h1>
          <p className="mt-2 rounded-md bg-muted px-3 py-2 text-muted-foreground">
            This is a temporary sign-in until company login is connected.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="groups">Your access groups</Label>
          <Input id="groups" value={groups} onChange={(e) => setGroups(e.target.value)} placeholder="grp-data-eng, grp-data-approvers" />
          <p className="text-xs text-muted-foreground">Separate groups with commas.</p>
        </div>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={busy}>{busy ? 'Signing in' : 'Sign in'}</Button>
      </form>
    </main>
  )
}
