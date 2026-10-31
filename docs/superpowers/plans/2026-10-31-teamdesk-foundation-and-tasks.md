# TeamDesk Phase 1–2 (Foundation + Tasks & Approvals) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working multi-workspace TeamDesk where people sign in with entitlement groups, capture ideas, create template-driven tasks, and approvers approve/reject them in a fast keyboard-driven queue — with a UI good enough to show off. Jira, GitHub, docs and AI come in later plans.

**Architecture:** FastAPI backend on MongoDB (PyMongo Async API). Every workspace-owned record goes through one `Scoped` data-access layer that always filters by `workspace_id`. Roles/permissions resolve per request from the workspace's group→role mappings and the user's session groups. React + TypeScript SPA (Vite, Tailwind, shadcn/ui, TanStack Query) talks to `/api`.

**Tech Stack:** Python 3.12, FastAPI, PyMongo (`AsyncMongoClient`), pydantic-settings, itsdangerous sessions (Starlette `SessionMiddleware`), pytest + pytest-asyncio + httpx; React 18+, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, react-router, cmdk, sonner (toasts), vitest + Testing Library. Package managers: `uv` (backend), `npm` (frontend). Use the latest stable versions at install time; lockfiles pin them.

**Spec:** `docs/superpowers/specs/2026-10-31-teamdesk-design.md`

## Global Constraints

