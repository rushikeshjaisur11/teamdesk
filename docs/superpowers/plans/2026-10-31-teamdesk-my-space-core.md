# TeamDesk My space core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every person gets a private My space (Today, Inbox, My tasks, Waiting on) with recurrence, checklists and private notes on team tasks, and nobody else can read it.

**Architecture:** Personal data lives in user-owned collections reached only through a `Personal` data layer that filters every query by the signed-in user's `sub` (the same mechanism as `Scoped`, keyed by owner). Personal routes are `/api/me/...`. The frontend gets one app layout with a "My space" group and the team group in the sidebar.

**Tech Stack:** Existing: FastAPI, PyMongo Async, React + TS, TanStack Query, shadcn (Base UI), Tailwind, the Achromatic ledger tokens. Python `zoneinfo` for time zones. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-teamdesk-my-space-design.md` (build-order step 1), extending `docs/superpowers/specs/2026-10-31-teamdesk-design.md`.

## Global Constraints

- **Nobody reads another person's private data** — not admins, not platform owners. Enforced by the API: every personal query goes through `Personal`; no endpoint takes another user's id for personal data; another user's item id returns **404**.
- Audit log entries never contain personal content.
- MongoDB 8.0, PyMongo Async, no multi-document transactions; atomic single-document updates with status preconditions.
- Dates of the user's day (`due_on`, `today_on`, `since`) are `YYYY-MM-DD` strings in the user's time zone; timestamps are UTC datetimes. "Today" is computed from `users.tz` (IANA name, default `UTC`).
- At most **3** items pinned for one day. Message: `"You can pin three things for today. Unpin one first."`
- Limits: item title 1–500 chars, notes ≤ 20,000, checklist ≤ 50 items of ≤ 300 chars, labels ≤ 20, private note ≤ 20,000.
- Every mutating request carries `X-Requested-With: TeamDesk` (already enforced).
- UI follows the Achromatic ledger rules already in `frontend/src/styles/tokens.css`: no colour in chrome, one noun h1 per screen at 24px with a one-line finding, white cards on the ledger ground, status as pale pairs, tabular figures, sentence case, no icons in tinted squares.
- AI is **not** in this plan (step 3). Reminders, worker, calendar feed and PWA are **not** in this plan (step 2). The profile's `use_ai` switch is stored now so step 3 can read it.

## Review Focus

1. **An admin or platform owner asks for someone else's item, note, Today or search results** — they get 404/empty, never the content. Test in Task 2 and Task 7.
2. **Time zone edges** — at 00:30 in Asia/Kolkata (still yesterday in UTC), "today" is the Kolkata date. Test in Task 3.
3. **A fourth pin, and yesterday's pins** — the 4th pin for today is refused; items pinned on an earlier day don't count and show in roll-over. Test in Task 4.
4. **Double-completing a recurring task** (double click, two tabs) — exactly one next occurrence is created. Test in Task 5.
5. **Losing access to a workspace** — private notes on its tasks and its sent-back tasks stop showing; nothing errors. Test in Task 7.

---

## File Structure

```
backend/app/
  scoped.py        + ScopedCollection keyed by any field; Personal(db, owner_sub)
  me.py            /api/me: profile, items, pin, complete/drop/reopen, today, notes
  my_time.py       pure: today_for(tz, now), next_due(rule, due_on, today), group_tasks(items, today)
  tasks.py         + from_item_id (replaces from_idea_id), team checklist route
  ideas.py         DELETED (ideas become personal items)
  db.py            + indexes for personal_items, personal_notes
backend/tests/
  test_personal_layer.py, test_my_time.py, test_me_items.py, test_me_today.py, test_me_notes.py, test_team_checklist.py
  test_ideas.py    DELETED
frontend/src/
  lib/types.ts, lib/queries.ts     + Item, Today, Profile types and hooks
  lib/useChord.ts                   two-key "G then X" shortcuts
  pages/AppLayout.tsx               replaces WorkspaceLayout: My space group + team group
  pages/me/Today.tsx, MyTasks.tsx, MyInbox.tsx, Waiting.tsx
  components/ItemRow.tsx, Checklist.tsx, RecurrencePicker.tsx, PrivateNote.tsx, ProfileDialog.tsx
  components/QuickCapture.tsx, CommandPalette.tsx   point at personal items
  pages/Inbox.tsx                   DELETED (replaced by me/MyInbox.tsx)
