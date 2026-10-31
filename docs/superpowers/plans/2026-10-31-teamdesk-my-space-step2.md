# TeamDesk My space step 2 — reminders, worker, notifications, calendar feed, PWA

> Spec: `specs/2026-10-31-teamdesk-my-space-design.md` §6.5, §6.9, §6.16, §6.17, §7. Executed task by task with TDD (test, watch it fail, implement, full suite, commit).

**Architecture:** `app/worker.py` holds `run_once(db, settings, at)` (testable, idempotent) and a 60 s loop (`python -m app.worker`). Fired reminders and nudges become rows in `personal_notifications` (owner-keyed, via `Personal`), plus email when SMTP is set. Claim pattern: `find_one_and_update` setting `fired_at` before delivery; at-most-once; email failures logged. Calendar feed is a token URL (SHA-256 hash stored on the user), titles only, 60 requests/hour per token.

**Constraints kept:** nobody reads another person's My space; notifications about personal items go only to their owner; audit never holds personal content; times UTC, "today" from the user's tz.

## Tasks
1. **Reminder field** — `remind_at` (UTC datetime) on items (create/patch; setting it clears `fired_at`). Presets are a frontend concern.
2. **Personal notifications API** — `GET /api/me/notifications`, `POST /api/me/notifications/read`; isolation test (admin/other user sees nothing).
3. **Worker: reminders** — atomic claim, once with two concurrent runs, text uses current task title if the user can still open it, else "A task you no longer have access to"; email when SMTP+address.
4. **Worker: waiting-on nudges** — "Still waiting on Priya for the cost numbers (5 days)"; once per item; honours the user's tz; skips done/dropped.
5. **Worker entrypoint + deploy** — `python -m app.worker` loop; second Deployment in OpenShift manifests; README.
6. **Calendar feed** — `POST /api/me/calendar/reset` (returns URL once), `GET /api/calendar/{token}.ics`, titles only, hashed token, reset invalidates, rate limit.
7. **PWA** — manifest with share target, icons, minimal service worker (no data caching), registration, capture from share.
8. **Frontend** — notifications for My space in the bell, "Remind me" control, calendar-feed settings. (Stretch; see NEXT.md for what was reached.)
