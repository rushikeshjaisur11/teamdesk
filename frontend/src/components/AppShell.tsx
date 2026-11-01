import { Menu } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { BrandMark } from './BrandMark'

/**
 * Sidebar + main. >=1024px: full sidebar. 768–1023px: icon rail. <768px: sidebar in a drawer.
 * Pages that need a detail pane use SplitView inside main.
 */
export function AppShell({ sidebar, topbar, children }: {
  sidebar: (compact: boolean) => ReactNode
  topbar?: ReactNode
  children: ReactNode
}) {
  const [drawer, setDrawer] = useState(false)
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-16 shrink-0 md:flex lg:hidden">{sidebar(true)}</aside>
      <aside className="hidden w-60 shrink-0 lg:flex">{sidebar(false)}</aside>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-72 p-0" onClick={() => setDrawer(false)}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {sidebar(false)}
        </SheetContent>
      </Sheet>
      <div className="relative flex min-w-0 flex-1">
        <main className="@container flex min-w-0 flex-1 flex-col overflow-y-auto border-l bg-background">
          <div className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:px-6">
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" onClick={() => setDrawer(true)}>
              <Menu />
            </Button>
            <span className="md:hidden"><BrandMark /></span>
            {topbar}
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}

export { PageHeader } from './PageHeader'
