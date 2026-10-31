# TeamDesk — My space, productivity and AI (design addendum)

Date: 2026-10-31 · Status: draft for approval · Extends `2026-10-31-teamdesk-design.md` (the "main spec"); where they differ, this document wins.

## 1. Intent and why

Thoughts get lost between meetings, and a team list is the wrong place for half-formed ideas and personal to-dos. Every person needs a private space that captures anything in seconds, reminds them at the right time, and turns an item into a team task when it is ready. AI removes the typing: it reads plain text, meeting notes and activity, and drafts the structure.

The owner also reframed the product (2026-10-31): **TeamDesk is a task tool first; Jira is optional.** A team task is named work. Jira appears only as an action ("Create Jira ticket") once a workspace has connected Jira.

## 2. Goals

- G1. Each person has **My space**: private tasks, ideas, "waiting on" items, a Today view, reminders.
- G2. **Nobody can read another person's private space** — not workspace admins, not platform owners — enforced by the API, not just the UI.
- G3. Capture from anywhere in under 5 seconds (keyboard, installed app share sheet), and AI turns plain text into a structured item.
- G4. Nothing is forgotten silently: reminders, roll-over of unfinished Today items, follow-up nudges, a weekly review.
- G5. AI helps with: understanding captures, drafting team tickets, meeting notes → action items, morning brief, duplicates by meaning, breaking tasks into steps, standup drafts, weekly review grouping, and a weekly team summary for managers.
- G6. Jira is optional per workspace (main spec §7.5 changes, §9 below).

## 3. Non-goals (this addendum)

- Sharing a private item with a specific colleague (it becomes a team task instead).
- Calendar two-way sync (the feed is read-only).
- Offline editing (the installed app needs a connection).
- Native mobile apps (the installed web app covers phones).
- AI acting on its own: AI only drafts; a person always confirms before anything is created, sent or merged.

## 4. Anti-goals

- **A leak of private items** through any path: search, notifications, AI prompts, audit log, calendar feed, admin screens, exports, error messages.
- **Notification spam.** Every reminder and nudge is something the user set or agreed to; the morning brief is shown in the app, not pushed.
- **AI that invents.** Drafts say "not sure" rather than guessing dates or people; every AI result is editable before saving.

## 5. Access model

- **Personal data is owned by one user (`owner_sub`) and is not inside a workspace.** It lives in its own collections and is reached only through a `Personal` data layer that always filters by the signed-in user's `sub` (the same pattern as `Scoped`, keyed by owner instead of workspace). No endpoint accepts another user's id for personal data. No role or permission grants access to it.
- Personal routes are `/api/me/...`. Workspace routes stay `/api/w/{wid}/...`.
- A personal item may **link** to a team task (a reminder about it, a private note on it). The link stores `workspace_id` + `task_id`; reading the linked task still goes through the workspace permission check, so losing access to the workspace hides the task, not the user's own note.
- Audit log entries never contain personal content. Notifications about personal items go only to their owner.
- Isolation tests (like the workspace ones) prove user A cannot read, change, search, or receive notifications for user B's personal data through any endpoint, including as an admin and a platform owner.

## 6. Features

