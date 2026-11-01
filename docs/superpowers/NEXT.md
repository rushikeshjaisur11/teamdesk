# Where TeamDesk is, and what's next

Updated 2026-11-01. Read this first when resuming.

## Done
- **Phase 1–2** (merged to `main`): workspaces, roles, team tasks, approvals, notifications, settings, deploy files. Plan: `plans/2026-10-31-teamdesk-foundation-and-tasks.md`. Final review done; fixes merged.
- **UI redesign** with the taste skill (`.claude/skills/design-taste-frontend`, style "Achromatic ledger", seed 444112219). Tokens in `frontend/src/styles/tokens.css`. Every new screen follows `references/app-screens.md` and passes `inspect.mjs --app` with 0 FAIL.
- **My space core** (branch `my-space`): all 10 tasks of `plans/2026-10-31-teamdesk-my-space-core.md` are complete.
- **Final review of `main..my-space`** (done on `cloud/next-steps`): no privacy leaks found. Fixed with failing tests first: a profile PATCH could leave a `users` doc without `groups` (500 on members and on submit), PATCH with explicit `null` corrupted items, bad time zone names like `America` returned 500, roll-over items also showed under Due, reopening a completed recurring item spawned a duplicate. Tests in `backend/tests/test_final_review.py`.
- **My space step 2, mostly** (`plans/2026-10-31-teamdesk-my-space-step2.md`, tasks 1-7 done): `remind_at` on items, `app/worker.py` (reminders, nudges, atomic claim, email), `personal_notifications` + `/api/me/notifications`, calendar feed (`app/calendar_feed.py`), `deploy/openshift/worker.yaml`, PWA manifest/service worker/share target (`/share`), reminders in the bell, "Remind me" in the task sheet, calendar link in My settings. Backend: 165 tests. Frontend: 65 tests.

## Next, in order
1. **Step 2 leftovers, done on `resume/step2-leftovers`:** "Remind me" on team tasks (private reminder linked to the task), duplicate checklist ids refused (422), and links to tasks you can't open refused at item create (404). Still open: the calendar-feed rate limit is per replica; PWA, real SMTP and the worker on OpenShift are not verified on real infrastructure; icons are SVG only; the 3-pin limit is racy (documented).
3. **My space step 3, AI:** spec §6.2, §6.10–6.14, §8. `backend/app/ai.py` holds every Vertex call. Config is env only: `AI_ENABLED`, `VERTEX_API_KEY`, `GEMINI_MODEL`, `EMBEDDING_MODEL`. Respect each user's `use_ai` switch.
2. **Owner feedback round, done on `resume/step2-leftovers` (2026-11-01):** platform owners are admins in every workspace (they couldn't open workspaces they created); top bar with Search and Capture buttons (not in the sidebar); redesigned team switcher; done/rejected/duplicate tasks shown in one struck-through "Archived" group on Tasks and My tasks; Settings pages hidden unless you hold their permission; **Settings → Connections → Jira** (Cloud email+token / Data Center PAT, encrypted with a key derived from `SESSION_SECRET`, Test connection, `app/jira.py`); **"Create Jira issue" / "Retry Jira"** on approved or failed tasks (claim prevents duplicates, plain-language errors, `jira_failed` status); **personal Teams reminders** through each person's Teams Workflows webhook (My settings → Teams reminders, `app/teams.py`), worker posts reminders, nudges and a 9:00 digest. Backend 173, frontend 66.
3a. **Second feedback round, done on `resume/step2-leftovers` (2026-11-01):** workspace Teams channel connector (Settings → Connections, chosen events, `teams.ws_router`); per-team Jira template (task type: project override, extra fields JSON, section → Jira field); per-team Jira workflow (status mapping by name, default by status category; worker polls every `JIRA_SYNC_MINUTES`, `jira.sync_statuses`); comments copied to Jira, tidied by AI (`app/ai.py`, first AI call, falls back to original text); Jira column with links on Tasks; "Open KEY in Jira" on the task; full setup guide `docs/SETUP.md`.
4. **Jira, rest of it:** still to do: auto-create on approve when connected, background retry with backoff and an idempotency marker (search by label before re-creating), Jira webhook for faster status, the Jira mirror (own tickets; `jira.view_all` sees all), per-user Jira accounts, copying comments written before the issue existed.
5. **Docs space, first version done on `resume/step2-leftovers` (2026-11-01):** `app/docs.py` (nested folders, Markdown docs, text-index search with snippets, version history with restore, version check with 409 + force), `pages/Docs.tsx` (tree, search, editor with live preview, templates), docs in Ctrl K. Still to do: rich-text (WYSIWYG) editor, images, doc-to-task links both ways, Confluence import, "Ask the docs" AI answers with citations and the Missing docs list (spec 7.9), AI re-ranking of search.
6. **Meeting notes, done on `resume/step2-leftovers` (2026-11-01):** `app/meetings.py` (meetings grouped by series, transcript upload as base64 JSON: .vtt cleaned, .docx read with zipfile/ElementTree, .txt/.md; AI summary + proposed tasks stored on the meeting via `ai.meeting_notes`), `pages/Meetings.tsx` (grouped list, upload, tick-to-create draft tasks, created-task links, save summary to Docs). Still to do: suggested owner matched to a workspace member, speaker diarization for plain-text transcripts, pulling transcripts straight from Teams (needs Graph API permission).

## Owner decisions to keep
- No sign-in screen yet. The env default user is `DEV_USER_*`. Company login comes later through `sign_in()`.
- Nobody can read another person's My space, admins included. Enforcement is in the app; there is no encryption at rest.
- AI may read a person's own items only when their "Use AI on my space" switch is on (the default).
- Developer tasks and tech tasks skip approval. Self-approval is always blocked (compliance).
- MongoDB 8.0.26 replica set; OpenShift; GitHub Enterprise; Microsoft Teams (Workflows webhook).
- Body text is 15px (the owner prefers larger type).

## Running locally
See `README.md`. Tests need `docker run -d -p 27018:27017 mongo:8.0`. `SESSION_SECRET` must be 32+ characters.