```

## Data shapes

- `users` (existing) gains `tz: str` (default `"UTC"`) and `use_ai: bool` (default `true`).
- `personal_items`: `{_id, owner_sub, kind: "task"|"idea"|"waiting", title, notes, status: "open"|"done"|"dropped", due_on: str|None, today_on: str|None, checklist: [{id, text, done}], recurrence: Recurrence|None, labels: [str], waiting: {who, since, nudge_after_days}|None, link: {workspace_id, task_id}|None, promoted_to: {workspace_id, task_id}|None, search_text, created_at, updated_at, done_at}`. Indexes: `(owner_sub, status, kind)`, `(owner_sub, today_on)`, text `(title, search_text)`.
- `Recurrence`: `{freq: "daily"|"weekdays"|"weekly"|"monthly", days: [int 0-6, Monday=0] (weekly only), day: int 1-31 (monthly only)}`.
- `personal_notes`: `{_id, owner_sub, workspace_id, task_id, text, updated_at}`, unique `(owner_sub, workspace_id, task_id)`.
- `tasks` (team) gains `checklist: [{id, text, done}]` (default `[]`).

---

### Task 1: Personal data layer

**Files:** Modify `backend/app/scoped.py`; Test `backend/tests/test_personal_layer.py`

**Interfaces:**
- Produces: `ScopedCollection(col, key: str, value: str)` (Scoped passes `("workspace_id", ws)`); `class Personal: __init__(db, owner_sub: str)`, `.col(name) -> ScopedCollection` keyed `("owner_sub", sub)`, attribute `owner_sub`. `update`/`update_many` refuse changes to the key field (`ValueError`). Existing `Scoped` behaviour and tests unchanged.

- [ ] **Step 1: Write the failing tests**

```python
async def test_personal_reads_and_writes_never_cross_users(db):
    a, b = Personal(db, "asha").col("personal_items"), Personal(db, "dan").col("personal_items")
    doc = await a.insert({"title": "secret"})
    assert await b.find({}) == [] and await b.find_one({"_id": doc["_id"]}) is None
    assert await b.find({"owner_sub": "asha"}) == []
    assert await b.update({"_id": doc["_id"]}, {"$set": {"title": "x"}}) is None
    assert await b.delete({"_id": doc["_id"]}) == 0

async def test_personal_owner_cannot_be_changed(db):
    a = Personal(db, "asha").col("personal_items")
    doc = await a.insert({"title": "x"})
    with pytest.raises(ValueError):
        await a.update({"_id": doc["_id"]}, {"$set": {"owner_sub": "dan"}})
```

- [ ] **Step 2: Run** `uv run pytest tests/test_personal_layer.py -q` → FAIL (no `Personal`).
- [ ] **Step 3: Implement** the generalised `ScopedCollection` and `Personal` in `scoped.py`; `out()` also drops `owner_sub`.
- [ ] **Step 4: Run** `uv run pytest -q` → all PASS.
- [ ] **Step 5: Commit** — `feat(backend): personal data layer keyed by owner`

---

### Task 2: Profile and personal items API

**Files:** Create `backend/app/me.py`, Test `backend/tests/test_me_items.py`; Modify `backend/app/main.py`, `backend/app/db.py`, `backend/app/tasks.py`; Delete `backend/app/ideas.py`, `backend/tests/test_ideas.py`

**Interfaces:**
- Consumes: `Personal`, `current_user`, `get_template`, `submit_task`.
- Produces (all under `/api/me`, all need a signed-in user, none take a user id):
  - `GET /profile` → `{sub, name, email, tz, use_ai}`; `PATCH /profile {tz?, use_ai?}` (tz must be a valid IANA zone, else 422 `"Unknown time zone."`).
  - `async def personal(request, user=Depends(current_user)) -> Me` dependency: `@dataclass Me: user: User; items: ScopedCollection; notes: ScopedCollection; db; settings; tz: str`.
  - `GET /items?kind=&status=open&q=&limit=200` → owner's items; `q` uses `$text`, sorted by score.
  - `POST /items` `{kind, title, notes?, due_on?, labels?, checklist?, recurrence?, waiting?, link?}` → 201. `waiting` required when `kind == "waiting"` (`since` defaults to today); `recurrence` only for `kind == "task"`.
  - `PATCH /items/{id}` (any of the create fields except `kind`, plus `kind` change idea→task allowed).
  - `DELETE /items/{id}` → 204.
  - `POST /items/{id}/drop`, `POST /items/{id}/reopen` → item.
  - Team task creation: `NewTask.from_item_id` replaces `from_idea_id`; on success the item gets `promoted_to={workspace_id, task_id}` and `status="done"`, `done_at=now`.
  - `ideas.py` and `/api/w/{wid}/ideas` are removed.

- [ ] **Step 1: Write the failing tests** (fixture `ws_with_dev` already logs in `adm`, `appr`, `dev`, `view`; add `owner` client logged in with `OWNER` groups)

```python
async def test_items_crud_and_privacy(ws_with_dev, make_client):
    wid, c = ws_with_dev
    item = (await c["dev"].post("/api/me/items", json={"kind": "task", "title": "Ring the vendor", "due_on": "2026-11-03"})).json()
    assert (await c["dev"].get("/api/me/items")).json()[0]["title"] == "Ring the vendor"
    owner = await make_client(); await login(owner, "own", OWNER + ["g-admin"])
    for who in (c["adm"], owner):                                    # Review Focus 1
        assert (await who.get("/api/me/items")).json() == []
        assert (await who.patch(f"/api/me/items/{item['id']}", json={"title": "x"})).status_code == 404
        assert (await who.delete(f"/api/me/items/{item['id']}")).status_code == 404
    assert "owner_sub" not in item

