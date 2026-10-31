import { useQueryClient } from '@tanstack/react-query'
import { Inbox, Keyboard, ListTodo, LogOut, Moon, Settings, Stamp, Sun } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { ShortcutSheet } from '@/components/ShortcutSheet'
import { Sidebar, type NavItem } from '@/components/Sidebar'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { rememberWorkspace } from '@/lib/lastWorkspace'
import { useApprovalCount, useWorkspace } from '@/lib/queries'
import { currentTheme, setTheme } from '@/lib/theme'
import { useShortcut } from '@/lib/useShortcut'

export function WorkspaceLayout() {
  const { wid, ws, me, can } = useWorkspace()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [theme, setT] = useState(currentTheme())
  const [help, setHelp] = useState(false)
  const approvals = useApprovalCount(wid, can('task.approve'))
  useShortcut('?', () => setHelp(true))
  useEffect(() => { if (ws) rememberWorkspace(ws.id) }, [ws])

  if (me && !ws) return <Navigate to="/" replace />
  if (!me || !ws) return null

  const items: NavItem[] = [
    ...(can('task.create') ? [{ to: `/w/${wid}/inbox`, label: 'Inbox', icon: Inbox }] : []),
    { to: `/w/${wid}/tasks`, label: 'Tasks', icon: ListTodo },
    ...(can('task.approve') ? [{ to: `/w/${wid}/approvals`, label: 'Approvals', icon: Stamp, count: approvals.data?.count }] : []),
    ...(can('settings.manage') ? [{ to: `/w/${wid}/settings`, label: 'Settings', icon: Settings }] : []),
  ]

  const toggleTheme = () => { const t = theme === 'dark' ? 'light' : 'dark'; setTheme(t); setT(t) }
  const signOut = async () => { await api('/api/auth/logout', { method: 'POST' }); qc.clear(); navigate('/login') }
  const iconButton = (label: string, onClick: () => void, icon: ReactNode) => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label={label} onClick={onClick} />}>{icon}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )

  return (
    <AppShell
      sidebar={(compact) => (
        <Sidebar
          compact={compact}
          items={items}
          header={
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1"><WorkspaceSwitcher me={me} wid={wid} compact={compact} /></div>
            </div>
          }
          footer={
            <div className={compact ? 'flex flex-col items-center gap-1' : 'flex items-center gap-1 rounded-md p-1'}>
              {!compact && <span className="min-w-0 flex-1 truncate px-1" title={me.user.email}>{me.user.name}</span>}
              {iconButton('Keyboard shortcuts', () => setHelp(true), <Keyboard />)}
              {iconButton(theme === 'dark' ? 'Use light theme' : 'Use dark theme', toggleTheme, theme === 'dark' ? <Sun /> : <Moon />)}
              {iconButton('Sign out', signOut, <LogOut />)}
            </div>
          }
        />
      )}
    >
      <Outlet />
      <ShortcutSheet open={help} onOpenChange={setHelp} />
    </AppShell>
  )
}