### 6.1 Items (the core of My space)
One collection of personal items. Kinds:
- **task** — a private to-do: title, notes (Markdown subset), due date (optional, with optional time), checklist, recurrence, labels.
- **idea** — a captured thought (replaces the workspace-scoped idea inbox from Phase 2; existing workspace ideas are migrated to the owner's personal ideas).
- **waiting** — something waiting on someone else: what, who (free text or a workspace member), since, "nudge me after N days".

Common fields: status `open | done | dropped`, `today_on` (date pinned to Today), `remind_at`, `link` (workspace task), `promoted_to` (workspace + task when turned into a team task), timestamps.

### 6.2 Capture
- `I` anywhere (and the palette's "Capture") opens one line. Enter saves to the Inbox as an idea.
- With AI on, the line is parsed: "fix flaky dedupe test by friday #bug" → task, title "Fix flaky dedupe test", due Friday, label bug. The parse is shown as editable chips before saving; Shift+Enter saves as typed.
- The installed app (PWA) registers as a **share target**: sharing text or a link from another app opens capture prefilled.

### 6.3 Today
- One screen answering "what do I do now?", in this order:
  1. **Morning brief** (AI, once per day, first open; cached): 3–5 sentences — what's due, what's waiting on you, what's gone stale.
  2. **Pinned for today** (max 3).
  3. **Due today or overdue** (personal tasks).
  4. **Waiting on me**: approvals waiting (if approver), team tasks I wrote that were sent back.
  5. **Follow-ups due** (waiting items past their nudge date).
- **Roll-over**: items pinned on an earlier day and not done show at the top as "From yesterday" with three actions: keep for today, reschedule (date), drop. Computed on read in the user's time zone; no background job.

### 6.4 My tasks, Inbox, Waiting on
- **My tasks**: list grouped by Overdue / Today / Upcoming / No date / Done (last 7 days). Quick add, checklist inline, recurrence.
- **Inbox**: ideas; actions: make personal task, make team task (choose workspace → task form prefilled), delete with undo.
- **Waiting on**: list with "since" and nudge date; mark received (done).

### 6.5 Reminders
- "Remind me…" on any personal item and on any team task (creates a linked personal reminder item).
- Presets (later today, tomorrow 9:00, next Monday 9:00) and a date-time picker.
- Delivered as an in-app notification and email (if SMTP set). Each reminder fires exactly once even with several workers.

### 6.6 Recurring tasks
- Rules: daily, weekdays, weekly on chosen days, monthly on a date. Completing an occurrence creates the next one with the next due date. No background job needed.

### 6.7 Checklists
- Personal tasks have a checklist. **Team tasks gain a shared checklist** (progress, not ticket content): editable by the author or `task.edit_any`, and still editable after approval. Progress shows in the task list ("3/5").
- AI **"Break into steps"** proposes checklist items; the user ticks which to keep.

### 6.8 Private notes on team tasks
- In a team task's detail pane, a "My notes" box visible only to the current user. Stored as a personal note linked to the task.

### 6.9 Waiting-on nudges
- A background job creates a notification when a waiting item reaches its nudge date: "Still waiting on Priya for the cost numbers (5 days)."

### 6.10 Standup helper (AI)
- On Today: "Draft my standup" produces Yesterday / Today / Blockers from the user's own activity in the last working day (team tasks they created, submitted, decided or commented on; personal tasks done; today's pins; overdue items). Editable, with a Copy button. Only the user's own data goes into the prompt.

### 6.11 Weekly review
- On Fridays (user's time zone) a quiet banner on Today: "Weekly review." The review screen walks: Inbox (process each idea), overdue tasks, waiting items, next week's pins. AI groups similar ideas and suggests merges; nothing merges without a click.

### 6.12 Weekly team summary (AI, managers)
- A workspace screen "Summary" for users with a new permission `reports.view` (default Admin and Approver): what was approved, done, sent back and still waiting this week, with an AI-written paragraph. Built only from team tasks — never personal data. Copy as text; (later) post to the Teams channel.

### 6.13 Meeting notes → action items (AI)
- Paste notes or a transcript; AI proposes action items with suggested owner (matched to members) and due date. For each, choose: my personal task, team task draft (in a chosen workspace), or skip. Nothing is created until confirmed.

### 6.14 Draft with AI and duplicates by meaning
- As in main spec §7.2/§8: "Draft with AI" on the team task form; similar-task check by meaning. Personal items get their own similar check (within the owner's items only) on capture: "You captured something like this on Tuesday."

### 6.15 Search
- The palette searches team tasks (current workspace) and the user's own personal items, shown in separate groups. Personal results come only from the `Personal` layer.

### 6.16 Calendar feed
- A private iCalendar (`.ics`) URL per user listing personal items with due dates and reminders. The URL contains a random token (stored hashed); "Reset link" invalidates the old one. Read-only. The feed shows titles only, never notes.

### 6.17 Installed app (PWA)
- Web app manifest, icons, and a minimal service worker (no offline data). Share target → capture. Works on Windows/macOS (Edge/Chrome install) and Android; iOS gets "Add to Home Screen" without the share target.

## 7. Background worker

First background process (main spec §11 planned one): `python -m app.worker`, same image, second OpenShift Deployment. Every minute it:
- fires due reminders (atomic claim: `find_one_and_update` on `remind_at <= now and fired_at == null`, setting `fired_at`),
- creates waiting-on nudges (same claim pattern),
- is safe to run with several replicas.
Jira jobs (Phase 3) will reuse it.

## 8. AI

- Configured only by env (`AI_ENABLED`, `VERTEX_API_KEY`, `GEMINI_MODEL`, `EMBEDDING_MODEL`), all calls in one module `backend/app/ai.py` (owner swaps in the proxy there).
- Functions: `parse_capture(text, now, tz) -> CaptureDraft`, `draft_ticket(template, text) -> fields`, `extract_actions(notes, members, now, tz) -> [ActionDraft]`, `morning_brief(facts) -> str`, `standup(facts) -> {yesterday, today, blockers}`, `breakdown(title, text) -> [str]`, `group_ideas(ideas) -> [[ids]]`, `weekly_summary(facts) -> str`, `embed(texts) -> [[float]]`.
- Structured output (JSON schema) for every function that returns structure.
- **Facts in, prose out:** briefs and summaries are written from a facts object the backend computes (counts, titles, dates); the model never sees data the user can't see.
- With `AI_ENABLED=false`, every AI control is hidden and the features fall back: capture saves as typed; Today shows its lists without the brief; meeting notes, standup and summary screens show a plain "AI is off" note.
- Failures degrade: "AI unavailable, continue manually", never block.
- Rate limit per user (e.g. 60 AI calls/hour) to protect the key's quota.

## 9. Jira is optional (changes to the main spec)

- Main spec §7.5 "approve creates the Jira ticket" becomes: approved team tasks show **Create Jira ticket** when the workspace has a Jira connection. A workspace setting **"Create Jira tickets automatically on approval"** (default off) restores the automatic behaviour.
- The task list and progress track never mention Jira unless a ticket exists.

## 10. Navigation

Sidebar, top to bottom: brand · **My space** (Today, Inbox with count, My tasks, Waiting on) · **workspace switcher** · team items (Tasks, Approvals with count, Summary, Settings) · footer (shortcuts, theme). Personal pages live at `/me/...`; the workspace switcher changes only the team group. On phones the same groups appear in the menu sheet.

Shortcuts added: `G T` Today, `G M` My tasks, `G I` Inbox (two-key "go" chords), `R` on a selected item = remind me (outside the approval queue, where R stays Reject).

## 11. Constraints

Everything in the main spec's constraints holds (MongoDB 8.0, PyMongo Async, no transactions, OpenShift, env default user until company login). Times are stored in UTC; the user's time zone (from the browser, saved on the user record) decides "today", Friday, and preset times.

## 12. Build order

1. **My space core:** `Personal` layer + isolation tests; items (task/idea/waiting); migrate workspace ideas; capture; Today (without AI), My tasks, Inbox, Waiting on; recurrence; checklists (personal and team); private notes; search groups; navigation.
2. **Reminders and worker:** worker process, reminders, nudges, personal notifications, email; calendar feed; PWA + share target.
3. **AI:** `ai.py`; capture parsing; draft with AI; breakdown; meeting notes; morning brief; standup; weekly review grouping; duplicates by meaning (personal and team); weekly team summary + `reports.view`.
4. **Jira (Phase 3 of the main spec):** connection, "Create Jira ticket", optional auto-create, mirror with per-user visibility.

## 13. Designer's calls (owner can change)

- My space is **per person across all workspaces**, not one per workspace.
- Workspace ideas from Phase 2 are migrated into each owner's personal Inbox.
- Team task checklists stay editable after approval (they track progress, not the ticket).
- Weekly summary needs a new `reports.view` permission (default Admin, Approver).
- Morning brief is in-app only, generated on first open each day.
- The calendar feed shows titles only.

Owner decisions (2026-10-31, owner said "Next" to the designer's suggestions):
- **Privacy is enforced by the app**, with no encryption at rest. Direct database access is governed by the platform team's database access controls.
- **AI may read a person's own private items** for that person's features only. Each person has a "Use AI on my space" switch, on by default. With it off, no personal content goes to the model.

Answers to the builder check (designer's calls):
- **No migration of Phase 2 ideas:** there is no production data yet. Personal ideas replace the workspace idea inbox, and its endpoints are removed.
- **User record and time zone:** the existing `users` collection holds `tz`. It is updated from the browser on each visit, so travel moves "today" with the person. The env default user is upserted there at startup.
- **Recurrence after missed cycles:** completing a late occurrence creates the next one at the first rule date after today. Missed cycles are not back-filled.
- **Reminder text after access loss:** when a reminder fires, the worker checks the user can still open the linked task. If yes, it shows the task's current title. If not, it says "A task you no longer have access to".
- **Worker:** atomic-claim pattern only, no jobs collection yet. Delivery is at most once: `fired_at` is set before sending, and email failures are logged, not retried.
- **Calendar feed:** reachable without a session through the normal route. Rate-limited per token (60 requests/hour). Titles only.

## 14. Left to the builder

Collection schemas beyond the fields named, exact API shapes, the recurrence storage format, the worker's interval and batch size, prompt wording, icon set for the PWA, and visual details within the Achromatic ledger style (the redesign's tokens and rules apply to every new screen).