async def test_waiting_item_needs_who_and_defaults_since(ws_with_dev): ...   # no waiting → 422; since == today in user tz
async def test_recurrence_only_on_tasks(ws_with_dev): ...                    # idea with recurrence → 422
async def test_limits(ws_with_dev): ...                                      # title 501 → 422; 51 checklist items → 422
async def test_profile_tz_and_ai_switch(ws_with_dev): ...                    # PATCH tz "Asia/Kolkata" ok; "Mars/Base" → 422; use_ai False round-trips

async def test_promote_idea_to_team_task(ws_with_dev):
    wid, c = ws_with_dev
    idea = (await c["dev"].post("/api/me/items", json={"kind": "idea", "title": "cache schema lookups"})).json()
    t = (await c["dev"].post(f"/api/w/{wid}/tasks", json={**STORY, "from_item_id": idea["id"]})).json()
    got = (await c["dev"].get("/api/me/items", params={"status": "done"})).json()[0]
    assert got["promoted_to"] == {"workspace_id": wid, "task_id": t["id"]}

async def test_cannot_promote_someone_elses_item(ws_with_dev): ...           # adm uses dev's item id → task created, dev's item untouched
async def test_search_is_owner_only(ws_with_dev): ...                        # dev's "vendor" item not found by adm's q=vendor
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `me.py` and the `tasks.py` change; delete `ideas.py` and its test; add indexes in `ensure_indexes`; `today` for defaults comes from `my_time.today_for(tz, now())` (Task 3 — write the one-line function there first if executing in order).
- [ ] **Step 4: Run** `uv run pytest -q` → PASS.
- [ ] **Step 5: Commit** — `feat(backend): personal items and profile`

---

### Task 3: Time rules (pure)

**Files:** Create `backend/app/my_time.py`, Test `backend/tests/test_my_time.py`

**Interfaces:**
- Produces:
  - `def today_for(tz: str, now: datetime) -> date`
  - `def next_due(rule: dict, due_on: date | None, today: date) -> date` — next rule date strictly after `due_on` when `due_on >= today`, otherwise the first rule date strictly after `today` (missed cycles are not back-filled). `weekdays` = Mon–Fri. `monthly` with `day` beyond the month's length uses the month's last day.
  - `def task_group(item: dict, today: date) -> Literal["overdue", "today", "upcoming", "no_date", "done"]`.

- [ ] **Step 1: Write the failing tests**

```python
def test_today_uses_the_users_zone():                                        # Review Focus 2
    now = datetime(2026, 10, 31, 19, 0, tzinfo=UTC)                          # 00:30 on Nov 1 in Kolkata
    assert today_for("Asia/Kolkata", now) == date(2026, 11, 1)
    assert today_for("UTC", now) == date(2026, 10, 31)

@pytest.mark.parametrize("rule,due,today,expected", [
    ({"freq": "daily"}, date(2026, 11, 2), date(2026, 11, 2), date(2026, 11, 3)),
    ({"freq": "daily"}, date(2026, 10, 20), date(2026, 11, 2), date(2026, 11, 3)),          # late: no back-fill
    ({"freq": "weekdays"}, date(2026, 10, 30), date(2026, 10, 30), date(2026, 11, 2)),     # Fri -> Mon
    ({"freq": "weekly", "days": [0, 3]}, date(2026, 11, 2), date(2026, 11, 2), date(2026, 11, 5)),
    ({"freq": "monthly", "day": 31}, date(2026, 10, 31), date(2026, 10, 31), date(2026, 11, 30)),
])
def test_next_due(rule, due, today, expected):
    assert next_due(rule, due, today) == expected

def test_task_group(): ...   # due yesterday → overdue; today → today; tomorrow → upcoming; None → no_date; status done → done
```

