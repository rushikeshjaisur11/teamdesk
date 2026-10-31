import { PageHeader } from '@/components/AppShell'

/** Stands in for a screen that a later task in this plan builds. */
export function Placeholder({ title }: { title: string }) {
  return <PageHeader title={title} />
}
