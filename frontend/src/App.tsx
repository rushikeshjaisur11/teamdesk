import { Navigate, Route, Routes } from 'react-router-dom'
import { MockApprovals } from '@/pages/mockup/MockApprovals'
import { MockDocs } from '@/pages/mockup/MockDocs'
import { MockTasks } from '@/pages/mockup/MockTasks'

export default function App() {
  return (
    <Routes>
      <Route path="/mockup/tasks" element={<MockTasks />} />
      <Route path="/mockup/approvals" element={<MockApprovals />} />
      <Route path="/mockup/docs" element={<MockDocs />} />
      <Route path="*" element={<Navigate to="/mockup/tasks" replace />} />
    </Routes>
  )
}