- [ ] **Step 2–4:** run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** — `feat(backend): time zone and recurrence rules`

---

### Task 4: Pin for today, complete with recurrence

**Files:** Modify `backend/app/me.py`; Test `backend/tests/test_me_items.py`

**Interfaces:**
- Produces:
  - `POST /api/me/items/{id}/pin {on: bool}` → item. Pinning sets `today_on` = user's today; a 4th open item pinned for today → 409 (message in Global Constraints). Items pinned on an earlier day don't count.
  - `POST /api/me/items/{id}/complete` → `{item, next: item | None}`. Atomic: `update({"_id": id, "status": "open"}, …)`; a second call → 409 `"Already done."`. When the item has a `recurrence`, create the next occurrence (same title, notes, labels, recurrence, checklist with every box unticked, `due_on = next_due(...)`, not pinned).

- [ ] **Step 1: Write the failing tests**

```python
async def test_fourth_pin_refused_and_old_pins_dont_count(ws_with_dev, db):  # Review Focus 3
    wid, c = ws_with_dev
    ids = [(await c["dev"].post("/api/me/items", json={"kind": "task", "title": f"t{i}"})).json()["id"] for i in range(5)]
    await db.personal_items.update_one({"_id": ids[4]}, {"$set": {"today_on": "2020-01-01"}})
    for i in ids[:3]:
        assert (await c["dev"].post(f"/api/me/items/{i}/pin", json={"on": True})).status_code == 200
    r = await c["dev"].post(f"/api/me/items/{ids[3]}/pin", json={"on": True})
    assert r.status_code == 409 and "three things" in r.json()["detail"]

async def test_completing_recurring_task_once_creates_one_next(ws_with_dev):  # Review Focus 4
    wid, c = ws_with_dev
    it = (await c["dev"].post("/api/me/items", json={"kind": "task", "title": "Status report", "due_on": "2026-10-30",
          "recurrence": {"freq": "weekly", "days": [4]}, "checklist": [{"id": "a", "text": "draft", "done": True}]})).json()
    r1, r2 = await asyncio.gather(c["dev"].post(f"/api/me/items/{it['id']}/complete"), c["dev"].post(f"/api/me/items/{it['id']}/complete"))
    assert sorted([r1.status_code, r2.status_code]) == [200, 409]
    nxt = (r1 if r1.status_code == 200 else r2).json()["next"]
    assert nxt["checklist"][0]["done"] is False and nxt["recurrence"] == {"freq": "weekly", "days": [4]}
    assert len((await c["dev"].get("/api/me/items")).json()) == 1
```

- [ ] **Step 2–4:** run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** — `feat(backend): pin for today and recurring completion`

---

### Task 5: Today

**Files:** Modify `backend/app/me.py`; Test `backend/tests/test_me_today.py`

**Interfaces:**
- Produces: `GET /api/me/today` →
  ```
  { date: "YYYY-MM-DD", is_friday: bool,
    rollover: [item],          # open, today_on < today
    pinned: [item],            # open, today_on == today
    due: [item],               # open tasks, due_on <= today, not pinned today, overdue first
    followups: [item],         # open waiting items with since + nudge_after_days <= today
    sent_back: [{workspace_id, workspace_name, task: {id, number, title}}],  # team tasks I wrote in changes_requested, only in workspaces I can still open
    approvals: [{workspace_id, workspace_name, count}] }                     # only workspaces where I have task.approve and count > 0
  ```

- [ ] **Step 1: Write the failing tests** — `test_today_sections` (one item per section, asserting each lands in the right list), `test_sent_back_respects_access` (Review Focus 5: dev's sent-back task shows; after the admin removes dev's group mapping, `sent_back` is `[]` and the call is 200), `test_approval_counts_only_for_approvers` (appr sees `count: 1`, dev sees `[]`), `test_today_is_private` (adm's Today never contains dev's items).
- [ ] **Step 2–4:** run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** — `feat(backend): Today`

