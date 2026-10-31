import { Navigate, Route, Routes } from 'react-router-dom'
import { Approvals } from '@/pages/Approvals'
import { Home } from '@/pages/Home'
import { Inbox } from '@/pages/Inbox'
import { Workspaces } from '@/pages/platform/Workspaces'
import { SettingsLayout } from '@/pages/settings/SettingsLayout'
import { Tasks } from '@/pages/Tasks'
import { WorkspaceLayout } from '@/pages/WorkspaceLayout'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/w/:wid" element={<WorkspaceLayout />}>
        <Route index element={<Navigate to="tasks" replace />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="tasks/:taskId?" element={<Tasks />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="settings/*" element={<SettingsLayout />} />
      </Route>
      <Route path="/platform/workspaces" element={<Workspaces />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
