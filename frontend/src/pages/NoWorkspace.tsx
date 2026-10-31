import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import type { Me } from '@/lib/types'

export function NoWorkspace({ me }: { me: Me }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background">
      <EmptyState
        title="You're not in a workspace yet"
        body={me.user.is_platform_owner
          ? 'Create a workspace for a team and choose which group administers it.'
          : 'Ask your manager to add one of your access groups to a TeamDesk workspace, then reload this page.'}
        action={me.user.is_platform_owner
          ? <Button render={<Link to="/platform/workspaces" />}>Create a workspace</Button>
          : undefined}
      />
    </main>
  )
}