---

### Task 6: Team checklists

**Files:** Modify `backend/app/tasks.py`; Test `backend/tests/test_team_checklist.py`

**Interfaces:**
- Produces: `PUT /api/w/{wid}/tasks/{id}/checklist` body `[{id, text, done}]` (≤ 50 items, text 1–300) → task. Author or `task.edit_any`; allowed in every status except `rejected` and `duplicate` (409 `"This task is closed."`). Does **not** change `updated_at` (approvals compare `updated_at` for content changes) — stores `checklist_updated_at` instead. Logs activity `checklist` with `{done, total}`.

- [ ] **Step 1: Write the failing tests** — `test_author_updates_checklist_after_approval`, `test_checklist_does_not_invalidate_open_approval` (approver's `seen_updated_at` still accepted after the author ticks a box), `test_closed_task_checklist_409`, `test_other_member_cannot_edit_checklist` (403).
- [ ] **Step 2–4:** run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** — `feat(backend): shared checklists on team tasks`

---

### Task 7: Private notes on team tasks

**Files:** Modify `backend/app/me.py`; Test `backend/tests/test_me_notes.py`

**Interfaces:**
- Produces: `GET /api/me/notes/{wid}/{task_id}` → `{text, updated_at}` or `{text: "", updated_at: null}`; `PUT` same path `{text}` → note. Both first check the caller can open the task (`task.view` in that workspace and the task exists) → 404 otherwise. Notes are read and written only through `Personal`.

- [ ] **Step 1: Write the failing tests** — `test_note_is_private` (dev writes; adm and owner reading the same path get `text: ""`), `test_note_needs_task_access` (Review Focus 5: after dev loses the mapping, GET/PUT → 404), `test_note_limit` (20,001 chars → 422).
- [ ] **Step 2–4:** run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** — `feat(backend): private notes on team tasks`

---

### Task 8: App layout with My space

**Files:** Create `frontend/src/pages/AppLayout.tsx`, `frontend/src/lib/useChord.ts`, `frontend/src/components/ProfileDialog.tsx`; Delete `frontend/src/pages/WorkspaceLayout.tsx`; Modify `App.tsx`, `lib/types.ts`, `lib/queries.ts`, `components/QuickCapture.tsx`, `components/CommandPalette.tsx`

**Interfaces:**
- Produces:
  - Types `Item`, `Recurrence`, `ChecklistItem`, `Today`, `Profile` mirroring the backend.
  - Hooks `useProfile()`, `useItems(filters)`, `useToday()`; query keys `qk.items(filters)`, `qk.today`, `qk.profile`, `qk.note(wid, taskId)`.
  - `AppLayout` wraps both `/me/*` and `/w/:wid/*`. The current workspace is the URL's `wid`, else the last used, else the first. Sidebar: brand, bell · **My space**: Today, Inbox (count of open ideas), My tasks, Waiting on · workspace switcher · Tasks, Approvals (count), Settings · footer: My settings (opens `ProfileDialog`), shortcuts, theme.
  - On first load `PATCH /api/me/profile {tz: Intl.DateTimeFormat().resolvedOptions().timeZone}` when it differs.
  - `ProfileDialog`: time zone (read-only, from the browser) and the switch "Use AI on my space" (stored now, used in step 3).
  - `useChord(first: string, second: string, handler)`: `G` then `T`/`M`/`I`/`W` within 1 s navigates to Today / My tasks / Inbox / Waiting on; ignored while typing.
  - `QuickCapture` posts `{kind: "idea", title}` to `/api/me/items`. `CommandPalette` adds a "My items" group from `GET /api/me/items?q=…&limit=6` (owner-only by construction).
  - Routes: `/` → `/me/today`; `/me/today`, `/me/inbox`, `/me/tasks`, `/me/waiting`; workspace routes unchanged.

- [ ] **Step 1: Write the failing tests** — `useChord.test.tsx` (G then T fires; G then a pause over 1 s then T doesn't; typing in an input doesn't), `QuickCapture.test.tsx` updated to expect `POST /api/me/items` with `{kind: 'idea', title: 'cache lookups'}`, `CommandPalette.test.tsx` new case "shows my items in their own group".
- [ ] **Step 2–4:** `npx vitest run` → FAIL, implement, → PASS; `npx tsc -b` clean.
- [ ] **Step 5: Commit** — `feat(frontend): app layout with My space`

---

### Task 9: Today, Inbox, My tasks, Waiting on screens

**Files:** Create `frontend/src/pages/me/{Today,MyInbox,MyTasks,Waiting}.tsx`, `frontend/src/components/{ItemRow,Checklist,RecurrencePicker}.tsx`; Delete `frontend/src/pages/Inbox.tsx` and its test; Modify `App.tsx`

**Interfaces:**
- Consumes: Task 2–5 endpoints, Task 8 hooks.
- Produces:
  - **Today** (h1 "Today", finding e.g. "3 pinned, 2 due, 1 follow-up."): sections in this order, each hidden when empty: From yesterday (actions Keep for today / Reschedule (date input) / Drop), Pinned (max 3; the pin control says "3 of 3 pinned" when full), Due, Waiting on you (sent-back team tasks with links; approval counts per workspace with links), Follow-ups due. On Fridays a quiet line "It's Friday. Do a weekly review?" (the review screen comes in step 3; until then the line links to Inbox). Empty Today: "Nothing pinned or due. Press I to capture, or pin something from My tasks."
  - **ItemRow**: checkbox (complete), title, due date (`num`, grey; overdue in `--negative`), checklist progress "2/5", pin toggle, kebab (Edit, Drop, Delete with undo). Completing a recurring task shows a toast "Next one on Fri 6 Nov".
  - **My tasks**: quick-add input (Enter adds, `due_on` optional via a date input beside it), groups Overdue / Today / Upcoming / No date / Done (last 7 days, collapsed), detail drawer with notes (Markdownish preview), `Checklist`, `RecurrencePicker` (None, Daily, Weekdays, Weekly + day toggles, Monthly on day N), labels.
  - **Inbox** (personal ideas): Make task (turns the idea into a personal task), Make team task (choose workspace if more than one, then opens the team TaskForm prefilled with `from_item_id`), Delete with undo.
  - **Waiting on**: add form (what, who, nudge after N days, default 3), list with "since" in words, Received (completes).

- [ ] **Step 1: Write the failing tests** — `Today.test.tsx` (renders sections from a mocked `/api/me/today`; "Keep for today" posts pin), `MyTasks.test.tsx` (quick add posts `{kind:'task', title, due_on}`; overdue date has the negative class; completing a recurring item shows the next-date toast), `RecurrencePicker.test.tsx` (weekly with Mon+Thu emits `{freq:'weekly', days:[0,3]}`).
- [ ] **Step 2–4:** run → FAIL, implement, → PASS.
- [ ] **Step 5: Commit** — `feat(frontend): Today, Inbox, My tasks, Waiting on`

---

### Task 10: Checklist and private notes on team tasks; final checks

**Files:** Create `frontend/src/components/PrivateNote.tsx`; Modify `frontend/src/pages/TaskDetailPane.tsx`, `frontend/src/pages/Tasks.tsx`, `README.md`

**Interfaces:**
- Consumes: Task 6 and Task 7 endpoints, `Checklist` from Task 9.
- Produces:
  - In `TaskDetailPane`: a "Checklist" section (editable by author or `task.edit_any` unless rejected/duplicate; read-only otherwise) and a "My notes" section labelled "Only you can see this", saving on blur and on Ctrl+Enter with a quiet "Saved" stamp.
  - In the task list: checklist progress "3/5" after the title when the checklist isn't empty.
  - README: a "My space" section (what's private and how that is enforced).

- [ ] **Step 1: Write the failing tests** — `PrivateNote.test.tsx` (loads `GET /api/me/notes/w1/t1`, saves with `PUT` on blur, shows "Saved"), `TaskDetailPane` checklist case (author can tick, viewer sees it read-only).
- [ ] **Step 2–4:** run → FAIL, implement, → PASS.
- [ ] **Step 5: Gate** — `cd backend && uv run pytest -q` and `cd frontend && npx vitest run && npx tsc -b && npm run build` all clean; `node .claude/skills/design-taste-frontend/scripts/lint.mjs --app frontend/src` → 0 FAIL; `inspect.mjs --app` on `/me/today` and `/me/tasks` (production build) → 0 FAIL; look at the screenshots and fix the worst three problems.
- [ ] **Step 6: Commit** — `feat(frontend): team checklists and private notes`
