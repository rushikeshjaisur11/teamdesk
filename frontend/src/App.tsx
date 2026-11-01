import { Navigate, Route, Routes } from 'react-router-dom'
import { MyInbox } from '@/pages/me/MyInbox'
import { MyTasks } from '@/pages/me/MyTasks'
import { Today } from '@/pages/me/Today'
import { Waiting } from '@/pages/me/Waiting'
import { Approvals } from '@/pages/Approvals'
import { Docs } from '@/pages/Docs'
import { Meetings } from '@/pages/Meetings'
import { Home } from '@/pages/Home'
import { ShareTarget } from '@/pages/ShareTarget'
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
        <Route path="today" element={<Today />} />
        <Route path="inbox" element={<MyInbox />} />
        <Route path="tasks" element={<MyTasks />} />
        <Route path="waiting" element={<Waiting />} />
      </Route>
      <Route path="/w/:wid" element={<AppLayout />}>
        <Route index element={<Navigate to="tasks" replace />} />
        <Route path="inbox" element={<Navigate to="/me/inbox" replace />} />
        <Route path="tasks/:taskId?" element={<Tasks />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="docs/:docId?" element={<Docs />} />
        <Route path="meetings/:meetingId?" element={<Meetings />} />
        <Route path="settings/*" element={<SettingsLayout />} />
      </Route>
      <Route path="/share" element={<ShareTarget />} />
      <Route path="/platform" element={<AppLayout />}>
        <Route path="workspaces" element={<Workspaces />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
