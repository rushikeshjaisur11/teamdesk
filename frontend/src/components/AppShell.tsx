import { Menu } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { APP_NAME } from '@/lib/brand'

/**
 * Sidebar + main + optional right-hand detail pane.
 * >=1024px: full sidebar. 768–1023px: icon rail. <768px: sidebar in a drawer.
 * The pane sits beside the list on wide screens and overlays it below 1024px.
 */
export function AppShell({ sidebar, children, pane }: {
  sidebar: (compact: boolean) => ReactNode
  children: ReactNode
  pane?: ReactNode
}) {
  const [drawer, setDrawer] = useState(false)
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-16 shrink-0 border-r bg-card md:flex lg:hidden">{sidebar(true)}</aside>
      <aside className="hidden w-64 shrink-0 border-r bg-card lg:flex">{sidebar(false)}</aside>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-72 p-0" onClick={() => setDrawer(false)}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {sidebar(false)}
        </SheetContent>
      </Sheet>
      <div className="relative flex min-w-0 flex-1">
        <main className="@container flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="flex items-center gap-2 border-b px-4 py-2 md:hidden">
            <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setDrawer(true)}>
              <Menu />
            </Button>
            <span className="font-semibold">{APP_NAME}</span>
          </div>
          {children}
        </main>
        {pane && (
          <section
            aria-label="Details"
            className="absolute inset-0 z-20 flex flex-col overflow-y-auto border-l bg-card shadow-xl lg:static lg:z-auto lg:w-[30rem] lg:shrink-0 lg:shadow-none animate-in slide-in-from-right-4 fade-in duration-(--motion)"
          >
            {pane}
          </section>
        )}
      </div>
    </div>
  )
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-3 px-6 pt-6 pb-4">
      <h1 className="mr-auto text-xl font-semibold tracking-tight">{title}</h1>
      {children}
    </header>
  )
}
