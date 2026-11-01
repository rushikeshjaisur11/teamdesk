# TeamDesk

One shared place for a team's work, plus a private space for each person.

- **Team workspaces:** tasks in the team's standard ticket format, a fast approval queue, Docs, Meeting notes, and Excel import and export. Each team has its own isolated workspace.
- **Jira and Teams:**
  - Jira issues come from approved tasks (Cloud or Data Center), with each team's own template and workflow.
  - Comments are copied to Jira.
  - Updates are posted to a Teams channel.
- **My space:** Today, Inbox, My tasks and Waiting on, private to each person. Reminders arrive in your own Teams chat, and Out of office routes your approvals to a backup.
- **AI (optional, env-only):** meeting summaries with proposed tasks, and tidied Jira comments.

**Setting it up, every setting and every connector field: [docs/SETUP.md](docs/SETUP.md).**

## Quick start

You need Docker, [uv](https://docs.astral.sh/uv/) and Node 22 or newer.

```bash
docker run -d --name teamdesk-mongo -p 27017:27017 mongo:8.0

cd backend && uv sync
DEV_USER_SUB=you@corp.test DEV_USER_NAME="Your Name" DEV_USER_GROUPS=teamdesk-platform-owners \
SESSION_SECRET=local-dev-secret-local-dev-secret-0 HTTPS_ONLY_COOKIES=false \
uv run uvicorn app.main:create_app --factory --reload --port 8000
# second terminal, same variables: the worker (reminders, Teams summary, Jira status sync)
uv run python -m app.worker

cd frontend && npm install && npm run dev   # http://localhost:5173
```

There is no sign-in screen yet: every request acts as the `DEV_USER_*` person. Then open **Admin → Workspaces → Create workspace** (SETUP.md §5).

## Tests

```bash
docker run -d --name teamdesk-mongo-test -p 27018:27017 mongo:8.0
cd backend && uv run pytest -q
cd frontend && npx vitest run && npx tsc -b
```

Tests never call real Jira, Teams or AI. The backend suite includes tests proving that one workspace can't reach another's data and that nobody can read another person's private space.

## Keyboard

| Keys | Does |
|---|---|
| Ctrl K | Search tasks, docs and your items; run commands |
| N | New task |
| I | Capture an idea |
| G then T / M / I / W | Today, My tasks, Inbox, Waiting on |
| J / K, then A, R, C, D | In Approvals: move, then approve, reject, ask for changes, mark duplicate |
| ? | All shortcuts |

Every shortcut also has a button.

## Layout

| Path | What |
|---|---|
| `backend/app/` | FastAPI app. `scoped.py` enforces workspace and personal isolation. Connectors are in `jira.py` and `teams.py`. Every AI call is in `ai.py`. |
| `backend/app/worker.py` | Background worker, the same image run with `python -m app.worker` |
| `backend/scripts/seed_demo.py` | Sample data for a local workspace (needs `DEV_LOGIN_ENABLED=true`) |
| `frontend/src/` | React app. `pages/` holds the screens; design tokens are in `styles/tokens.css` |
| `deploy/` | Dockerfiles and OpenShift manifests |
| `docs/SETUP.md` | Setup and admin guide |
| `docs/superpowers/` | Product specs and `NEXT.md` (status and roadmap) |