- MongoDB: the real server is **8.0.26, replica set**. Use text indexes, aggregation, `find_one_and_update`, unique indexes. **No multi-document transactions** (kept simple). No Atlas Search, `mongot`, or vector indexes (need 8.2+). Tests run against the `mongo:8.0` Docker image.
- Python driver: **PyMongo Async API (`AsyncMongoClient`)**. Never Motor.
- `requires-python = ">=3.12"`; `.python-version` = `3.12` (container base is Python 3.12).
- Every read/write of workspace-owned collections goes through `Scoped` (Task 2). No direct `db[...]` access for those collections anywhere else.
- A workspace the user cannot access returns **404**, never 403 (don't reveal existence). A missing permission inside an accessible workspace returns **403**.
- Error `detail` strings are plain language and say what to do (e.g. "You can't approve your own task. Ask another approver.").
- Task statuses, verbatim: `draft`, `pending_approval`, `changes_requested`, `approved`, `in_jira`, `jira_failed`, `in_progress`, `done`, `rejected`, `duplicate`, `snoozed`. (This plan produces the first five plus `rejected`, `duplicate`, `snoozed`.)
- Permissions, verbatim: `task.view`, `task.create`, `task.edit_any`, `task.approve`, `jira.view_all`, `doc.edit`, `doc.manage_folders`, `settings.manage`, `connections.manage`, `roles.manage`. (`jira.view_all` is used by the Jira plan; it exists now so the matrix is complete.)
- Default roles: Admin, Approver, Member, Viewer (Task 4 defines their permission sets).
- **Self-approval is always blocked** (compliance control: Jira key before merge). No setting allows it.
- **Developer tasks skip the queue:** every new workspace is seeded with an enabled rule "Developer tasks skip the queue" (`author_roles: ["member"]`, other lists empty).
- **Company sign-in is out of scope** (owner adds it later). The only sign-in is the interim form (name, email, groups) through `sign_in(request, user)`.
- Length limits: task title ≤ 200 chars, each template field ≤ 20,000, comment ≤ 10,000, idea ≤ 2,000, reject reason ≤ 2,000.
- Interim sign-in is enabled only when `DEV_LOGIN_ENABLED=true` (default `false`).
- No AI code in this plan. No Jira/GitHub calls in this plan (approve ends at status `approved`).
- UI (spec §10): one token set; light + dark themes; base font size **15px**; one accent colour; WCAG 2.2 AA contrast in both themes; visible focus rings; full keyboard navigation; motion ≤ 200 ms and respects `prefers-reduced-motion`; skeleton loaders (no full-page spinners); optimistic updates for edit/approve; toasts with **Undo** for reversible actions; empty states that explain and offer one action; usable down to tablet width (768px), phone usable for capture/approve.
- Keyboard: `Ctrl/⌘+K` palette, `?` shortcut sheet, `N` new task, `I` capture idea (not Ctrl+Shift+I — that opens browser DevTools), approval queue `A` approve, `R` reject, `C` request changes, `D` duplicate, `J`/`K` next/previous. Shortcuts never fire while typing in an input/textarea/contenteditable.
- Product name "TeamDesk" is a placeholder: keep it in one constant per side (`backend/app/config.py: APP_NAME`, `frontend/src/lib/brand.ts`).

## Review Focus

1. **Group membership changes after sign-in** — an admin removes a group→role mapping; the affected user's next request must lose that access immediately (roles resolve per request, not cached in the session). Test in Task 5.
2. **Admin locks everyone out** — saving group mappings or roles that leave no mapped role with `roles.manage` must be refused with 422 and a plain message. Test in Task 5.
3. **Two approvers decide the same task at once** — the second decision gets 409 "This task was already decided", never a double transition. Test in Task 10.
4. **Editing a task after approval** — PATCH on an `approved`/`rejected`/`duplicate` task returns 409; comments still work. Test in Task 8.
5. **Hostile or huge text** — over-limit text returns 422; task text containing `<script>` renders as text, never HTML. Backend test in Task 8, frontend test in Task 14.

---

## File Structure

```
backend/
  pyproject.toml, .python-version
  app/
    main.py            create_app(settings) wiring, routers, middleware
    config.py          Settings (env), APP_NAME
    db.py              get_client/get_db, new_id(), now(), ensure_indexes()
    scoped.py          Scoped / ScopedCollection — workspace isolation layer
    auth.py            User model, session, interim sign-in, /api/auth/*
    access.py          PERMISSIONS, DEFAULT_ROLES, Ctx, workspace_ctx, require()
    workspaces.py      platform + workspace settings/mappings/roles/members routes
    audit.py           record(), audit list route
    templates.py       DEFAULT_TEMPLATES, template routes
    task_flow.py       pure: transitions, validation, rule matching
    tasks.py           task routes, numbering, search, activity, comments
    ideas.py           idea inbox routes
    approvals.py       queue, decisions, bulk approve, rules routes
    notifications.py   notify(), email, notification routes
  tests/
    conftest.py        app/client fixtures, login helper, db reset
    test_*.py          one per module
frontend/
  index.html, vite.config.ts, tailwind config, components.json
  src/
    main.tsx, App.tsx (routes)
    lib/brand.ts, lib/api.ts, lib/queries.ts, lib/useShortcut.ts, lib/types.ts
    styles/tokens.css
    components/ui/*            shadcn-generated
    components/AppShell.tsx, Sidebar.tsx, WorkspaceSwitcher.tsx, StatusBadge.tsx,
               EmptyState.tsx, QuickCapture.tsx, CommandPalette.tsx,
               NotificationBell.tsx, ShortcutSheet.tsx, Markdownish.tsx
    pages/Login.tsx, NoWorkspace.tsx, Inbox.tsx, Tasks.tsx, TaskDetailPane.tsx,
          TaskForm.tsx, Approvals.tsx, platform/Workspaces.tsx,
          settings/{SettingsLayout,General,Members,Templates,Rules,Audit}.tsx,
          mockup/{MockTasks,MockApprovals,MockDocs}.tsx
deploy/
  backend.Dockerfile, frontend.Dockerfile, nginx.conf
  openshift/{configmap,secret.example,backend,frontend,route}.yaml
README.md
```

---

## Data shapes (shared by backend tasks)

All `_id` values are strings from `new_id()` (hex of `ObjectId`). Timestamps are timezone-aware UTC `datetime`. API responses rename `_id` → `id` and drop `workspace_id`.

- `users` (install-wide, not scoped): `{_id: sub, name, email, groups: [str], last_login}`
- `workspaces` (install-wide): `{_id, name, slug (unique), archived: bool, group_mappings: [{group, role}], roles: {role_key: {name, permissions: [str]}}, created_at}`
- Scoped collections (all have `workspace_id`): `templates`, `tasks`, `ideas`, `rules`, `activity`, `audit`, `notifications`, `counters`.
- `templates`: `{key, name, jira_issue_type, sections: [{key, label, required: bool, hint}], default_labels: [str], archived: bool}`; unique `(workspace_id, key)`.
- `tasks`: `{number: int, type_key, title, fields: {section_key: str}, labels: [str], status, author: {sub, name, email}, decision: {action, by: {sub, name}, at, reason} | None, duplicate_of: str | None, snoozed_until: datetime | None, search_text: str, jira_key: None, created_at, updated_at, submitted_at}`; text index on `(title, search_text)`; unique `(workspace_id, number)`.
- `ideas`: `{owner_sub, text, promoted_task_id: str | None, created_at}`
- `rules`: `{name, enabled: bool, type_keys: [str], author_roles: [str], labels_any: [str]}`
- `activity`: `{task_id, at, actor: {sub, name}, kind: "created"|"edited"|"submitted"|"decision"|"comment"|"auto_approved", data: dict}`
- `audit`: `{at, actor: {sub, name}, action: str, target: str, data: dict}`
- `notifications`: `{user_sub, kind, task_id, text, read: bool, created_at}`
- `counters`: `{_id: "<workspace_id>:tasks", seq: int}`

---

### Task 1: Backend scaffold, settings, database and test harness

**Files:**
- Create: `backend/pyproject.toml`, `backend/.python-version`, `backend/app/__init__.py`, `backend/app/config.py`, `backend/app/db.py`, `backend/app/main.py`, `backend/tests/conftest.py`, `backend/tests/test_health.py`, `.gitignore`

**Interfaces:**
- Produces:
  - `class Settings(BaseSettings)` fields: `mongo_uri: str = "mongodb://localhost:27017"`, `mongo_db: str = "teamdesk"`, `session_secret: str`, `session_max_age: int = 28800`, `https_only_cookies: bool = True`, `dev_login_enabled: bool = False`, `platform_owner_group: str = "teamdesk-platform-owners"`, `smtp_host: str = ""`, `smtp_port: int = 587`, `smtp_user: str = ""`, `smtp_password: str = ""`, `smtp_from: str = "teamdesk@localhost"`, `public_url: str = "http://localhost:5173"`. Env vars are the upper-case names.
  - `APP_NAME = "TeamDesk"`
  - `db.py`: `def new_id() -> str`, `def now() -> datetime`, `async def ensure_indexes(db: AsyncDatabase) -> None`
  - `main.py`: `def create_app(settings: Settings | None = None) -> FastAPI`; sets `app.state.settings`, `app.state.db` (`AsyncMongoClient(settings.mongo_uri)[settings.mongo_db]`); runs `ensure_indexes` in lifespan; `GET /api/health` → `{"ok": true, "mongo": "<server version>"}`.
  - `conftest.py` fixtures: `settings` (mongo_uri from env `TEST_MONGO_URI`, default `mongodb://localhost:27018`; `mongo_db="teamdesk_test"`; `dev_login_enabled=True`; `https_only_cookies=False`; `session_secret="test"`), `app` (fresh `create_app(settings)`, drops the test db, awaits `ensure_indexes`), `make_client` (async factory returning a new `httpx.AsyncClient(transport=ASGITransport(app), base_url="http://t")` — each client has its own cookies), `db` (= `app.state.db`).

- [ ] **Step 1: Start the test database**

Run: `docker run -d --name teamdesk-mongo-test -p 27018:27017 mongo:4.4`
Expected: container id printed; `docker ps` shows it running.

- [ ] **Step 2: Create the uv project**

Run in `backend/`: `uv init --app --python 3.12`, then `uv add fastapi uvicorn[standard] pymongo pydantic-settings itsdangerous httpx` and `uv add --dev pytest pytest-asyncio`. In `pyproject.toml` set `[tool.pytest.ini_options] asyncio_mode = "auto"`.

- [ ] **Step 3: Write the failing test** — `tests/test_health.py`

```python
async def test_health_reports_mongo_version(make_client):
    c = await make_client()
    r = await c.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["mongo"].startswith("4.4")
```

- [ ] **Step 4: Run it to verify it fails**

Run: `uv run pytest tests/test_health.py -v`
Expected: FAIL (import error, `app.main` missing).

- [ ] **Step 5: Implement `config.py`, `db.py`, `main.py`, `conftest.py`** per Interfaces. `ensure_indexes` creates every index listed in "Data shapes" (unique `workspaces.slug`; `templates (workspace_id, key)` unique; `tasks (workspace_id, number)` unique; `tasks` text index `title` + `search_text`; `tasks (workspace_id, status, submitted_at)`; `ideas (workspace_id, owner_sub)`; `activity (workspace_id, task_id, at)`; `audit (workspace_id, at)`; `notifications (workspace_id, user_sub, read)`). Health gets the version from `await db.command("buildInfo")`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `uv run pytest -v`
Expected: PASS. If PyMongo refuses the 4.4 server (wire-version error), pin the newest PyMongo release that supports 4.4 and note it in `README.md`.

- [ ] **Step 7: Commit**

```bash
git add backend .gitignore
git commit -m "feat(backend): scaffold FastAPI app, settings, Mongo and test harness"
```

---

### Task 2: Workspace isolation layer (`Scoped`)

**Files:**
- Create: `backend/app/scoped.py`, `backend/tests/test_scoped.py`

**Interfaces:**
- Consumes: `new_id()`, `now()` (Task 1)
- Produces:
  - `class Scoped: def __init__(self, db: AsyncDatabase, workspace_id: str)`; `def col(self, name: str) -> ScopedCollection`; attribute `workspace_id`.
  - `class ScopedCollection` methods (all add `{"workspace_id": ws}` to every filter, overriding any caller-supplied `workspace_id`):
    - `async def insert(self, doc: dict) -> dict` — sets `_id` (if absent) via `new_id()`, `workspace_id`, `created_at` (if absent); returns the stored doc.
    - `async def find(self, filter: dict, sort: list[tuple[str, int]] | None = None, limit: int = 0) -> list[dict]`
    - `async def find_one(self, filter: dict) -> dict | None`
    - `async def update(self, filter: dict, update: dict) -> dict | None` — `find_one_and_update(..., return_document=AFTER)`; refuses (raises `ValueError`) if `update` tries to `$set`/`$unset` `workspace_id`.
    - `async def count(self, filter: dict) -> int`
    - `async def delete(self, filter: dict) -> int`
    - `async def next_seq(self, name: str) -> int` — atomic `$inc` on `counters` doc `_id = f"{ws}:{name}"`, upsert, returns new value.
  - `def out(doc: dict) -> dict` — copy with `_id`→`id`, `workspace_id` removed.

- [ ] **Step 1: Write the failing tests**

```python
from app.scoped import Scoped, out

async def test_reads_never_cross_workspaces(db):
    a, b = Scoped(db, "wa").col("tasks"), Scoped(db, "wb").col("tasks")
    doc = await a.insert({"title": "secret"})
    assert await b.find({}) == []
    assert await b.find_one({"_id": doc["_id"]}) is None
    assert await b.find({"workspace_id": "wa"}) == []        # caller can't override

async def test_writes_never_cross_workspaces(db):
    a, b = Scoped(db, "wa").col("tasks"), Scoped(db, "wb").col("tasks")
    doc = await a.insert({"title": "x"})
    assert await b.update({"_id": doc["_id"]}, {"$set": {"title": "y"}}) is None
    assert await b.delete({"_id": doc["_id"]}) == 0
    assert (await a.find_one({"_id": doc["_id"]}))["title"] == "x"

async def test_cannot_move_doc_to_other_workspace(db):
    a = Scoped(db, "wa").col("tasks")
    doc = await a.insert({"title": "x"})
    with pytest.raises(ValueError):
        await a.update({"_id": doc["_id"]}, {"$set": {"workspace_id": "wb"}})

async def test_next_seq_is_per_workspace_and_increments(db):
    assert [await Scoped(db, "wa").next_seq("tasks") for _ in range(3)] == [1, 2, 3]
    assert await Scoped(db, "wb").next_seq("tasks") == 1

def test_out_renames_id_and_hides_workspace():
    assert out({"_id": "1", "workspace_id": "w", "t": 1}) == {"id": "1", "t": 1}
```

(`next_seq` lives on `Scoped`; it uses the `counters` collection.)

- [ ] **Step 2: Run to verify failure** — `uv run pytest tests/test_scoped.py -v` → FAIL (module missing).
- [ ] **Step 3: Implement `scoped.py`** per Interfaces.
- [ ] **Step 4: Run to verify pass** — `uv run pytest -v` → all PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(backend): workspace-scoped data access layer"`

---

### Task 3: Sessions and interim sign-in (`/me` stub)

Company login is out of scope (owner adds it later). This task builds the session and the single `sign_in` seam the real login will call.

**Files:**
- Create: `backend/app/auth.py`, `backend/tests/test_auth.py`; Modify: `backend/app/main.py`, `backend/tests/conftest.py`

**Interfaces:**
- Consumes: `Settings`, `now()`
- Produces:
  - `class User(BaseModel)`: `sub: str` (1–100 chars), `name: str` (1–100), `email: str` (≤200), `groups: list[str]` (each 1–200 chars, ≤200 items); `def is_platform_owner(user: User, settings: Settings) -> bool`.
  - `async def current_user(request: Request) -> User` dependency — reads `request.session["user"]`; 401 `"Please sign in."` if absent.
  - `async def sign_in(request: Request, user: User) -> None` — the one entry point for any sign-in method: stores user in session and upserts `users` (`_id=sub`, name, email, groups, `last_login=now()`).
  - Routes: `POST /api/auth/dev-login` body `User` → 204 (404 when `dev_login_enabled` is false); `POST /api/auth/logout` → clears session, 204.
  - `main.py` adds `SessionMiddleware(secret_key=settings.session_secret, max_age=settings.session_max_age, https_only=settings.https_only_cookies, same_site="lax")`.
  - `conftest.py` helper: `async def login(client, sub: str, groups: list[str], name: str | None = None)` posting dev-login (name defaults to `sub.title()`, email `f"{sub}@example.com"`).

- [ ] **Step 1: Write the failing tests**

```python
async def test_dev_login_then_session_user(make_client, db):
    c = await make_client()
    await login(c, "asha", ["g1"])
    r = await c.get("/api/auth/me")
    assert r.status_code == 200 and r.json()["user"]["sub"] == "asha"
    assert (await db.users.find_one({"_id": "asha"}))["groups"] == ["g1"]

async def test_me_requires_login(make_client):
    assert (await (await make_client()).get("/api/auth/me")).status_code == 401

async def test_dev_login_disabled_returns_404(settings):
    settings.dev_login_enabled = False
    c = httpx.AsyncClient(transport=ASGITransport(create_app(settings)), base_url="http://t")
    assert (await c.post("/api/auth/dev-login", json={"sub": "x", "name": "x", "email": "", "groups": []})).status_code == 404

async def test_logout_clears_session(make_client):
    c = await make_client(); await login(c, "asha", [])
    await c.post("/api/auth/logout")
    assert (await c.get("/api/auth/me")).status_code == 401
```

- [ ] **Step 2: Run to verify failure** — `uv run pytest tests/test_auth.py -v` → FAIL.
- [ ] **Step 3: Implement `auth.py`** per Interfaces. `GET /api/auth/me` for now returns `{"user": {sub, name, email, is_platform_owner}, "workspaces": []}`; Task 4 fills `workspaces`.
- [ ] **Step 4: Run to verify pass** — `uv run pytest -v` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(backend): sessions and interim sign-in"`

---

### Task 4: Access control, platform workspaces, `/me` workspaces

**Files:**
- Create: `backend/app/access.py`, `backend/app/workspaces.py`, `backend/tests/test_access.py`, `backend/tests/test_platform.py`; Modify: `backend/app/auth.py` (`/me`), `backend/app/main.py`

**Interfaces:**
- Consumes: `User`, `current_user`, `is_platform_owner`, `Scoped`
- Produces:
  - `PERMISSIONS: tuple[str, ...]` (the ten from Global Constraints).
  - `DEFAULT_ROLES: dict[str, dict]`:
    - `admin` "Admin": all ten
    - `approver` "Approver": `task.view, task.create, task.approve, jira.view_all, doc.edit`
    - `member` "Member": `task.view, task.create, doc.edit`
    - `viewer` "Viewer": `task.view`
  - `def resolve(workspace: dict, groups: list[str]) -> tuple[list[str], set[str]]` — returns (matched role keys sorted, union of their permissions). Mappings to unknown role keys are ignored.
  - `@dataclass class Ctx: user: User; workspace: dict; roles: list[str]; perms: set[str]; scoped: Scoped` with `def can(self, perm) -> bool`.
  - `async def workspace_ctx(workspace_id: str, request: Request, user: User = Depends(current_user)) -> Ctx` — loads workspace (not archived); 404 `"Workspace not found."` if missing, archived, or `perms` is empty. Groups come from the session user (fresh from login), roles from the workspace doc **read on every request**.
  - `def require(perm: str) -> Callable` — dependency returning `Ctx`; 403 `"You don't have permission to do this. Ask a workspace admin."` when missing.
  - `async def create_workspace(db, name: str, slug: str, admin_group: str) -> dict` — inserts workspace with `DEFAULT_ROLES`, `group_mappings=[{"group": admin_group, "role": "admin"}]`, `archived=False`. (Task 6 adds template seeding and Task 10 adds rule seeding inside this function.)
  - Platform routes (dependency: platform owner else 403): `POST /api/platform/workspaces {name, slug, admin_group}` → 201 `{id, name, slug, archived, admin_groups}`; slug `^[a-z0-9-]{2,40}$`, duplicate slug → 409 `"That short name is taken."`; `GET /api/platform/workspaces` → list of the same shape (no content counts); `POST /api/platform/workspaces/{id}/archive` → 204.
  - `/api/auth/me` `workspaces`: `[{id, name, slug, roles, permissions}]` for every non-archived workspace where `resolve` gives ≥1 permission, sorted by name.

- [ ] **Step 1: Write the failing tests**

```python
# test_access.py
from app.access import resolve, DEFAULT_ROLES

WS = {"roles": DEFAULT_ROLES, "group_mappings": [
    {"group": "g-admin", "role": "admin"}, {"group": "g-dev", "role": "member"},
    {"group": "g-ghost", "role": "nope"}]}

def test_resolve_unions_roles():
    roles, perms = resolve(WS, ["g-dev", "g-admin"])
    assert roles == ["admin", "member"] and "roles.manage" in perms

def test_resolve_ignores_unknown_roles_and_groups():
    assert resolve(WS, ["g-ghost", "other"]) == ([], set())

# test_platform.py
OWNER = ["teamdesk-platform-owners"]

async def test_owner_creates_workspace_and_admin_group_sees_it(make_client):
    owner = await make_client(); await login(owner, "own", OWNER)
    r = await owner.post("/api/platform/workspaces", json={"name": "Data Eng", "slug": "data-eng", "admin_group": "g-admin"})
    assert r.status_code == 201
    admin = await make_client(); await login(admin, "adm", ["g-admin"])
    ws = (await admin.get("/api/auth/me")).json()["workspaces"]
    assert [w["slug"] for w in ws] == ["data-eng"] and "settings.manage" in ws[0]["permissions"]

async def test_non_owner_cannot_create(make_client):
    c = await make_client(); await login(c, "x", ["g-admin"])
    assert (await c.post("/api/platform/workspaces", json={"name": "A", "slug": "aa", "admin_group": "g"})).status_code == 403

async def test_duplicate_slug_409(make_client):
    c = await make_client(); await login(c, "own", OWNER)
    body = {"name": "A", "slug": "aa", "admin_group": "g"}
    await c.post("/api/platform/workspaces", json=body)
    assert (await c.post("/api/platform/workspaces", json=body)).status_code == 409

async def test_owner_without_mapping_cannot_open_workspace(make_client):
    c = await make_client(); await login(c, "own", OWNER)
    wid = (await c.post("/api/platform/workspaces", json={"name": "A", "slug": "aa", "admin_group": "g"})).json()["id"]
    assert (await c.get(f"/api/w/{wid}/settings")).status_code == 404

async def test_archived_workspace_disappears(make_client):
    ...  # create, archive, admin's /me lists nothing and /api/w/{id}/settings is 404
```

(`/api/w/{wid}/settings` arrives in Task 5; until then `test_owner_without_mapping_cannot_open_workspace` and the archive test are marked `@pytest.mark.xfail(strict=True)` and the marker is removed in Task 5.)

- [ ] **Step 2: Run to verify failure** — `uv run pytest tests/test_access.py tests/test_platform.py -v` → FAIL.
- [ ] **Step 3: Implement `access.py` and platform routes in `workspaces.py`;** update `/me`. Add `conftest` helper `async def make_workspace(make_client, slug="team", admin_group="g-admin") -> str` (logs in a platform owner, creates, returns id).
- [ ] **Step 4: Run to verify pass** — `uv run pytest -v` → PASS (the two xfail tests report XFAIL).
- [ ] **Step 5: Commit** — `git commit -m "feat(backend): roles, permissions and platform workspaces"`

---

### Task 5: Workspace settings, group mappings, roles matrix, members, audit

**Files:**
- Create: `backend/app/audit.py`, `backend/tests/test_workspace_settings.py`; Modify: `backend/app/workspaces.py`, `backend/tests/test_platform.py` (remove xfail markers)

**Interfaces:**
- Consumes: `Ctx`, `require`, `resolve`, `PERMISSIONS`, `Scoped`
- Produces:
  - `async def record(ctx: Ctx, action: str, target: str, data: dict | None = None) -> None` — inserts into scoped `audit` with `actor={sub, name}`, `at=now()`.
  - `GET /api/w/{wid}/audit?limit=100` (`settings.manage`) → newest first.
  - `GET /api/w/{wid}/settings` (`settings.manage`) → `{name, slug, group_mappings, roles}`.
  - `PATCH /api/w/{wid}/settings {name}` (`settings.manage`, name 1–100 chars) → same shape; audit `settings.updated`.
  - `PUT /api/w/{wid}/group-mappings [{group, role}]` (`roles.manage`) → saved list; 422 `"Unknown role: <key>."`; 422 `"At least one group must map to a role that can manage roles, or nobody could fix access."` when no mapping targets a role holding `roles.manage`; audit `group_mappings.updated`.
  - `PUT /api/w/{wid}/roles {role_key: {name, permissions}}` (`roles.manage`) — replaces the role set; keys `^[a-z0-9_-]{2,30}$`; 422 on unknown permission; same lockout check against current mappings; mappings to removed roles are dropped; audit `roles.updated`.
  - `GET /api/w/{wid}/members` (`task.view`) → `[{sub, name, email, roles}]` from `users` whose groups give ≥1 role in this workspace, sorted by name.

- [ ] **Step 1: Write the failing tests**

```python
async def test_admin_reads_and_updates_settings(make_client):
    wid = await make_workspace(make_client)
    a = await make_client(); await login(a, "adm", ["g-admin"])
    r = await a.patch(f"/api/w/{wid}/settings", json={"name": "Data Platform"})
    assert r.json()["name"] == "Data Platform"
    log = (await a.get(f"/api/w/{wid}/audit")).json()
    assert log[0]["action"] == "settings.updated" and log[0]["actor"]["sub"] == "adm"

async def test_member_cannot_read_settings(make_client):
    wid = await make_workspace(make_client)
    a = await make_client(); await login(a, "adm", ["g-admin"])
    await a.put(f"/api/w/{wid}/group-mappings", json=[{"group": "g-admin", "role": "admin"}, {"group": "g-dev", "role": "member"}])
    m = await make_client(); await login(m, "dev", ["g-dev"])
    assert (await m.get(f"/api/w/{wid}/settings")).status_code == 403

async def test_removing_mapping_takes_effect_on_next_request(make_client):   # Review Focus 1
    wid = await make_workspace(make_client)
    a = await make_client(); await login(a, "adm", ["g-admin"])
    await a.put(f"/api/w/{wid}/group-mappings", json=[{"group": "g-admin", "role": "admin"}, {"group": "g-dev", "role": "member"}])
    m = await make_client(); await login(m, "dev", ["g-dev"])
    assert (await m.get(f"/api/w/{wid}/members")).status_code == 200
    await a.put(f"/api/w/{wid}/group-mappings", json=[{"group": "g-admin", "role": "admin"}])
    assert (await m.get(f"/api/w/{wid}/members")).status_code == 404

async def test_lockout_is_refused(make_client):                                # Review Focus 2
    wid = await make_workspace(make_client)
    a = await make_client(); await login(a, "adm", ["g-admin"])
    r = await a.put(f"/api/w/{wid}/group-mappings", json=[{"group": "g-admin", "role": "member"}])
    assert r.status_code == 422 and "nobody could fix access" in r.json()["detail"]
    roles = dict(DEFAULT_ROLES); roles["admin"] = {"name": "Admin", "permissions": ["task.view"]}
    assert (await a.put(f"/api/w/{wid}/roles", json=roles)).status_code == 422

async def test_unknown_role_and_permission_rejected(make_client): ...  # 422 for both
async def test_members_lists_seen_users_with_roles(make_client): ...  # dev logged in once → appears with ["member"]
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement** `audit.py` and the settings routes in `workspaces.py`. Remove the xfail markers in `test_platform.py`.
- [ ] **Step 4: Run to verify pass** — `uv run pytest -v` → all PASS, no XFAIL.
- [ ] **Step 5: Commit** — `git commit -m "feat(backend): workspace settings, group mappings, roles matrix, audit"`

---

### Task 6: Ticket templates (task types)

**Files:**
- Create: `backend/app/templates.py`, `backend/tests/test_templates.py`; Modify: `backend/app/access.py` (`create_workspace` seeds templates), `backend/app/main.py`

**Interfaces:**
- Consumes: `Ctx`, `require`, `record`, `Scoped`
- Produces:
  - `DEFAULT_TEMPLATES: list[dict]` — exact values:
    - `story` "Story", jira_issue_type "Story", sections: `context` "Context" required, `scope` "Scope" required, `acceptance` "Acceptance criteria" required, `out_of_scope` "Out of scope" optional
    - `bug` "Bug", "Bug": `steps` "Steps to reproduce" req, `expected` "Expected" req, `actual` "Actual" req, `context` "Context" optional
    - `spike` "Spike", "Task": `question` "Question to answer" req, `timebox` "Timebox" req, `output` "Expected output" req
    - `tech_debt` "Tech debt", "Task": `context` "Context" req, `scope` "Scope" req, `acceptance` "Acceptance criteria" req
    - every section has a one-line `hint`; `default_labels: []`
  - `async def seed_templates(scoped: Scoped) -> None`
  - Routes: `GET /api/w/{wid}/templates` (`task.view`) → non-archived, in insertion order; `POST` (`settings.manage`) `{key, name, jira_issue_type, sections, default_labels}` → 201, 409 on duplicate key; `PUT /api/w/{wid}/templates/{key}` (`settings.manage`); `DELETE /api/w/{wid}/templates/{key}` → archives (204). Section keys `^[a-z0-9_]{1,30}$` unique within template; ≥1 section. Each write audits `template.created|updated|archived`.
  - `async def get_template(ctx: Ctx, key: str) -> dict` — 422 `"Unknown task type: <key>."` if missing/archived.

- [ ] **Step 1: Write the failing tests**

```python
async def test_new_workspace_has_default_templates(make_client):
    wid = await make_workspace(make_client)
    a = await make_client(); await login(a, "adm", ["g-admin"])
    keys = [t["key"] for t in (await a.get(f"/api/w/{wid}/templates")).json()]
    assert keys == ["story", "bug", "spike", "tech_debt"]

async def test_admin_adds_and_archives_template(make_client): ...  # POST 201, dup 409, DELETE → gone from GET
async def test_template_needs_a_section_and_valid_keys(make_client): ...  # sections=[] → 422; key "Bad Key" → 422
async def test_templates_are_per_workspace(make_client): ...  # custom template in A not listed in B
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement** `templates.py`; call `seed_templates` inside `create_workspace`.
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(backend): template-driven task types"`

---

### Task 7: Task flow rules (pure module)

**Files:**
- Create: `backend/app/task_flow.py`, `backend/tests/test_task_flow.py`

**Interfaces:**
- Produces:
  - `EDITABLE = {"draft", "changes_requested", "pending_approval"}`
  - `def next_status(current: str, action: str) -> str` — raises `InvalidTransition(str)` for anything not in this table:

    | action | from | to |
    |---|---|---|
    | `submit` | draft, changes_requested | pending_approval |
    | `auto_approve` | draft, changes_requested | approved |
    | `approve` | pending_approval, snoozed | approved |
    | `reject` | pending_approval, snoozed | rejected |
    | `request_changes` | pending_approval, snoozed | changes_requested |
    | `duplicate` | pending_approval, snoozed | duplicate |
    | `snooze` | pending_approval | snoozed |

  - `def from_statuses(action: str) -> list[str]` — the "from" column, used as the atomic update precondition.
  - `def missing_required(template: dict, fields: dict[str, str]) -> dict[str, str]` — `{section_key: "<Label> is required."}` for required sections that are absent or whitespace-only.
  - `def search_text(fields: dict[str, str], labels: list[str]) -> str` — field values then labels, space-joined.
  - `def rule_matches(rule: dict, type_key: str, author_roles: list[str], labels: list[str]) -> bool` — `False` if not `enabled` or all three condition lists are empty; otherwise each non-empty list must match (`type_key in type_keys`; any author role in `author_roles`; any label in `labels_any`).

- [ ] **Step 1: Write the failing tests**

```python
@pytest.mark.parametrize("cur,action,new", [
    ("draft", "submit", "pending_approval"), ("changes_requested", "submit", "pending_approval"),
    ("draft", "auto_approve", "approved"), ("pending_approval", "approve", "approved"),
    ("snoozed", "approve", "approved"), ("pending_approval", "reject", "rejected"),
    ("pending_approval", "request_changes", "changes_requested"),
    ("pending_approval", "duplicate", "duplicate"), ("pending_approval", "snooze", "snoozed")])
def test_allowed(cur, action, new):
    assert next_status(cur, action) == new

@pytest.mark.parametrize("cur,action", [("approved", "approve"), ("rejected", "submit"),
    ("draft", "approve"), ("snoozed", "snooze"), ("approved", "reject")])
def test_refused(cur, action):
    with pytest.raises(InvalidTransition):
        next_status(cur, action)

def test_missing_required_flags_blank_values():
    tpl = {"sections": [{"key": "context", "label": "Context", "required": True},
                        {"key": "notes", "label": "Notes", "required": False}]}
    assert missing_required(tpl, {"context": "  "}) == {"context": "Context is required."}
    assert missing_required(tpl, {"context": "ok"}) == {}

def test_rule_matching():
    r = {"enabled": True, "type_keys": ["tech_debt"], "author_roles": ["member"], "labels_any": []}
    assert rule_matches(r, "tech_debt", ["member"], [])
    assert not rule_matches(r, "story", ["member"], [])
    assert not rule_matches({**r, "enabled": False}, "tech_debt", ["member"], [])
    assert not rule_matches({"enabled": True, "type_keys": [], "author_roles": [], "labels_any": []}, "x", [], [])
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement** `task_flow.py`.
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(backend): task status flow and rule matching"`

---

### Task 8: Tasks API (create, list, search, edit, submit, activity, comments)

**Files:**
- Create: `backend/app/tasks.py`, `backend/tests/test_tasks.py`; Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: `Ctx`, `require`, `get_template`, `task_flow.*`, `Scoped.next_seq`, `out`
- Produces:
  - `async def log_activity(ctx: Ctx, task_id: str, kind: str, data: dict | None = None) -> None`
  - `async def submit_task(ctx: Ctx, task: dict) -> dict` — validates required fields (422 `{"message": "Some required fields are empty.", "fields": {...}}`), then applies `auto_approve` if any enabled rule matches (Task 10 supplies `find_matching_rule`; until then this function only does `submit`), sets `submitted_at`, logs `submitted` (or `auto_approved` with rule name), returns task. Task 10 adds the notification hook.
  - Routes (all under `/api/w/{wid}`):
    - `POST /tasks` (`task.create`) `{type_key, title, fields, labels, submit: bool = false, from_idea_id?}` → 201 task. Unknown `fields` keys (not in template sections) → 422. `labels` default to template `default_labels` when omitted. If `from_idea_id` given and that idea is the caller's, set its `promoted_task_id`.
    - `GET /tasks?status=a,b&type=&mine=true&q=&limit=200` (`task.view`) — `q` uses `$text` search, sorted by text score; otherwise newest `updated_at` first. Max limit 500.
    - `GET /tasks/similar?text=` (`task.view`) → up to 5 `{id, number, title, status}` by text score, excluding `rejected`, `duplicate`, `done`; empty `text` → `[]`.
    - `GET /tasks/{id}` (`task.view`) → task; 404 `"Task not found."`.
    - `PATCH /tasks/{id}` `{title?, type_key?, fields?, labels?}` — allowed for the author or `task.edit_any`, only when status in `EDITABLE`, else 409 `"This task is already decided and can't be edited. Add a comment instead."`; re-computes `search_text`; logs `edited` with changed keys.
    - `POST /tasks/{id}/submit` — author or `task.edit_any`.
    - `GET /tasks/{id}/activity` → oldest first.
    - `POST /tasks/{id}/comments {text}` (`task.view`) → 201 activity item (`kind="comment"`, `data={"text": ...}`); allowed in any status.
  - Task JSON = stored doc through `out()`, minus `search_text`.

- [ ] **Step 1: Write the failing tests** (fixture `ws_with_dev` in conftest: workspace + mappings `g-admin→admin`, `g-appr→approver`, `g-dev→member`, `g-view→viewer`; returns `(wid, clients)` with logged-in `adm`, `appr`, `dev`, `view`. From Task 10 on, the fixture also deletes the workspace's seeded rules (`db.rules.delete_many({"workspace_id": wid})`) so tests control auto-approval explicitly.)

```python
# STORY lives in tests/conftest.py (shared by later test files)
STORY = {"type_key": "story", "title": "Add retry to loader",
         "fields": {"context": "flaky", "scope": "loader", "acceptance": "retries 3x"}}

async def test_create_draft_then_submit(ws_with_dev):
    wid, c = ws_with_dev
    t = (await c["dev"].post(f"/api/w/{wid}/tasks", json=STORY)).json()
    assert (t["status"], t["number"]) == ("draft", 1)
    t = (await c["dev"].post(f"/api/w/{wid}/tasks/{t['id']}/submit")).json()
    assert t["status"] == "pending_approval"
    kinds = [a["kind"] for a in (await c["dev"].get(f"/api/w/{wid}/tasks/{t['id']}/activity")).json()]
    assert kinds == ["created", "submitted"]

async def test_submit_with_missing_required_field_lists_fields(ws_with_dev):
    wid, c = ws_with_dev
    r = await c["dev"].post(f"/api/w/{wid}/tasks", json={**STORY, "fields": {"context": "x"}, "submit": True})
    assert r.status_code == 422
    assert r.json()["detail"]["fields"] == {"scope": "Scope is required.", "acceptance": "Acceptance criteria is required."}

async def test_viewer_cannot_create(ws_with_dev):
    wid, c = ws_with_dev
    assert (await c["view"].post(f"/api/w/{wid}/tasks", json=STORY)).status_code == 403

async def test_search_and_similar(ws_with_dev):
    wid, c = ws_with_dev
    await c["dev"].post(f"/api/w/{wid}/tasks", json=STORY)
    hits = (await c["dev"].get(f"/api/w/{wid}/tasks", params={"q": "retry"})).json()
    assert [h["title"] for h in hits] == ["Add retry to loader"]
    sim = (await c["dev"].get(f"/api/w/{wid}/tasks/similar", params={"text": "loader retry logic"})).json()
    assert sim[0]["title"] == "Add retry to loader"

async def test_task_in_other_workspace_is_404(ws_with_dev, make_client):
    wid, c = ws_with_dev
    t = (await c["dev"].post(f"/api/w/{wid}/tasks", json=STORY)).json()
    other = await make_workspace(make_client, slug="other", admin_group="g-dev")  # dev is admin there
    assert (await c["dev"].get(f"/api/w/{other}/tasks/{t['id']}")).status_code == 404

async def test_only_author_or_edit_any_can_edit(ws_with_dev): ...  # appr PATCH dev's task → 403; adm (edit_any) → 200

async def test_decided_task_is_not_editable_but_commentable(ws_with_dev, db):   # Review Focus 4
    wid, c = ws_with_dev
    t = (await c["dev"].post(f"/api/w/{wid}/tasks", json=STORY)).json()
    await db.tasks.update_one({"_id": t["id"]}, {"$set": {"status": "approved"}})
    assert (await c["dev"].patch(f"/api/w/{wid}/tasks/{t['id']}", json={"title": "x"})).status_code == 409
    assert (await c["dev"].post(f"/api/w/{wid}/tasks/{t['id']}/comments", json={"text": "fyi"})).status_code == 201

async def test_over_limit_text_is_422(ws_with_dev):                               # Review Focus 5
    wid, c = ws_with_dev
    assert (await c["dev"].post(f"/api/w/{wid}/tasks", json={**STORY, "title": "x" * 201})).status_code == 422
    big = {**STORY, "fields": {**STORY["fields"], "context": "x" * 20001}}
    assert (await c["dev"].post(f"/api/w/{wid}/tasks", json=big)).status_code == 422

async def test_unknown_field_key_is_422(ws_with_dev): ...
async def test_numbers_are_sequential_per_workspace(ws_with_dev): ...  # 1, 2, 3
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement** `tasks.py` per Interfaces. Pydantic request models carry the length limits (`Field(max_length=...)`, and a validator for each `fields` value).
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(backend): tasks API with search, activity and comments"`

---

### Task 9: Idea inbox

**Files:**
- Create: `backend/app/ideas.py`, `backend/tests/test_ideas.py`; Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: `Ctx`, `require`
- Produces: under `/api/w/{wid}`, all requiring `task.create`, and always filtered by `owner_sub = ctx.user.sub`:
  - `GET /ideas` → caller's ideas where `promoted_task_id` is null, newest first.
  - `POST /ideas {text}` (1–2,000 chars, trimmed) → 201.
  - `DELETE /ideas/{id}` → 204; 404 if not the caller's.

- [ ] **Step 1: Write the failing tests**

```python
async def test_ideas_are_private(ws_with_dev):
    wid, c = ws_with_dev
    await c["dev"].post(f"/api/w/{wid}/ideas", json={"text": "cache schema lookups?"})
    assert [i["text"] for i in (await c["dev"].get(f"/api/w/{wid}/ideas")).json()] == ["cache schema lookups?"]
    assert (await c["adm"].get(f"/api/w/{wid}/ideas")).json() == []

async def test_promoted_idea_leaves_inbox(ws_with_dev):
    wid, c = ws_with_dev
    idea = (await c["dev"].post(f"/api/w/{wid}/ideas", json={"text": "retry"})).json()
    await c["dev"].post(f"/api/w/{wid}/tasks", json={**STORY, "from_idea_id": idea["id"]})
    assert (await c["dev"].get(f"/api/w/{wid}/ideas")).json() == []

async def test_cannot_delete_someone_elses_idea(ws_with_dev): ...  # adm DELETE dev's idea → 404
async def test_blank_idea_is_422(ws_with_dev): ...                 # "   " → 422
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement** `ideas.py`.
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(backend): private idea inbox"`

---

### Task 10: Approvals, decisions, bulk approve, auto-approve rules

**Files:**
- Create: `backend/app/approvals.py`, `backend/tests/test_approvals.py`; Modify: `backend/app/tasks.py` (`submit_task` uses rules), `backend/app/main.py`

**Interfaces:**
- Consumes: `next_status`, `from_statuses`, `rule_matches`, `submit_task`, `log_activity`, `record`
- Produces:
  - `async def find_matching_rule(ctx: Ctx, task: dict) -> dict | None` — first enabled rule (insertion order) matching `task.type_key`, `ctx.roles`, `task.labels`.
  - `async def decide(ctx: Ctx, task_id: str, action: str, reason: str | None = None, duplicate_of: str | None = None, until: datetime | None = None) -> dict` — checks: `task.approve` (403); task exists (404); `approve` on own task (author `sub` == caller `sub`) → always 403 `"You can't approve your own task. Ask another approver."`; `reject` needs `reason` and `request_changes` needs `reason` (422 `"Please add a reason so the author knows what to change."`); `duplicate` needs `duplicate_of` pointing to another task in this workspace (422); `snooze` needs a future `until` (422). Then atomic `update({"_id": id, "status": {"$in": from_statuses(action)}}, ...)` setting `status`, `decision={action, by, at, reason}`, `duplicate_of`/`snoozed_until`; `None` → 409 `"This task was already decided by someone else. Refresh to see the latest."`. Logs `decision` activity and audits `task.<action>`. Returns task.
  - Routes under `/api/w/{wid}`:
    - `GET /approvals` (`task.approve`) → tasks with `status == "pending_approval"` or (`status == "snoozed"` and `snoozed_until <= now`), oldest `submitted_at` first.
    - `GET /approvals/count` (`task.approve`) → `{"count": n}` (same filter).
    - `POST /tasks/{id}/decision {action, reason?, duplicate_of?, until?}` → task.
    - `POST /approvals/bulk-approve {task_ids: [str]}` (max 100) → `{"approved": [id], "failed": [{"id", "error"}]}` — per-task `decide`, errors collected not raised.
    - Rules: `GET /rules`, `POST /rules` (201), `PUT /rules/{id}`, `DELETE /rules/{id}` — all `settings.manage`; body `{name, enabled, type_keys, author_roles, labels_any}`; 422 `"A rule needs at least one condition."` when all lists empty; audit `rule.created|updated|deleted`.
  - `DEFAULT_RULES = [{"name": "Developer tasks skip the queue", "enabled": True, "type_keys": [], "author_roles": ["member"], "labels_any": []}]`; `async def seed_rules(scoped: Scoped) -> None`, called from `create_workspace`.
  - `submit_task` now: if `find_matching_rule` returns a rule → `auto_approve`, `decision={"action": "approve", "by": {"sub": "rule", "name": rule["name"]}, ...}`, activity `auto_approved`, audit `rule.fired`.

- [ ] **Step 1: Write the failing tests**

```python
# submitted() lives in tests/conftest.py (Task 11 reuses it)
async def submitted(c, wid, who="dev"):
    t = (await c[who].post(f"/api/w/{wid}/tasks", json={**STORY, "submit": True})).json()
    return t["id"]

async def test_approver_sees_queue_and_approves(ws_with_dev):
    wid, c = ws_with_dev; tid = await submitted(c, wid)
    assert (await c["appr"].get(f"/api/w/{wid}/approvals/count")).json() == {"count": 1}
    t = (await c["appr"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "approve"})).json()
    assert t["status"] == "approved" and t["decision"]["by"]["sub"] == "appr"
    assert (await c["appr"].get(f"/api/w/{wid}/approvals")).json() == []

async def test_member_cannot_decide(ws_with_dev): ...  # dev → 403

async def test_self_approval_always_blocked(ws_with_dev):
    wid, c = ws_with_dev; tid = await submitted(c, wid, who="appr")
    r = await c["appr"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "approve"})
    assert r.status_code == 403 and "your own task" in r.json()["detail"]
    assert (await c["adm"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "approve"})).status_code == 200

async def test_new_workspace_lets_developer_tasks_skip_the_queue(make_client):
    wid = await make_workspace(make_client)
    a = await make_client(); await login(a, "adm", ["g-admin"])
    await a.put(f"/api/w/{wid}/group-mappings", json=[{"group": "g-admin", "role": "admin"}, {"group": "g-dev", "role": "member"}])
    d = await make_client(); await login(d, "dev", ["g-dev"])
    t = (await d.post(f"/api/w/{wid}/tasks", json={**STORY, "submit": True})).json()
    assert t["status"] == "approved"
    assert t["decision"]["by"] == {"sub": "rule", "name": "Developer tasks skip the queue"}

async def test_reject_and_request_changes_need_reason(ws_with_dev): ...  # 422 without reason; with → rejected / changes_requested

async def test_second_decision_conflicts(ws_with_dev):                          # Review Focus 3
    wid, c = ws_with_dev; tid = await submitted(c, wid)
    r1, r2 = await asyncio.gather(
        c["appr"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "approve"}),
        c["adm"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "reject", "reason": "no"}))
    assert sorted([r1.status_code, r2.status_code]) == [200, 409]

async def test_duplicate_must_point_inside_workspace(ws_with_dev): ...  # bogus id → 422; real id → duplicate
async def test_snoozed_task_returns_to_queue_when_due(ws_with_dev, db): ...  # snooze until +1h → not in queue; set snoozed_until past in db → back in queue
async def test_bulk_approve_reports_failures(ws_with_dev): ...  # two tasks, one already rejected → approved=[a], failed=[{id: b, ...}]

async def test_auto_approve_rule_fires_on_submit(ws_with_dev):
    wid, c = ws_with_dev
    await c["adm"].post(f"/api/w/{wid}/rules", json={"name": "Dev tech debt", "enabled": True,
        "type_keys": ["tech_debt"], "author_roles": ["member"], "labels_any": []})
    t = (await c["dev"].post(f"/api/w/{wid}/tasks", json={"type_key": "tech_debt", "title": "Bump deps",
        "fields": {"context": "c", "scope": "s", "acceptance": "a"}, "submit": True})).json()
    assert t["status"] == "approved" and t["decision"]["by"] == {"sub": "rule", "name": "Dev tech debt"}
    assert (await c["adm"].get(f"/api/w/{wid}/audit")).json()[0]["action"] == "rule.fired"

async def test_rule_needs_a_condition(ws_with_dev): ...  # all lists empty → 422
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement** `approvals.py`; wire `find_matching_rule` into `submit_task`.
- [ ] **Step 4: Run to verify pass** → `uv run pytest -v` all PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(backend): approval queue, decisions, bulk approve, auto-approve rules"`

---

### Task 11: Notifications (in-app + email)

**Files:**
- Create: `backend/app/notifications.py`, `backend/tests/test_notifications.py`; Modify: `backend/app/approvals.py`, `backend/app/tasks.py`, `backend/app/main.py`

**Interfaces:**
- Consumes: `Ctx`, `Settings`, `resolve`
- Produces:
  - `async def notify(ctx: Ctx, user_subs: list[str], kind: str, task: dict, text: str, background: BackgroundTasks) -> None` — inserts one scoped notification per recipient **excluding `ctx.user.sub`**; if `settings.smtp_host` is set, schedules `send_email` for recipients with an email in `users`. Email body includes `f"{settings.public_url}/w/{workspace_id}/tasks/{task_id}"`.
  - `def send_email(settings: Settings, to: str, subject: str, body: str) -> None` — `smtplib.SMTP(host, port)`, `starttls()` when port 587, login when `smtp_user` set. Failures are logged, never raised.
  - `async def approver_subs(ctx: Ctx) -> list[str]` — subs of `users` whose groups resolve to `task.approve` in this workspace.
  - Hooks: `submit_task` (non-auto) → notify approvers kind `approval_needed` text `"#<n> <title> needs approval"`; `decide` → notify author kind `decision` text e.g. `"#12 was approved by Asha"` / `"rejected by Asha: <reason>"` / `"Asha asked for changes: <reason>"`; comment → notify author kind `comment`; auto-approve → notify author kind `decision` `"#12 was auto-approved (Dev tech debt)"`.
  - Routes: `GET /api/w/{wid}/notifications?unread=true&limit=50` (`task.view`) → caller's, newest first; `POST /api/w/{wid}/notifications/read {ids?: [str], all?: bool}` → 204.

- [ ] **Step 1: Write the failing tests**

```python
async def test_submit_notifies_approvers_not_author(ws_with_dev):
    wid, c = ws_with_dev; await submitted(c, wid)
    for who in ("appr", "adm"):
        n = (await c[who].get(f"/api/w/{wid}/notifications")).json()
        assert n[0]["kind"] == "approval_needed"
    assert (await c["dev"].get(f"/api/w/{wid}/notifications")).json() == []

async def test_decision_notifies_author_and_mark_read(ws_with_dev):
    wid, c = ws_with_dev; tid = await submitted(c, wid)
    await c["appr"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "reject", "reason": "out of scope"})
    n = (await c["dev"].get(f"/api/w/{wid}/notifications")).json()
    assert "out of scope" in n[0]["text"]
    await c["dev"].post(f"/api/w/{wid}/notifications/read", json={"all": True})
    assert (await c["dev"].get(f"/api/w/{wid}/notifications", params={"unread": "true"})).json() == []

async def test_email_sent_when_smtp_configured(ws_with_dev, app, monkeypatch):
    sent = []
    monkeypatch.setattr("app.notifications.send_email", lambda s, to, subj, body: sent.append(to))
    app.state.settings.smtp_host = "smtp.local"
    wid, c = ws_with_dev; await submitted(c, wid)
    assert sorted(sent) == ["adm@example.com", "appr@example.com"]
```

- [ ] **Step 2: Run to verify failure** → FAIL.
- [ ] **Step 3: Implement** `notifications.py` and the hooks.
- [ ] **Step 4: Run to verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(backend): in-app and email notifications"`

---

### Task 12: Frontend scaffold, design system and clickable mockups — STOP for owner approval

**Files:**
- Create: `frontend/` (Vite React TS), `frontend/src/styles/tokens.css`, `frontend/src/lib/brand.ts`, `frontend/src/components/{AppShell,Sidebar,StatusBadge,EmptyState}.tsx`, `frontend/src/pages/mockup/{MockTasks,MockApprovals,MockDocs}.tsx`, `frontend/src/App.tsx`

**Interfaces:**
- Produces:
  - `tokens.css`: CSS custom properties on `:root` and `[data-theme="dark"]` (plus `prefers-color-scheme` default): `--bg`, `--bg-subtle`, `--surface`, `--border`, `--text`, `--text-muted`, `--accent`, `--accent-fg`, `--focus`, status colours `--st-draft`, `--st-pending`, `--st-changes`, `--st-approved`, `--st-rejected`, `--st-duplicate`, `--st-snoozed`, `--st-jira`, `--st-progress`, `--st-done`; type scale with `--text-base: 15px`; spacing 4px grid; radius; shadow; `--motion: 160ms`. Tailwind theme maps to these tokens; shadcn/ui configured to use them.
  - `StatusBadge({status})` — label + colour for every status in Global Constraints (`pending_approval` → "Pending approval", etc.).
  - `EmptyState({title, body, action})`.
  - `AppShell({sidebar, children, pane?})` — sidebar, main, optional right detail pane (slides in, ≤200 ms, no motion under reduced-motion).
  - `Sidebar` items: workspace switcher slot, Inbox, Tasks, Approvals (count badge), Docs, Dashboard, Settings; collapses to icons below 1024px, to a drawer below 768px.
  - Mock routes `/mockup/tasks`, `/mockup/approvals`, `/mockup/docs` with realistic fake data (12+ tasks across statuses, a docs folder tree with a rendered setup doc and the ask box) and a theme toggle.

- [ ] **Step 1: Load the `frontend-design` skill** and choose the visual direction within spec §10 (Linear-like calm, one accent, 15px base, light + dark). Record the choice in a short comment at the top of `tokens.css`.
- [ ] **Step 2: Scaffold** — `npm create vite@latest frontend -- --template react-ts`; add Tailwind, shadcn/ui (`npx shadcn@latest init`), `@tanstack/react-query`, `react-router-dom`, `cmdk`, `sonner`, `lucide-react`; dev deps `vitest @testing-library/react @testing-library/user-event jsdom`. Vite dev server proxies `/api` → `http://localhost:8000`.
- [ ] **Step 3: Write the failing test** — `src/components/StatusBadge.test.tsx`

```tsx
it.each([["pending_approval", "Pending approval"], ["changes_requested", "Changes requested"],
         ["in_jira", "In Jira"], ["jira_failed", "Jira failed"]])("labels %s", (s, label) => {
  render(<StatusBadge status={s} />);
  expect(screen.getByText(label)).toBeInTheDocument();
});
```

- [ ] **Step 4: Run** `npx vitest run` → FAIL; implement tokens, `StatusBadge`, `EmptyState`, `AppShell`, `Sidebar`; run → PASS.
- [ ] **Step 5: Build the three mock screens.** Verify in a browser at 1440px, 1024px and 768px, in both themes: no horizontal scroll, focus ring visible on every interactive element when tabbing, text contrast AA (check muted text and status badges with a contrast checker).
- [ ] **Step 6: Commit** — `git commit -m "feat(frontend): design system, app shell and clickable mockups"`
- [ ] **Step 7: STOP.** Show the owner the three mock screens (screenshots in both themes plus how to run `npm run dev`). Apply their feedback to tokens/components. Do not start Task 13 until the owner approves the look.

---

### Task 13: Real app shell — sign-in, workspace switcher, API client

**Files:**
- Create: `frontend/src/lib/{api,queries,types,useShortcut}.ts`, `frontend/src/components/{WorkspaceSwitcher,ShortcutSheet}.tsx`, `frontend/src/pages/{Login,NoWorkspace}.tsx`; Modify: `App.tsx`, `Sidebar.tsx`

**Interfaces:**
- Consumes: backend `/api/auth/*`, `/api/w/{wid}/approvals/count`
- Produces:
  - `class ApiError extends Error { status: number; detail: unknown; fields?: Record<string,string> }`; `async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T>` — `credentials: "include"`, JSON in/out, 204 → `undefined`, non-2xx → `ApiError` with `message` = string `detail` or `detail.message`, and `fields` from `detail.fields`.
  - `types.ts`: `Me`, `WorkspaceSummary`, `Task`, `TaskStatus`, `Template`, `Idea`, `Activity`, `Rule`, `Notification`, `Member`, `AuditEntry` mirroring backend JSON.
  - `queries.ts`: `useMe()`, `useApprovalCount(wid)` (refetch every 30 s), plus a `qk` key factory (`qk.tasks(wid, filters)`, `qk.task(wid, id)` …) used by later tasks.
  - `useShortcut(key: string, handler: () => void, opts?: { enabled?: boolean })` — ignores events from `input`, `textarea`, `select`, `[contenteditable]`, and when modifier keys are held (except for `mod+k`).
  - Routes: `/login` (interim sign-in form: name, email, groups as comma-separated text; a banner says "Temporary sign-in — company login coming soon"), `/` → redirect to last-used workspace (`localStorage` key `teamdesk.lastWorkspace`, wrapped in try/catch) or first workspace, or `NoWorkspace`; `/w/:wid/*` workspace area; `401` from any query → redirect to `/login`.
  - `WorkspaceSwitcher` lists `me.workspaces`; Sidebar shows/hides items by permission (Approvals only with `task.approve`, Settings only with `settings.manage`); `?` opens `ShortcutSheet` listing every shortcut in Global Constraints.

- [ ] **Step 1: Write the failing tests** — `src/lib/api.test.ts`, `src/lib/useShortcut.test.tsx`

```ts
it("turns 422 field errors into ApiError.fields", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(
    { detail: { message: "Some required fields are empty.", fields: { scope: "Scope is required." } } }), { status: 422 })));
  await expect(api("/x")).rejects.toMatchObject({ status: 422, message: "Some required fields are empty.",
    fields: { scope: "Scope is required." } });
});

it("ignores shortcuts while typing", async () => {
  const fn = vi.fn();
  render(<Harness onA={fn} />);            // Harness: useShortcut("a", onA) + <input />
  await userEvent.type(screen.getByRole("textbox"), "a");
  expect(fn).not.toHaveBeenCalled();
  await userEvent.keyboard("{Escape}"); (document.activeElement as HTMLElement).blur();
  await userEvent.keyboard("a");
  expect(fn).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run** `npx vitest run` → FAIL; implement; run → PASS.
- [ ] **Step 3: Manual check** — run backend (`uv run uvicorn app.main:create_app --factory --reload` with `DEV_LOGIN_ENABLED=true`, `HTTPS_ONLY_COOKIES=false`) and `npm run dev`; sign in as a platform owner, create a workspace via `curl` or the API docs, sign in as its admin group, switch workspaces, see Settings hidden for a member.
- [ ] **Step 4: Commit** — `git commit -m "feat(frontend): sign-in, workspace switcher, API client, shortcuts"`

---

### Task 14: Tasks screens — list, detail pane, template form

**Files:**
- Create: `frontend/src/pages/{Tasks,TaskDetailPane,TaskForm}.tsx`, `frontend/src/components/Markdownish.tsx`; Modify: `queries.ts`

**Interfaces:**
- Consumes: tasks, templates, members, activity, comments endpoints; `StatusBadge`, `EmptyState`, `AppShell` pane.
- Produces:
  - `/w/:wid/tasks` — list with filters (status multi-select, type, "Mine"), search box (debounced 250 ms → `q`), grouping toggle (by status / none), skeleton rows while loading, empty state "No tasks yet" → "New task" action. Row: `#number`, title, type, `StatusBadge`, author, updated time.
  - `/w/:wid/tasks/:id` opens `TaskDetailPane` on the right of the list: fields rendered by template section label, activity timeline with comments, comment box (`Ctrl/⌘+Enter` sends), Edit / Submit buttons when allowed.
  - `TaskForm` (dialog; `N` opens it): type picker → sections from the template with hints; required markers; field errors from `ApiError.fields` shown under each field; "Save draft" and "Submit for approval"; "Possibly similar" panel calling `/tasks/similar` (debounced 400 ms on title) with links; prefill from an idea (`?fromIdea=<id>`).
  - `Markdownish({text})` — renders text with line breaks, `**bold**`, `` `code` ``, bullet lines and links as React elements. **Never uses `dangerouslySetInnerHTML`.**
  - Optimistic update on edit (TanStack `onMutate` + rollback on error with a toast showing the error message).

- [ ] **Step 1: Write the failing tests**

```tsx
it("renders hostile text as text", () => {                               // Review Focus 5
  const { container } = render(<Markdownish text={'<script>alert(1)</script> **hi**'} />);
  expect(container.querySelector("script")).toBeNull();
  expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
  expect(screen.getByText("hi").tagName).toBe("STRONG");
});

it("shows server field errors under the matching field", async () => {
  mockApi({ "POST /api/w/w1/tasks": new ApiError(422, "Some required fields are empty.", { scope: "Scope is required." }) });
  renderWithProviders(<TaskForm wid="w1" templates={[STORY_TEMPLATE]} open />);
  await userEvent.click(screen.getByRole("button", { name: "Submit for approval" }));
  expect(await screen.findByText("Scope is required.")).toBeInTheDocument();
});
```

(`mockApi` and `renderWithProviders` go in `src/test/utils.tsx`: a `vi.mock` of `lib/api` keyed by `"METHOD path"`, and a QueryClient + MemoryRouter wrapper.)

- [ ] **Step 2: Run** → FAIL; implement; run → PASS.
- [ ] **Step 3: Manual check** in the browser: create draft, submit with a missing field (error appears under it), submit valid, open detail, comment, try `N` shortcut, check 768px layout (pane becomes full-width overlay).
- [ ] **Step 4: Commit** — `git commit -m "feat(frontend): task list, detail pane and template-driven form"`

---

### Task 15: Inbox and quick capture

**Files:**
- Create: `frontend/src/pages/Inbox.tsx`, `frontend/src/components/QuickCapture.tsx`; Modify: `AppShell.tsx`, `queries.ts`

**Interfaces:**
- Consumes: `/ideas` endpoints; `TaskForm` prefill via `?fromIdea=`.
- Produces:
  - `QuickCapture` — `I` from anywhere opens a single-line input (centered, small); Enter saves (optimistic, toast "Saved to Inbox"), Esc closes. Mounted once in `AppShell`.
  - `/w/:wid/inbox` — caller's ideas, newest first; each row: text, age, "Make task" (opens `TaskForm` prefilled: title = idea text) and delete (toast with **Undo** — delete request sent after the 5 s toast expires unless undone). Empty state: "Ideas you capture with **I** land here."

- [ ] **Step 1: Write the failing test**

```tsx
it("captures an idea with I and Enter", async () => {
  const post = mockApi({ "POST /api/w/w1/ideas": { id: "i1", text: "cache lookups" } });
  renderWithProviders(<AppShellHarness wid="w1" />);
  await userEvent.keyboard("i");
  await userEvent.type(screen.getByRole("textbox", { name: "Capture an idea" }), "cache lookups{Enter}");
  expect(post).toHaveBeenCalledWith("/api/w/w1/ideas", expect.objectContaining({ json: { text: "cache lookups" } }));
});
```

- [ ] **Step 2: Run** → FAIL; implement; run → PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(frontend): idea inbox and quick capture"`

---

### Task 16: Approval queue screen

**Files:**
- Create: `frontend/src/pages/Approvals.tsx`; Modify: `queries.ts`

**Interfaces:**
- Consumes: `/approvals`, `/tasks/{id}/decision`, `/approvals/bulk-approve`, `/tasks/{id}/activity`; `TaskDetailPane` (read-only mode).
- Produces:
  - `/w/:wid/approvals` — two-column: queue list (oldest first, age shown, selected row highlighted) + detail of the selected task.
  - Keys: `J`/`K` move selection; `A` approve (optimistic: row leaves the list immediately; on 403/409 it returns and a toast shows the server message); `R` opens reject dialog (reason required, focus in textarea, `Ctrl/⌘+Enter` confirms); `C` opens request-changes dialog (same); `D` opens duplicate picker (search tasks via `q`); `S` snooze menu (tomorrow / next week / pick date).
  - Reject, request-changes and duplicate are sent **after** a 5 s toast with **Undo**; Undo restores the row and sends nothing. Approve is sent immediately (later phases create the Jira ticket on approve).
  - Checkbox multi-select + "Approve selected" → bulk endpoint; result toast "Approved 4, 1 failed" with failure reasons.
  - Empty state: "Nothing waiting for approval" with a link to Tasks.
  - Sidebar count badge updates (invalidate `useApprovalCount`).

- [ ] **Step 1: Write the failing tests**

```tsx
it("approves the selected task with A and moves to the next", async () => {
  const decide = mockApi({ "GET /api/w/w1/approvals": [T1, T2], "POST /api/w/w1/tasks/t1/decision": { ...T1, status: "approved" } });
  renderWithProviders(<Approvals wid="w1" />);
  await screen.findByText(T1.title);
  await userEvent.keyboard("a");
  expect(decide).toHaveBeenCalledWith("/api/w/w1/tasks/t1/decision", expect.objectContaining({ json: { action: "approve" } }));
  expect(screen.queryByText(T1.title)).toBeNull();
  expect(screen.getByRole("option", { selected: true })).toHaveTextContent(T2.title);
});

it("reject waits for the undo window and undo sends nothing", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const decide = mockApi({ "GET /api/w/w1/approvals": [T1], "POST /api/w/w1/tasks/t1/decision": {} });
  renderWithProviders(<Approvals wid="w1" />);
  await screen.findByText(T1.title);
  await userEvent.keyboard("r");
  await userEvent.type(screen.getByRole("textbox", { name: "Reason" }), "out of scope{Control>}{Enter}{/Control}");
  await userEvent.click(screen.getByRole("button", { name: "Undo" }));
  vi.advanceTimersByTime(6000);
  expect(decide).not.toHaveBeenCalledWith("/api/w/w1/tasks/t1/decision", expect.anything());
  expect(screen.getByText(T1.title)).toBeInTheDocument();
});

it("puts the task back and shows the message on 409", async () => { ... });
```

- [ ] **Step 2: Run** → FAIL; implement; run → PASS.
- [ ] **Step 3: Manual check** — two browsers as two approvers on the same task: second approve shows the "already decided" toast and the row returns then disappears on refresh.
- [ ] **Step 4: Commit** — `git commit -m "feat(frontend): keyboard-driven approval queue"`

---

### Task 17: Settings screens and platform workspaces

**Files:**
- Create: `frontend/src/pages/settings/{SettingsLayout,General,Members,Templates,Rules,Audit}.tsx`, `frontend/src/pages/platform/Workspaces.tsx`; Modify: `App.tsx`, `queries.ts`

**Interfaces:**
- Consumes: settings, group-mappings, roles, members, templates, rules, audit, platform endpoints.
- Produces:
  - `/w/:wid/settings/general` — workspace name; read-only note "Approvers can't approve their own tasks (compliance)".
  - `/w/:wid/settings/members` — group→role mapping table (add/remove rows, role select), "People seen" list from `/members`, roles × permissions matrix (checkbox grid, add/rename/delete role). Lockout 422 message shown inline above the Save button. Unsaved-changes guard on navigation.
  - `/w/:wid/settings/templates` — list; editor with name, Jira issue type, ordered sections (add, remove, reorder with up/down buttons, required toggle, hint), default labels.
  - `/w/:wid/settings/rules` — list with enable switch; editor with the three condition multi-selects (task types, roles, labels) and a plain-English preview ("Tech debt tasks by Members are approved automatically").
  - `/w/:wid/settings/audit` — table: when, who, action, target; newest first.
  - `/platform/workspaces` (only when `me.user.is_platform_owner`) — list, create dialog (name, short name with live slug validation, first admin group), archive with confirm dialog.
  - Settings nav is shown only with `settings.manage`; Members & roles write controls only with `roles.manage`.

- [ ] **Step 1: Write the failing tests**

```tsx
it("shows the lockout message from the server", async () => {
  mockApi({ "GET /api/w/w1/settings": SETTINGS, "GET /api/w/w1/members": [],
            "PUT /api/w/w1/group-mappings": new ApiError(422, "At least one group must map to a role that can manage roles, or nobody could fix access.") });
  renderWithProviders(<Members wid="w1" />);
  await userEvent.selectOptions(await screen.findByLabelText("Role for g-admin"), "member");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText(/nobody could fix access/)).toBeInTheDocument();
});

it("previews a rule in plain English", async () => { ... });  // type tech_debt + role member → "Tech debt tasks by Members are approved automatically"
```

- [ ] **Step 2: Run** → FAIL; implement; run → PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(frontend): workspace settings and platform workspaces"`

---

### Task 18: Notifications bell and command palette

**Files:**
- Create: `frontend/src/components/{NotificationBell,CommandPalette}.tsx`; Modify: `AppShell.tsx`, `queries.ts`

**Interfaces:**
- Consumes: `/notifications`, `/notifications/read`, `/tasks?q=`
- Produces:
  - `NotificationBell` in the sidebar header: unread count (polls every 30 s), popover list (newest first; click → task, marks read), "Mark all read".
  - `CommandPalette` (`Ctrl/⌘+K`, built on `cmdk`): sections "Tasks" (live `q` search, 250 ms debounce, shows `#n`, title, status), "Go to" (Inbox, Tasks, Approvals, Settings — filtered by permission), "Actions" (New task, Capture idea, Switch workspace → lists workspaces, Toggle theme). Typing `#12` jumps to task 12.

- [ ] **Step 1: Write the failing tests**

```tsx
it("jumps to a task by #number", async () => {
  mockApi({ "GET /api/w/w1/tasks?q=12": [], "GET /api/w/w1/tasks?number=12": [T12] });
  ...  // open with Control+K, type "#12", Enter → navigate to /w/w1/tasks/t12
});
it("hides Approvals for users without task.approve", async () => { ... });
```

Backend support for `#n`: add query param `number` to `GET /tasks` in `backend/app/tasks.py` with test `test_filter_by_number` in `tests/test_tasks.py` (returns the one task with that number, or `[]`).

- [ ] **Step 2: Run** backend and frontend tests → FAIL; implement; run → PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat: notifications bell and command palette"`

---

### Task 19: Containers, OpenShift manifests, README

**Files:**
- Create: `deploy/backend.Dockerfile`, `deploy/frontend.Dockerfile`, `deploy/nginx.conf`, `deploy/openshift/{configmap,secret.example,backend,frontend,route}.yaml`, `README.md`; Modify: `backend/app/main.py` (serve nothing static — nginx serves the SPA)

**Interfaces:**
- Produces:
  - Backend image: Python 3.12 slim (or Red Hat UBI 9 Python 3.12), runs as non-root arbitrary UID (OpenShift), `uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8080 --proxy-headers --forwarded-allow-ips="*"`. Readiness/liveness on `/api/health`.
  - Frontend image: multi-stage `npm ci && npm run build` → nginx unprivileged image on port 8080, SPA fallback to `index.html`, `/api` proxied to the backend Service.
  - Manifests: Deployment + Service for each, one Route (TLS edge) to the frontend, ConfigMap for non-secret env, `secret.example.yaml` listing `SESSION_SECRET`, `MONGO_URI`, `SMTP_PASSWORD` with placeholder values.
  - README: what TeamDesk is (3 lines), local dev (docker mongo, backend, frontend, dev login), env var table (every `Settings` field with default and meaning), first-time setup (platform owner group → create workspace → map groups), deploy to OpenShift (`oc apply -f deploy/openshift/`), test commands.

- [ ] **Step 1: Build both images locally** — `docker build -f deploy/backend.Dockerfile -t teamdesk-api backend` and `docker build -f deploy/frontend.Dockerfile -t teamdesk-web frontend` → both succeed.
- [ ] **Step 2: Smoke test** — run both images plus `mongo:4.4` on one Docker network with `DEV_LOGIN_ENABLED=true`; `curl http://localhost:8080/api/health` through the frontend container returns `{"ok": true, ...}`; the SPA loads and dev login works.
- [ ] **Step 3: Validate manifests** — `oc apply --dry-run=client -f deploy/openshift/` (or `kubectl apply --dry-run=client`) → no errors.
- [ ] **Step 4: Full test run** — `cd backend && uv run pytest -q` and `cd frontend && npx vitest run` → all pass.
- [ ] **Step 5: Commit** — `git commit -m "chore: containers, OpenShift manifests and README"`
