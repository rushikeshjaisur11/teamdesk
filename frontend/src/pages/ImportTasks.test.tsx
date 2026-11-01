import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders, STORY_TEMPLATE } from '@/test/utils'
import { ImportTasks } from './ImportTasks'

it('reads the sheet, guesses the columns and imports', async () => {
  const fn = mockApi({
    'POST /api/w/w1/tasks/import/preview': { columns: ['Task', 'Kind', 'Context notes', 'Tags'], rows: [['Add retries', 'Story', 'flaky', 'etl']], total: 12 },
    'POST /api/w/w1/tasks/import': { created: 12, submitted: 0, drafts_missing_fields: [], skipped_empty: 0 },
  })
  renderWithProviders(<ImportTasks wid="w1" templates={[STORY_TEMPLATE]} open onOpenChange={() => {}} />)
  await userEvent.upload(screen.getByLabelText('Excel file'), new File(['x'], 'plan.xlsx'))
  expect(await screen.findByText('Add retries')).toBeInTheDocument()
  expect(screen.getByLabelText('Title')).toHaveValue('0')
  expect(screen.getByLabelText('Task type column')).toHaveValue('1')
  expect(screen.getByLabelText(/Labels column/)).toHaveValue('3')
  await userEvent.click(screen.getByRole('button', { name: 'Import 12 rows' }))
  const call = fn.mock.calls.find(([path]) => path === '/api/w/w1/tasks/import')!
  expect(call[1]!.json).toMatchObject({ filename: 'plan.xlsx', default_type: STORY_TEMPLATE.key, mapping: { title: 0, type: 1, labels: 3 } })
})
