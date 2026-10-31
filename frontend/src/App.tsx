import { Navigate, Route, Routes } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Approvals } from '@/pages/Approvals'
import { Home } from '@/pages/Home'
import { Inbox } from '@/pages/Inbox'
import { Workspaces } from '@/pages/platform/Workspaces'
import { SettingsLayout } from '@/pages/settings/SettingsLayout'
import { Tasks } from '@/pages/Tasks'
import { AppLayout } from '@/pages/AppLayout'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/me" element={<AppLayout />}>
        <Route index element={<Navigate to="today" replace />} />
        <Route path="today" element={<PageHeader title="Today" />} />
        <Route path="inbox" element={<PageHeader title="Inbox" />} />
        <Route path="tasks" element={<PageHeader title="My tasks" />} />
        <Route path="waiting" element={<PageHeader title="Waiting on" />} />
      </Route>
      <Route path="/w/:wid" element={<AppLayout />}>
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
