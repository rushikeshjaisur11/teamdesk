# TeamDesk — Design

Date: 2026-10-31 · Status: draft for approval · Name "TeamDesk" is a placeholder (builder's call, easy to rename)

## 1. Intent and why

Our engineering teams do AI-assisted coding, so work finishes fast and the task backlog is large. Today four things waste time:

1. **Waiting for a Jira key.** Work is only tracked, and PRs can only be merged, once a Jira ticket exists. Developers either wait for a BA to create it or stop to write it themselves.
2. **Lost ideas.** Thoughts that come up between meetings get forgotten because there is no fast place to capture them.
3. **Inconsistent tickets.** Tickets written by different people don't follow the team standard.
4. **No shared task list.** The manager keeps the team's task list in Excel, which is always stale and not shared.
5. **Scattered knowledge.** Setup guides and important docs live in Confluence, which hardly anyone uses. When someone is stuck they wait, or search many places, instead of finding the answer.

TeamDesk is one internal web app, shared by many teams, where each team has an isolated **workspace** containing:

- a **central task list** that anyone on the team (manager or member) can add to,
- an **approval queue** where approvers accept or reject tasks; approval **automatically creates the Jira ticket** in the team's standard format,
- a **private idea inbox** for 5-second capture,
- a **docs space** with folders (Confluence-like) and **one search box** across tasks, docs and Jira keys,
- AI help (Vertex AI / Gemini): draft a standard ticket from a description, answer questions from docs, detect duplicates, turn meeting notes into draft tasks.

**Success looks like:** a developer goes from idea to a Jira key and branch in under a minute without waiting on anyone; the manager's Excel is retired; a new joiner sets up a project from the docs without pinging anyone.

## 2. Goals

- G1. Any workspace member can capture an idea in under 5 seconds and turn it into a task later.
- G2. A task's path from "submitted" to "Jira key exists" is minutes, not days. Auto-approve rules let low-risk tasks skip the human queue.
- G3. Every Jira ticket created through TeamDesk follows the workspace's ticket template.
- G4. The task list is the single, always-current view of the team's work (Jira status syncs back).
- G5. Team docs live in one place, organised in folders, and are findable through one search box together with tasks.
- G6. Multiple teams share one deployment with strictly isolated data.
- G7. The UI is genuinely good: fast, calm, keyboard-friendly, consistent, accessible (see §10).

## 3. Non-goals (v1)

- Replacing Jira for delivery tracking (sprints, boards, story points burn-down, time tracking). Jira stays the system of record once a ticket exists.
- Cross-workspace search or an org-wide shared space.
- Native mobile apps (responsive web down to tablet width is enough; phone is "usable, not optimised").
- AI configuration in the UI. AI is configured only through environment variables (§8).
- Two-way editing of Jira tickets from TeamDesk after creation (we read status back; edits happen in Jira).
- Real-time collaborative editing of docs (last-save-wins with a conflict warning is enough).

## 4. Anti-goals (failure even if it "works")

- **A second Confluence nobody uses.** If writing or finding a doc is slower than asking a teammate, we failed.
- **More waiting than today.** If the approval step makes developers wait longer than a BA creating a ticket did, we failed. Auto-approve rules and a fast, keyboard-driven approval queue exist to prevent this.
- **Data leaking between workspaces.** One team seeing another team's tasks, docs or tokens is a critical failure.
- **AI acting without a human.** AI never creates a Jira ticket or publishes a doc on its own; a person always confirms.
- **AI making things up.** "Ask the docs" must say "not found" rather than invent an answer, and always show sources.

## 5. Constraints

- **Hosting:** OpenShift. Containers only.
- **Database:** MongoDB (chosen over Oracle). The MongoDB version is unknown and may be old. Use only features available in MongoDB **4.4+** (text indexes, aggregation). Do not depend on Atlas Search, `mongot`, or vector indexes. Oracle is not used.
- **No multi-document transactions** (designer's call): the server may be standalone, not a replica set. Jira-create idempotency, job claiming and doc version history are built on single-document atomic operations (`find_one_and_update`, unique indexes). Phase 1 starts by checking the real server version (`db.version()`) against the chosen PyMongo release's supported-server range.
- **AI:** Vertex AI via the standard API key (`google-genai`, `genai.Client(vertexai=True, api_key=...)`). Production will go through an internal auth proxy; the owner will wire that themselves later, so **all AI calls must live in one module** that is easy to edit.
- **Python driver:** use the **PyMongo Async API** (`AsyncMongoClient`). Motor is deprecated (bug fixes ended May 2026).
- **Identity:** access and roles come from company **entitlement groups**. **Company sign-in is deferred — the owner will add it later.** Until then the app uses a simple sign-in form (name, email, groups) that creates the same session a real login will; all sign-in goes through one `sign_in(request, user)` function so the real login slots in without touching anything else.
- **Jira:** may be Jira Cloud or Jira Data Center — support both. Use REST API v2 (`/rest/api/2/issue`) which works on both; Cloud auth = email + API token (Basic), Data Center auth = Personal Access Token (Bearer).
- **GitHub:** may be github.com or GitHub Enterprise Server — base URL is configurable.

## 6. Users, roles and access

- **Platform owner** (set by env var / group, above all workspaces): creates and archives workspaces, assigns each workspace's first admin. Cannot read workspace content (tasks, docs) — only names, member counts and admins.
- **Workspace roles** — shipped defaults, editable per workspace:
  - **Admin:** everything, including settings, connections, roles, templates.
  - **Approver:** approve / reject / request changes / mark duplicate; everything a Member can do.
  - **Member:** create and edit own tasks, comment, create and edit docs.
  - **Viewer:** read-only.
- **Permissions are a matrix** (role × permission) editable by workspace admins. Permissions at minimum: `task.view`, `task.create`, `task.edit_any`, `task.approve`, `jira.view_all`, `doc.edit`, `doc.manage_folders`, `settings.manage`, `connections.manage`, `roles.manage`. `jira.view_all` (default: Admin and Approver) is the "manager" permission for seeing every Jira ticket (§7.5).
- **Group → role mapping per workspace:** a workspace admin maps company entitlement groups to roles (e.g. `grp-data-eng-approvers → Approver`). Membership is derived from the user's groups at sign-in — no manual user management. A user may belong to many workspaces with different roles, and switches via a workspace switcher.
- **Interim sign-in** (until company login is added): a form with name, email and groups, enabled by env var `DEV_LOGIN_ENABLED`. It is not secure and must not be exposed outside the company network.

## 7. Features and flows

### 7.1 Idea inbox (private capture)
- Global shortcut (e.g. `C` or `Ctrl+Shift+I`) opens a one-line capture box from anywhere; Enter saves.
- Ideas are private to their author until promoted to a task. Promote = opens the task form prefilled.

### 7.2 Create a task
- Fields come from the workspace's **ticket template for the chosen task type** (bug, story, spike, tech-debt — types are configurable). Template defines: Jira issue type, summary pattern hint, description sections (e.g. Context / Scope / Acceptance criteria / Out of scope), required fields, default labels/components, and Jira field mapping.
- If AI is enabled, a **"Draft with AI"** button turns a free-text description into the template's fields; the author reviews and edits before submitting.
- Before submit, a **possible-duplicates** panel shows similar existing tasks (keyword match always; meaning-based match when AI is on).
- Submit → status `pending_approval`, unless an **auto-approve rule** matches.

### 7.3 Auto-approve rules
- Per workspace, admin-defined: conditions on task type, author role, labels (e.g. "Members' tech-debt tasks auto-approve"). Matching tasks go straight to `approved` and create the Jira ticket immediately. The rule that fired is recorded in the audit log.
- **Developer tasks skip the queue by default** (owner's decision): every new workspace is seeded with an enabled rule "Developer tasks skip the queue" matching author role `member`. Admins can narrow or disable it.
- **Compliance:** having a Jira key before merge is a compliance control. Therefore **self-approval is always blocked** (an approver cannot approve their own task; there is no setting to allow it), only admins can change rules, and every rule change and rule firing is in the audit log.

### 7.4 Approval queue
- List of `pending_approval` tasks, oldest first, with a detail pane.
- Actions: **Approve**, **Reject** (reason required), **Request changes** (comment required), **Mark duplicate** (pick the original), **Snooze** (until date).
- Keyboard: `A` approve, `R` reject, `C` request changes, `D` duplicate, `J/K` next/previous.
- Bulk approve for selected tasks.
- The requester is notified of every decision.

### 7.5 Jira creation and sync
- On approve, create the Jira issue from the template mapping; store the key and URL on the task; status → `in_jira`.
- Failures (auth, required field missing in Jira, network) put the task in `jira_failed` with the error shown in plain language and a **Retry** button. Creation is retried automatically a few times with backoff. Never create duplicates on retry (store an idempotency marker; check for an existing issue with that marker before re-creating).
- **Status back from Jira:** a Jira webhook updates the task's status; a periodic reconcile job (e.g. every 10 minutes) polls Jira for tasks whose status may have changed, in case webhooks can't reach OpenShift. Jira statuses map to TeamDesk statuses via a per-workspace mapping (`To Do → in_jira`, `In Progress → in_progress`, `Done → done`).
- **Jira identity** (owner's decision): tickets are created by the workspace's **service account** by default. A user may also **connect their own Jira account** (personal token, stored encrypted, per user per workspace); when the approved task's author has connected an account, the ticket is created as them, otherwise by the service account with the requester named in the description.
- **Jira tickets created outside TeamDesk are shown too** (owner's decision): each workspace mirrors its Jira project(s) via a configurable JQL query, polled by the worker. Mirrored tickets appear in the task list as read-only "From Jira" items that skip approval. Visibility: **a user sees only the Jira tickets where they are the assignee or reporter; users with `jira.view_all` (managers) see all.** TeamDesk users are matched to Jira users by email (on Jira Cloud, where email may be hidden by privacy settings, a user's connected account or a manual mapping in Settings links them). Tickets TeamDesk created are not duplicated by the mirror (matched by Jira key).
- Task statuses: `draft`, `pending_approval`, `changes_requested`, `approved`, `in_jira`, `jira_failed`, `in_progress`, `done`, `rejected`, `duplicate`, `snoozed`.

### 7.6 GitHub
- On a task that has a Jira key: **"Create branch"** creates `KEY-123-short-slug` from the default branch of a chosen repo (repos configured per workspace).
- PR status (open / merged / closed, checks) is shown on the task, matched by Jira key in branch name or PR title (webhook + periodic poll).
- Settings shows a copy-paste **GitHub Actions workflow** that fails a PR without a Jira key in title or branch, to be made a required status check in branch protection.

### 7.7 Docs space
- Folder tree (nested folders) per workspace; docs are Markdown with a good rich-text editing experience (WYSIWYG that stores Markdown), code blocks with syntax highlighting, images (stored in MongoDB GridFS or object storage — builder's call), and doc-to-task links in both directions.
- Version history per doc (who, when, view/restore). Last-save-wins with a warning if someone else saved since you opened it.
- **Confluence import:** one-time import of a Confluence space (via the Confluence REST API or an HTML export zip), preserving page hierarchy as folders.
- Doc templates (e.g. "Project setup", "Runbook").

### 7.8 One search box
- `Ctrl+K` opens a command palette that searches tasks, docs, ideas (own only) and Jira keys within the current workspace, and also runs commands (new task, go to approvals, switch workspace).
- Keyword search uses MongoDB text indexes. Typing a Jira key jumps straight to its task.
- When AI is on, results are re-ranked by meaning (§8).

### 7.9 Ask the docs (AI)
- A question box on the docs space. Answers are built only from the workspace's docs, always cite source docs with links, and say "I couldn't find this in your docs" when there's no good match.
- Unanswered questions are logged; admins see a "Missing docs" list and can turn a question into a task in one click.

### 7.10 Meeting notes → tasks (AI)
- Paste notes or a transcript; AI proposes several draft tasks (with suggested assignee if names match members). The user ticks which to keep; kept ones become drafts in the author's inbox. Nothing is submitted automatically.

### 7.11 Notifications
- In-app notification centre (bell) for: decisions on my tasks, comments, mentions, Jira creation failures, tasks waiting for my approval.
- Email via SMTP (configured by env vars, install-wide).
- Optional per-workspace **Microsoft Teams** connection for posting decisions to a channel. Office 365 connectors (the old "Incoming Webhook") were retired in 2026; use a **Teams Workflows webhook** URL and post **Adaptive Card** payloads.

### 7.12 Excel import / export
- One-time import of the manager's existing sheet: upload `.xlsx`, map columns to task fields, preview, import.
- Export any filtered task list to `.xlsx`.

### 7.13 Dashboard
- Per workspace: open tasks by status, approval wait time (median), tasks created vs done per week, tasks per person, Jira failures.

### 7.14 Activity and audit
- Every task has an activity timeline (created, edited, approved by X, Jira created, status changes, comments).
- Workspace audit log for admin actions (settings changes, role mapping changes, connection changes, auto-approve firings).

## 8. AI

- Configured **only by environment variables**, install-wide; no AI settings in the UI:
  - `AI_ENABLED` (true/false), `VERTEX_API_KEY`, `GEMINI_MODEL` (default `gemini-2.5-flash`), `EMBEDDING_MODEL`.
- When `AI_ENABLED=false`, every AI button and panel is hidden and every flow still works manually.
- **All AI calls live in one module** (e.g. `backend/app/ai.py`) exposing a small set of functions: `draft_ticket(template, text)`, `embed(texts)`, `answer(question, passages)`, `split_meeting_notes(text, members)`. The owner will replace the client creation with their proxy binding; nothing else should construct AI clients.
- Ticket drafting uses structured (JSON schema) output so the result maps directly onto template fields.
- **Embeddings without a vector database:** store embedding vectors on task and doc-chunk documents; similarity is computed in Python over the current workspace's vectors (pre-filtered by workspace). This is fine up to roughly tens of thousands of items per workspace; the upgrade path is MongoDB 8.2+ vector search. Mark this ceiling in code.
- AI failures (timeout, quota) degrade gracefully: show "AI unavailable, continue manually", never block a flow.

## 9. Connections (Settings → Connections, per workspace)

- **Jira:** base URL, Cloud vs Data Center, credentials, default project, issue-type mapping per task type, field mapping, status mapping, **Test connection** button showing exactly what failed.
- **GitHub:** base URL (github.com or Enterprise), token or GitHub App, repos to link, **Test connection**.
- **Microsoft Teams:** Workflows webhook URL, **Send test message**.
- **Per-user Jira account** (in the user's own profile, not workspace settings): personal access token (Data Center) or email + API token (Cloud), **Test connection**.
- **Confluence:** used only for import; base URL + credentials, **Test connection**.
- Secrets are encrypted at rest with a key from an environment variable, never returned to the browser after saving (show "•••• saved, replace").

## 10. UI direction — "very good" is a requirement

Reference feel: Linear-like calm and speed, applied to an internal tool. Not a generic admin template.

- **Layout:** left sidebar (workspace switcher, Inbox, Tasks, Approvals with a count badge, Docs tree, Dashboard, Settings); main content; detail panes slide in from the right rather than navigating away. `Ctrl+K` command palette everywhere.
- **Visual system:** one design-token set (colours, type scale, spacing, radius, shadow) used everywhere; light and dark themes from day one; base font size 15px with comfortable line height (owner prefers larger fonts); one accent colour; status colours used consistently across badges, timeline and dashboard.
- **Speed:** optimistic updates for approve/reject/edit; skeleton loaders, never spinners on whole pages; lists virtualised when long; target interactions feel instant (<100 ms UI response).
- **Keyboard first:** every frequent action has a shortcut; `?` shows the shortcut sheet.
- **Helpful empty states:** each empty screen says what it's for and offers the one action to start (e.g. empty Docs → "Import from Confluence" / "New doc from template").
- **Feedback:** toasts with **Undo** for reversible actions (reject, delete, move); plain-language errors that say what to do next.
- **Accessibility:** WCAG 2.2 AA contrast in both themes, visible focus rings, full keyboard navigation, proper labels, respects reduced-motion.
- **Responsive:** fully usable down to tablet width; phone works for capture, approve and reading docs.
- **Motion:** subtle and quick (≤200 ms), only to show where things came from/went.
- **Before building screens, the builder produces a clickable mockup** of the three key screens — Task list + detail pane, Approval queue, Docs space with search — for the owner to approve.

Screen list: Sign-in · Workspace switcher · Inbox · Task list (filters, saved views, grouping by status/assignee) · Task detail pane · New task form (template-driven, AI draft) · Approval queue · Docs space (tree + editor + ask box) · Search palette · Notifications · Dashboard · Settings: General, Members & roles (group mapping, permission matrix), Templates & task types, Auto-approve rules, Jira status mapping, Connections, Audit log · Platform owner: Workspaces.

## 11. Architecture and tech stack (builder's calls already made by the designer)

- **Backend:** Python, FastAPI, PyMongo Async API, Pydantic models. One container image used for two deployments: `api` and `worker`.
- **Worker:** background jobs (Jira create/retry, Jira/GitHub reconcile polling, embeddings, notifications, Confluence import) via a simple jobs collection in MongoDB polled by the worker. No extra queue infrastructure.
- **Frontend:** React + TypeScript + Vite; Tailwind CSS with shadcn/ui (Radix primitives, accessible); TanStack Query for data, TanStack Table for lists; `cmdk` for the command palette; a Markdown-backed rich editor (e.g. TipTap). Served as static files by a small container (or by FastAPI).
- **Workspace isolation is enforced in one data-access layer:** every repository method requires a `workspace_id` and adds it to the query filter; there is no code path that queries workspace data without it. An automated test suite proves a user of workspace A cannot read or change anything in workspace B through any API endpoint.
- **Config:** environment variables (OpenShift ConfigMap + Secret) for install-wide settings (DB URI, encryption key, SMTP, AI, identity provider, platform owner group). Everything per-team lives in the database and is edited in Settings.
- **Deliverables include** a Dockerfile per image and OpenShift manifests (Deployment, Service, Route, ConfigMap, Secret template) plus a README covering setup.

## 12. Build order

1. **Foundation:** sign-in, workspaces, roles and group mapping, settings shell, design system and app shell, isolation tests.
2. **Tasks:** idea inbox, templates and task types, task list and detail, approval queue, auto-approve rules, activity timeline, notifications (in-app + email).
3. **Jira:** connection settings, ticket creation with retry, status sync (webhook + reconcile).
4. **GitHub:** connection, branch creation, PR status, Actions snippet.
5. **Docs:** folders, editor, history, doc–task links, search palette across tasks and docs, Confluence import.
6. **AI:** ticket drafting, duplicate detection, ask the docs, meeting notes → tasks.
7. **Extras:** Excel import/export, dashboard, Teams/Slack webhooks.

Each phase ends with a working, demoable app.

## 13. Decisions on the open questions

Owner's answers (2026-10-31):

1. **Sign-in:** deferred; owner adds company login later (§5, §6).
2. **Jira tickets created outside TeamDesk:** shown; users see their own, managers (`jira.view_all`) see all (§7.5).
3. **Developer tasks skip the queue** by default; Jira-key-before-merge is a **compliance control**, so self-approval is always blocked (§7.3).
4. **Jira identity:** service account by default, or the user's connected Jira account (§7.5, §9).
5. **Jira Cloud and Jira Data Center are both in use** — both must work from the first Jira release (per-workspace choice). **GitHub Enterprise Server.** **Microsoft Teams.** **MongoDB is a replica set** (transactions are available, but the design keeps single-document atomic operations; no change needed).

Designer's calls (can be changed):
- "Developer tasks" = tasks authored by someone whose role is `member` (the seeded rule's condition).
- The mirror's visibility rule applies to Jira tickets only; TeamDesk tasks stay visible to the whole workspace (it's the shared task list).
- Polling is the primary Jira/GitHub sync; webhooks are an optional speed-up.

## 14. Left to the builder

Exact data schema, API shape, folder structure, editor library choice, image storage choice, job polling interval, retry counts, test framework, exact visual design within §10 (subject to mockup approval).
