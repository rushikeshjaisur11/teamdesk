import { Navigate } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { useMe } from '@/lib/queries'

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
  return <Navigate to="/me/today" replace />
}
