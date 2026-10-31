import { Navigate, Route, Routes } from 'react-router-dom'
import { Home } from '@/pages/Home'
import { Login } from '@/pages/Login'
import { Placeholder } from '@/pages/Placeholder'
import { Tasks } from '@/pages/Tasks'
import { WorkspaceLayout } from '@/pages/WorkspaceLayout'
import { MockApprovals } from '@/pages/mockup/MockApprovals'
import { MockDocs } from '@/pages/mockup/MockDocs'
import { MockTasks } from '@/pages/mockup/MockTasks'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Home />} />
      <Route path="/w/:wid" element={<WorkspaceLayout />}>
        <Route index element={<Navigate to="tasks" replace />} />
        <Route path="inbox" element={<Placeholder title="Inbox" />} />
        <Route path="tasks/:taskId?" element={<Tasks />} />
        <Route path="approvals" element={<Placeholder title="Approvals" />} />
        <Route path="settings/*" element={<Placeholder title="Settings" />} />
      </Route>
      <Route path="/platform/workspaces" element={<Placeholder title="Workspaces" />} />
      <Route path="/mockup/tasks" element={<MockTasks />} />
      <Route path="/mockup/approvals" element={<MockApprovals />} />
      <Route path="/mockup/docs" element={<MockDocs />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
