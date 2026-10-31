import { Navigate } from 'react-router-dom'
import { lastWorkspace } from '@/lib/lastWorkspace'
import { useMe } from '@/lib/queries'
import { NoWorkspace } from './NoWorkspace'

export function Home() {
  const { data: me } = useMe()
  if (!me) return null
  const last = lastWorkspace()
  const target = me.workspaces.find((w) => w.id === last) ?? me.workspaces[0]
  return target ? <Navigate to={`/w/${target.id}/tasks`} replace /> : <NoWorkspace me={me} />
}
