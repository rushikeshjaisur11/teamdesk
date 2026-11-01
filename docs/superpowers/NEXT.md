# TeamDesk: status and what's next

Updated 2026-11-01. Read this first when resuming. The setup and admin guide is `docs/SETUP.md`; the product specs are in `specs/`.

## Built

| Area | What exists | Main files |
|---|---|---|
| Workspaces and roles | Isolated workspaces. Roles come from entitlement groups. Platform owners are admins in every workspace, but never in private spaces. | `access.py`, `workspaces.py`, `scoped.py` |
| Team tasks | Templates, auto-approve rules, approval queue (self-approval blocked), checklists, comments, audit log, and an Archived group | `tasks.py`, `approvals.py`, `rules.py`, `templates.py` |
| My space | Today, Inbox, My tasks, Waiting on, private notes, reminders, calendar feed, PWA share target | `me.py`, `calendar_feed.py` |
| Out of office | Away dates and a backup. Approval requests go to the backup; members see "Away until"; the 9:00 summary pauses. | `away.py` |
| Jira | Per-workspace connection (Cloud Basic / Data Center Bearer, encrypted). Create/Retry Jira; per-type template (project, extra fields, section to field); per-team status mapping synced by the worker; comments copied and tidied by AI. | `jira.py`, `crypto.py` |
| Teams | Channel connector with chosen events; personal reminders and the 9:00 summary through each person's Workflows webhook | `teams.py` |
| Docs | Folders, Markdown docs, search with snippets, version history, save conflict warning, templates | `docs.py`, `pages/Docs.tsx` |
| Meeting notes | Grouped by series. Upload a transcript (.vtt/.docx/.txt/.md) to get an AI summary and proposed tasks; ticked tasks become drafts. | `meetings.py`, `ai.py` |
| Excel | Import with column mapping (as drafts or submitted); export of the filtered task list | `excel.py`, `pages/ImportTasks.tsx` |
| Worker | Reminders, nudges, Teams summary, Jira status sync; safe with several replicas | `worker.py` |

## Next, in order

1. **My space AI** (my-space spec §6.2, §6.10-6.14, §8). Add the features as functions in `ai.py`, respect each person's `use_ai` switch, and mock every call in tests.
2. **Jira, the rest:**
   - auto-create on approve when Jira is connected;
   - background retry with backoff and an idempotency marker;
   - a Jira webhook for faster status;
   - the Jira mirror (own tickets; `jira.view_all` sees all);
   - per-user Jira accounts;
   - copying comments written before the issue existed.
3. **Docs, the rest:** rich-text editor, images, doc-to-task links, Confluence import, "Ask the docs" with citations and the Missing docs list (main spec §7.9).
4. **Smaller items:**
   - Meeting notes: match suggested owners to members.
   - Excel import: a Status column, and .csv.
   - The calendar feed's rate limit is per replica.
   - The 3-pin limit is racy.
   - Icons are SVG only.
   - PWA, SMTP and the worker are not verified on real OpenShift.

## Owner decisions to keep

- No sign-in screen yet; the stand-in user is `DEV_USER_*`. The owner connects company login (SSO) themselves: don't build it.
- Nobody can read another person's My space, admins included. Enforced in the app; no encryption at rest.
- AI reads a person's own items only when their "Use AI on my space" switch is on (the default). AI is configured by env only, never in the UI.
- Developer and tech tasks skip approval. Self-approval is always blocked (compliance). Out of office never lends approval rights; the backup must already be an approver.
- Jira is optional per workspace. Both Cloud and Data Center must work.
- Meeting transcripts are always uploaded by the user; TeamDesk does not connect to Teams to fetch them.
- UI:
  - every keyboard shortcut also has a button;
  - quick actions live in the top bar, not the sidebar;
  - hide settings people can't change;
  - done work stays visible in a struck-through Archived group;
  - body text is 15px.
- Stack: MongoDB 8.0.26 replica set, OpenShift, GitHub Enterprise, Microsoft Teams (Workflows webhooks).
- Every screen follows `.claude/skills/design-taste-frontend/references/app-screens.md` (style "Achromatic ledger") and passes `inspect.mjs --app` with 0 FAIL.
