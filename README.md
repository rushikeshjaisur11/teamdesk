# TeamDesk

One shared place for a team's work. Anyone on the team captures ideas and adds tasks in the team's standard ticket format. Approvers approve or reject them in a fast, keyboard-driven queue, and developer tasks skip the queue. Each team gets its own workspace, and teams never see each other's data.

This release covers phases 1 and 2: workspaces, roles, tasks, the idea inbox, approvals, notifications and settings. Jira, GitHub, docs and AI come next. See `docs/superpowers/specs/2026-10-31-teamdesk-design.md`.

## Run it locally

You need Docker, [uv](https://docs.astral.sh/uv/) and Node 22 or newer.

```bash
# 1. Database (MongoDB 8.0, same major version as production)
docker run -d --name teamdesk-mongo -p 27017:27017 mongo:8.0

# 2. API on http://localhost:8000
cd backend
uv sync
DEV_USER_SUB=you@corp.test DEV_USER_NAME="Your Name" DEV_USER_GROUPS=teamdesk-platform-owners \
SESSION_SECRET=dev HTTPS_ONLY_COOKIES=false \
uv run uvicorn app.main:create_app --factory --reload --port 8000

# 3. Web app on http://localhost:5173 (proxies /api to the API)
cd frontend
npm install
npm run dev
```

There is no sign-in screen yet. Until company login is connected, every request without a session acts as the `DEV_USER_*` user. To try another person's view, restart the API with different `DEV_USER_*` values.

## First-time setup

1. Start the API with a `DEV_USER_GROUPS` value that includes the platform owner group (`teamdesk-platform-owners` by default).
2. Open the app, choose **Create a workspace**, and give it a name and an admin group, for example `grp-data-admins`.
3. Restart as someone in that admin group. Go to **Settings → Members and roles** and map your other groups to roles, for example `grp-data-eng → Member` and `grp-data-approvers → Approver`.
4. Every new workspace starts with four task types (Story, Bug, Spike, Tech debt) and the rule **Developer tasks skip the queue**. Adjust both under Settings.

## Keyboard

| Keys | Does |
|---|---|
| Ctrl K | Search tasks (words or `#12`) and run commands |
| N | New task |
| I | Capture an idea |
| ? | Show all shortcuts |
| J / K | Next / previous task in Approvals |
| A, R, C, D | Approve, reject, ask for changes, mark duplicate |

## Configuration

All settings are environment variables (upper-case names). Per-team settings live in the database and are edited in the app.

| Variable | Default | Meaning |
|---|---|---|
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string (a replica set in production) |
| `MONGO_DB` | `teamdesk` | Database name |
| `SESSION_SECRET` | required | Signs session cookies. Use 64 random characters |
| `SESSION_MAX_AGE` | `28800` | Session lifetime in seconds |
| `HTTPS_ONLY_COOKIES` | `true` | Set `false` only for local HTTP |
| `PLATFORM_OWNER_GROUP` | `teamdesk-platform-owners` | Group allowed to create and archive workspaces |
| `DEV_USER_SUB`, `DEV_USER_NAME`, `DEV_USER_EMAIL`, `DEV_USER_GROUPS` | empty | Interim identity for requests without a session. Groups are comma-separated. **Leave empty in any shared environment** |
| `DEV_LOGIN_ENABLED` | `false` | Enables `POST /api/auth/dev-login`, used by automated tests and scripts only |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | empty, `587` | Email notifications. Email is off when `SMTP_HOST` is empty |
| `PUBLIC_URL` | `http://localhost:5173` | Base URL used in email links |

## Tests

```bash
docker run -d --name teamdesk-mongo-test -p 27018:27017 mongo:8.0
cd backend && uv run pytest        # API, against the test database on port 27018
cd frontend && npx vitest run      # UI
```

The backend suite includes isolation tests that prove one workspace can't read or change another's data.

## Deploy to OpenShift

```bash
docker build -f deploy/backend.Dockerfile -t teamdesk-api backend
docker build -f deploy/frontend.Dockerfile -t teamdesk-web frontend
# push both images to your registry and update the image fields in deploy/openshift/*.yaml

cp deploy/openshift/secret.example.yaml deploy/openshift/secret.yaml   # fill in, never commit
oc apply -f deploy/openshift/configmap.yaml -f deploy/openshift/secret.yaml \
         -f deploy/openshift/backend.yaml -f deploy/openshift/frontend.yaml -f deploy/openshift/route.yaml
```

Both images run as a non-root user and work with OpenShift's arbitrary UIDs. The web image serves the app on port 8080 and proxies `/api` to the `teamdesk-api` service. Don't expose TeamDesk to a shared audience until company login is connected.
