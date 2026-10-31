import type { ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { PageHeader } from '@/components/AppShell'
import { useWorkspace } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { Audit } from './Audit'
import { General } from './General'
import { Members } from './Members'
import { Rules } from './Rules'
import { Templates } from './Templates'

const PAGES = [
  ['general', 'General'], ['members', 'Members and roles'], ['templates', 'Task types'],
  ['rules', 'Auto-approve rules'], ['audit', 'Audit log'],
] as const

export function SettingsLayout() {
  const { wid } = useWorkspace()
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-6 px-6 pb-10 md:flex-row">
        <nav aria-label="Settings" className="flex shrink-0 gap-1 overflow-x-auto md:w-52 md:flex-col">
          {PAGES.map(([path, label]) => (
            <NavLink key={path} to={`/w/${wid}/settings/${path}`} className={({ isActive }) => cn(
              'rounded-md px-3 py-1.5 whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground',
              isActive && 'bg-accent font-medium text-foreground')}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          <Routes>
            <Route index element={<Navigate to="general" replace />} />
            <Route path="general" element={<General />} />
            <Route path="members" element={<Members />} />
            <Route path="templates" element={<Templates />} />
            <Route path="rules" element={<Rules />} />
            <Route path="audit" element={<Audit />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}

export function Section({ title, description, children, actions }: {
  title: string; description?: ReactNode; children: ReactNode; actions?: ReactNode
}) {
  return (
    <section className="mb-8 rounded-lg border bg-card">
      <header className="flex flex-wrap items-start gap-3 border-b px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}
