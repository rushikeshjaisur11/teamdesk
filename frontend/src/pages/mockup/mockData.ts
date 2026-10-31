import type { TaskStatus } from '@/lib/types'

export type MockTask = {
  id: string; number: number; title: string; type: string; status: TaskStatus
  author: string; labels: string[]; updated: string; submitted?: string
  fields: [string, string][]
}

const F = (context: string, scope: string, ac: string): [string, string][] =>
  [['Context', context], ['Scope', scope], ['Acceptance criteria', ac]]

export const PEOPLE = ['Asha Rao', 'Vikram Nair', 'Priya Shah', 'Dan Morris', 'Meera Kulkarni']

export const MOCK_TASKS: MockTask[] = [
  { id: 't14', number: 14, title: 'Retry with backoff for the BigQuery loader', type: 'Story', status: 'pending_approval', author: 'Vikram Nair', labels: ['ingestion'], updated: '4 min ago', submitted: '4 min ago',
    fields: F('The nightly load fails about twice a week on transient 503s and someone reruns it by hand.', '- Wrap the load call in retry with exponential backoff (3 tries)\n- Log each retry with the job id', '- A simulated 503 on the first two attempts still loads the data\n- Retries show up in the job log') },
  { id: 't13', number: 13, title: 'Split the embeddings job by tenant', type: 'Spike', status: 'pending_approval', author: 'Priya Shah', labels: ['ai', 'performance'], updated: '22 min ago', submitted: '22 min ago',
    fields: [['Question to answer', 'Can we run one embeddings job per tenant without doubling cost?'], ['Timebox', '2 days'], ['Expected output', 'A one-page recommendation with cost numbers']] },
  { id: 't12', number: 12, title: 'Schema drift alert on the orders feed', type: 'Bug', status: 'pending_approval', author: 'Dan Morris', labels: ['pipeline'], updated: '1 h ago', submitted: '1 h ago',
    fields: [['Steps to reproduce', '1. Add a column upstream\n2. Run the orders job'], ['Expected', 'Job warns and continues'], ['Actual', 'Job fails with "Unrecognized field: discount_code"']] },
  { id: 't11', number: 11, title: 'Upgrade Airflow provider packages', type: 'Tech debt', status: 'approved', author: 'Meera Kulkarni', labels: ['deps'], updated: '2 h ago',
    fields: F('Provider versions are two majors behind and block the Python upgrade.', '- Bump google and http providers\n- Fix deprecated operator imports', '- All DAGs import cleanly in CI') },
  { id: 't10', number: 10, title: 'Document local setup for the ingestion service', type: 'Story', status: 'in_jira', author: 'Asha Rao', labels: ['docs'], updated: '3 h ago',
    fields: F('New joiners take a full day to get the service running.', '- Write the setup doc in Docs', '- A new joiner follows it without help') },
  { id: 't9', number: 9, title: 'Cost dashboard per pipeline', type: 'Story', status: 'in_progress', author: 'Vikram Nair', labels: ['finops'], updated: 'Yesterday',
    fields: F('We can see total cost but not which pipeline drives it.', '- Tag jobs with pipeline id\n- Build the dashboard', '- Top 10 pipelines by cost visible weekly') },
  { id: 't8', number: 8, title: 'Prompt caching for the summariser', type: 'Story', status: 'changes_requested', author: 'Priya Shah', labels: ['ai'], updated: 'Yesterday',
    fields: F('Summariser re-sends the same 6k-token system prompt on every call.', '- Cache the system prompt', '- Token spend drops measurably on the replay set') },
  { id: 't7', number: 7, title: 'Flaky test in the dedupe stage', type: 'Bug', status: 'draft', author: 'Dan Morris', labels: [], updated: 'Yesterday',
    fields: [['Steps to reproduce', 'Run the suite 10 times'], ['Expected', 'Always green'], ['Actual', 'Fails about 1 in 5']] },
  { id: 't6', number: 6, title: 'Move secrets to the vault', type: 'Tech debt', status: 'done', author: 'Meera Kulkarni', labels: ['security'], updated: 'Mon',
    fields: F('Two jobs still read credentials from env files.', '- Move both to the vault', '- No credentials in env files') },
  { id: 't5', number: 5, title: 'Retry logic for the BQ loader', type: 'Story', status: 'duplicate', author: 'Asha Rao', labels: ['ingestion'], updated: 'Mon',
    fields: F('Same as #14.', '-', '-') },
  { id: 't4', number: 4, title: 'Rewrite the scheduler in Rust', type: 'Spike', status: 'rejected', author: 'Dan Morris', labels: [], updated: 'Last week',
    fields: [['Question to answer', 'Would a rewrite be faster?'], ['Timebox', '2 weeks'], ['Expected output', 'Prototype']] },
  { id: 't3', number: 3, title: 'Alert routing for on-call', type: 'Story', status: 'snoozed', author: 'Vikram Nair', labels: ['ops'], updated: 'Last week',
    fields: F('Alerts go to a channel nobody watches at night.', '- Route P1 alerts to the on-call phone', '- A test P1 pages the on-call person') },
  { id: 't2', number: 2, title: 'Create Jira for data contract review', type: 'Story', status: 'jira_failed', author: 'Priya Shah', labels: ['governance'], updated: 'Last week',
    fields: F('Contracts change without review.', '- Add a review step', '- Every contract change has a reviewer') },
  { id: 't1', number: 1, title: 'Backfill March events', type: 'Tech debt', status: 'done', author: 'Asha Rao', labels: ['pipeline'], updated: 'Last week',
    fields: F('March events are missing after the outage.', '- Re-run the backfill for March', '- Row counts match the source') },
]

export const MOCK_ACTIVITY = [
  { who: 'Vikram Nair', what: 'created this task', when: '6 min ago' },
  { who: 'Vikram Nair', what: 'submitted for approval', when: '4 min ago' },
  { who: 'Asha Rao', what: 'commented', when: '2 min ago', text: 'Can we log the attempt number too? It helps when we read the job log later.' },
]

export function initials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2)
}
