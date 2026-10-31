import { Navigate } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { lastWorkspace } from '@/lib/lastWorkspace'
import { useMe } from '@/lib/queries'
import { NoWorkspace } from './NoWorkspace'

export function Home() {
  const { data: me, error } = useMe()
  if (error) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background">
        <EmptyState title="TeamDesk can't tell who you are"
          body="Company sign-in isn't connected yet. Ask the person who runs TeamDesk to set the default user, then reload." />
      </main>
    )
  }
  if (!me) return null
  const last = lastWorkspace()
  const target = me.workspaces.find((w) => w.id === last) ?? me.workspaces[0]
  return target ? <Navigate to={`/w/${target.id}/tasks`} replace /> : <NoWorkspace me={me} />
}
