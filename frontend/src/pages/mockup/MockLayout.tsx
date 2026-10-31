import { Bell, BookOpen, ChartColumn, ChevronsUpDown, Inbox, ListTodo, Moon, Settings, Stamp, Sun } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { AppShell } from '@/components/AppShell'
import { Sidebar } from '@/components/Sidebar'
import { Button } from '@/components/ui/button'
import { currentTheme, setTheme } from '@/lib/theme'

export function MockLayout({ children, pane, approvals = 3 }: { children: ReactNode; pane?: ReactNode; approvals?: number }) {
  const [theme, setT] = useState(currentTheme())
  const toggle = () => { const t = theme === 'dark' ? 'light' : 'dark'; setTheme(t); setT(t) }
  const items = [
    { to: '/mockup/inbox', label: 'Inbox', icon: Inbox, count: 0 },
    { to: '/mockup/tasks', label: 'Tasks', icon: ListTodo },
    { to: '/mockup/approvals', label: 'Approvals', icon: Stamp, count: approvals },
    { to: '/mockup/docs', label: 'Docs', icon: BookOpen },
    { to: '/mockup/dashboard', label: 'Dashboard', icon: ChartColumn },
    { to: '/mockup/settings', label: 'Settings', icon: Settings },
  ]
  return (
    <AppShell
      pane={pane}
      sidebar={(compact) => (
        <Sidebar
          compact={compact}
          items={items}
          header={
            <div className="flex items-center gap-1">
              <button className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-2 text-left hover:bg-accent" aria-label="Switch workspace">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">DP</span>
                {!compact && <><span className="flex-1 truncate font-semibold">Data Platform</span><ChevronsUpDown className="size-4 text-muted-foreground" /></>}
              </button>
              {!compact && <Button variant="ghost" size="icon" aria-label="Notifications, 2 unread" className="relative"><Bell /><span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" /></Button>}
            </div>
          }
          footer={
            <div className={compact ? 'flex flex-col items-center gap-1' : 'flex items-center gap-2 rounded-md p-2'}>
              <span className="grid size-7 place-items-center rounded-full bg-secondary text-xs font-semibold">AR</span>
              {!compact && <span className="flex-1 truncate">Asha Rao</span>}
              <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}>
                {theme === 'dark' ? <Sun /> : <Moon />}
              </Button>
            </div>
          }
        />
      )}
    >
      {children}
    </AppShell>
  )
}
