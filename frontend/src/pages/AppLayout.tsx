import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, CalendarCheck, Hourglass, Inbox, Keyboard, ListChecks, ListTodo, Moon, Settings, Stamp, Sun, UserCog } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { BrandMark } from '@/components/BrandMark'
import { CommandPalette } from '@/components/CommandPalette'
import { NotificationBell } from '@/components/NotificationBell'
import { ProfileDialog } from '@/components/ProfileDialog'
import { QuickCapture } from '@/components/QuickCapture'
import { ShortcutSheet } from '@/components/ShortcutSheet'
import { Sidebar, type NavSection } from '@/components/Sidebar'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { rememberWorkspace } from '@/lib/lastWorkspace'
import { useApprovalCount, useItems, useProfile, useWorkspace } from '@/lib/queries'
import { currentTheme, setTheme } from '@/lib/theme'
import { useChord } from '@/lib/useChord'
import { useShortcut } from '@/lib/useShortcut'

/** The one shell for My space (/me/*) and the current team workspace (/w/:wid/*). */
export function AppLayout() {
  const { wid: urlWid } = useParams()
  const { wid, ws, me, can } = useWorkspace()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [theme, setT] = useState(currentTheme())
  const [help, setHelp] = useState(false)
  const [capture, setCapture] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const approvals = useApprovalCount(wid, can('task.approve'))
  const ideas = useItems({ kind: 'idea' })
  const profile = useProfile()
  const syncTz = useMutation({
    mutationFn: (tz: string) => api('/api/me/profile', { method: 'PATCH', json: { tz } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })

  useShortcut('?', () => setHelp(true))
  useChord('g', 't', () => navigate('/me/today'))
  useChord('g', 'm', () => navigate('/me/tasks'))
  useChord('g', 'i', () => navigate('/me/inbox'))
  useChord('g', 'w', () => navigate('/me/waiting'))
  useEffect(() => { if (ws) rememberWorkspace(ws.id) }, [ws])
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  useEffect(() => {
    if (profile.data && browserTz && profile.data.tz !== browserTz) syncTz.mutate(browserTz)
  }, [profile.data?.tz, browserTz]) // eslint-disable-line react-hooks/exhaustive-deps

  if (me && urlWid && !ws) return <Navigate to="/me/today" replace />
  if (!me) return null

  const sections: NavSection[] = [
    {
      label: 'My space',
      items: [
        { to: '/me/today', label: 'Today', icon: CalendarCheck },
        { to: '/me/inbox', label: 'Inbox', icon: Inbox, count: ideas.data?.length },
        { to: '/me/tasks', label: 'My tasks', icon: ListChecks },
        { to: '/me/waiting', label: 'Waiting on', icon: Hourglass },
      ],
    },
    ...(ws ? [{
      label: 'Team',
      top: <WorkspaceSwitcher me={me} wid={wid} compact={false} />,
      items: [
        { to: `/w/${wid}/tasks`, label: 'Tasks', icon: ListTodo },
        ...(can('task.approve') ? [{ to: `/w/${wid}/approvals`, label: 'Approvals', icon: Stamp, count: approvals.data?.count }] : []),
        ...(can('settings.manage') ? [{ to: `/w/${wid}/settings`, label: 'Settings', icon: Settings }] : []),
      ],
    }] : me.user.is_platform_owner ? [{ label: 'Team', items: [{ to: '/platform/workspaces', label: 'Create a workspace', icon: Building2 }] }] : []),
  ]

  const toggleTheme = () => { const t = theme === 'dark' ? 'light' : 'dark'; setTheme(t); setT(t) }
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
          sections={compact ? sections.map((s) => ({ items: s.items })) : sections}
          header={
            <div className={compact ? 'flex justify-center' : 'flex items-center justify-between pl-1'}>
              <BrandMark withName={!compact} />
              {!compact && ws && <NotificationBell wid={wid} />}
            </div>
          }
          footer={
            <div className={compact ? 'flex flex-col items-center gap-1' : 'flex items-center gap-1 rounded-md p-1'}>
              {!compact && <span className="min-w-0 flex-1 truncate px-1" title={me.user.email}>{me.user.name}</span>}
              {iconButton('My settings', () => setSettingsOpen(true), <UserCog />)}
              {iconButton('Keyboard shortcuts', () => setHelp(true), <Keyboard />)}
              {iconButton(theme === 'dark' ? 'Use light theme' : 'Use dark theme', toggleTheme, theme === 'dark' ? <Sun /> : <Moon />)}
            </div>
          }
        />
      )}
    >
      <Outlet />
      <ShortcutSheet open={help} onOpenChange={setHelp} />
      <ProfileDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <QuickCapture open={capture} onOpenChange={setCapture} />
      {ws && <CommandPalette onNewTask={() => navigate(`/w/${wid}/tasks?new=1`)} onCapture={() => setCapture(true)} />}
    </AppShell>
  )
}
