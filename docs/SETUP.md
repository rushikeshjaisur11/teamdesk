# TeamDesk setup guide

This guide covers everything needed to run TeamDesk and connect it to Jira and Microsoft Teams:

1. [What you need](#1-what-you-need)
2. [Run it on your machine](#2-run-it-on-your-machine)
3. [Deploy to OpenShift](#3-deploy-to-openshift)
4. [Environment settings](#4-environment-settings)
5. [First-time setup in the app](#5-first-time-setup-in-the-app)
6. [Workspace settings](#6-workspace-settings)
7. [Connector: Jira](#7-connector-jira)
8. [Connector: Microsoft Teams channel](#8-connector-microsoft-teams-channel)
9. [Personal Teams reminders](#9-personal-teams-reminders)
10. [AI](#10-ai)
11. [Troubleshooting](#11-troubleshooting)

Who does what:

| Who | Sets up |
|---|---|
| Platform team (runs TeamDesk) | Sections 2–4 and 10. Creates workspaces (section 5). |
| Workspace admin (one per team) | Sections 6–8 for their own team. |
| Everyone | Section 9, if they want reminders in Teams. |

---

## 1. What you need

- **MongoDB 8.0.** Production uses a replica set; one server is fine locally.
- **Python 3.12** and [uv](https://docs.astral.sh/uv/) for the API and the worker.
- **Node 22 or newer** for the web app.
- **Docker**, to run MongoDB locally and to build images.
- **OpenShift**, for the shared deployment.
- **Optional:** a Jira Cloud or Jira Data Center account for TeamDesk, Microsoft Teams with Workflows, and a Vertex AI API key.

## 2. Run it on your machine

```bash
# 1. Database
docker run -d --name teamdesk-mongo -p 27017:27017 mongo:8.0

# 2. API on http://localhost:8000
cd backend
uv sync
DEV_USER_SUB=you@corp.test DEV_USER_NAME="Your Name" DEV_USER_GROUPS=teamdesk-platform-owners \
SESSION_SECRET=local-dev-secret-local-dev-secret-0 HTTPS_ONLY_COOKIES=false \
uv run uvicorn app.main:create_app --factory --reload --port 8000

# 3. Background worker (reminders, Teams digest, Jira status sync), in a second terminal, same variables
uv run python -m app.worker

# 4. Web app on http://localhost:5173 (it forwards /api to the API)
cd frontend
npm install
npm run dev
```

**There is no sign-in screen yet.** Every request acts as the `DEV_USER_*` person. Putting yourself in `teamdesk-platform-owners` lets you create workspaces. To see the app as someone else, restart the API with different `DEV_USER_*` values.

**Tests:**

```bash
docker run -d --name teamdesk-mongo-test -p 27018:27017 mongo:8.0
cd backend && uv run pytest -q
cd frontend && npx vitest run && npx tsc -b
```

The tests never call real Jira, Teams or AI; those calls are faked.

## 3. Deploy to OpenShift

```bash
docker build -f deploy/backend.Dockerfile -t teamdesk-api backend
docker build -f deploy/frontend.Dockerfile -t teamdesk-web frontend
# push both to your registry, then update the image fields in deploy/openshift/*.yaml

cp deploy/openshift/secret.example.yaml deploy/openshift/secret.yaml   # fill it in, never commit it
oc apply -f deploy/openshift/configmap.yaml -f deploy/openshift/secret.yaml \
         -f deploy/openshift/backend.yaml -f deploy/openshift/worker.yaml \
         -f deploy/openshift/frontend.yaml -f deploy/openshift/route.yaml
```

- **API** (`backend.yaml`): serves `/api`.
- **Worker** (`worker.yaml`): the same image running `python -m app.worker`. It sends reminders and the Teams digest, and syncs Jira statuses. Without it, none of those happen. You can run several copies safely.
- **Web** (`frontend.yaml`): serves the app on port 8080 and forwards `/api` to the API.
- **Network:** pods need outbound HTTPS to:
  - your Jira address;
  - `*.logic.azure.com` or `*.api.powerplatform.com` for Teams;
  - `aiplatform.googleapis.com` (or your AI proxy) for AI.

## 4. Environment settings

Put ordinary values in the ConfigMap and secrets in the Secret. Names are upper-case.

| Variable | Default | What to put there |
|---|---|---|
| `MONGO_URI` | `mongodb://localhost:27017` | Connection string. In production, the replica set URI, for example `mongodb://db1,db2,db3/?replicaSet=rs0`. **Secret.** |
| `MONGO_DB` | `teamdesk` | Database name. |
| `SESSION_SECRET` | required | At least 32 random characters (`openssl rand -hex 32`). It also encrypts saved Jira tokens and Teams links, so if you change it, every team must re-enter them. **Secret.** |
| `SESSION_MAX_AGE` | `28800` | Session length in seconds (8 hours). |
| `HTTPS_ONLY_COOKIES` | `true` | Set to `false` only for local HTTP. |
| `PLATFORM_OWNER_GROUP` | `teamdesk-platform-owners` | Entitlement group allowed to create and archive workspaces. Its members are also admins in every workspace, but never in anyone's private space. |
| `DEV_USER_SUB`, `DEV_USER_NAME`, `DEV_USER_EMAIL`, `DEV_USER_GROUPS` | empty | Stand-in identity until company login is connected. Groups are comma-separated. **Leave empty in any shared environment.** |
| `DEV_LOGIN_ENABLED` | `false` | Test-only login endpoint. Keep `false`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | empty, `587` | Email notifications. Email is off when `SMTP_HOST` is empty. The password is a **Secret.** |
| `PUBLIC_URL` | `http://localhost:5173` | The address people open TeamDesk at, for example `https://teamdesk.apps.example.com`. Used in links in emails and Teams cards. |
| `AI_ENABLED` | `false` | `true` turns AI features on (section 10). |
| `VERTEX_API_KEY` | empty | Vertex AI API key. **Secret.** |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Model name. Use one your project can call. |
| `AI_BASE_URL` | `https://aiplatform.googleapis.com/v1` | Change it to go through a proxy. |
| `JIRA_SYNC_MINUTES` | `10` | How often the worker reads Jira statuses back, per workspace. |

## 5. First-time setup in the app

1. Sign in as a platform owner (locally: `DEV_USER_GROUPS=teamdesk-platform-owners`).
2. Open **Admin → Workspaces** and click **Create workspace**:
   - **Name:** the team's name, shown everywhere, for example `Data Platform`.
   - **Short name:** lowercase letters, numbers and dashes. It's used in links and can't be changed, for example `data-platform`.
   - **Admin group:** the entitlement group whose members manage this workspace, for example `grp-data-admins`.
3. You land in the new workspace. Go to **Settings → Members and roles** and map the team's other groups to roles. For example, `grp-data-eng → Member` and `grp-data-leads → Approver`.
4. Connect Jira (section 7) and Teams (section 8) if the team uses them. Both are optional.

## 6. Workspace settings

All are under **Settings** inside a workspace. Each page appears only to people whose role allows it.

| Page | Who sees it | What it controls |
|---|---|---|
| **General** | `settings.manage` | The workspace name. |
| **Members and roles** | `roles.manage` | Which entitlement group gets which role, and what each role may do. At least one group must keep "manage roles", so nobody gets locked out. |
| **Task types** | `settings.manage` | The team's ticket templates (see below). |
| **Auto-approve rules** | `settings.manage` | Which tasks skip the approval queue. The defaults are "Developer tasks skip the queue" and "Tech tasks skip the queue". Self-approval is always blocked. |
| **Connections** | `connections.manage` | Jira and the Teams channel. |
| **Audit log** | `settings.manage` | Every settings change, decision and automatic approval. |

### Task types (the team's Jira template)

Each team has its own task types, and each type decides what its Jira issue looks like. The workspace starts with Story, Bug, Spike and Tech debt; edit them to match your team.

| Field | Meaning | Example |
|---|---|---|
| **Name** | What people pick when they create a task. | `Story` |
| **Jira issue type** | The issue type it becomes in Jira. Must exist in the target project, spelled exactly as in Jira. | `Story`, `Bug`, `Task`, `Feature` |
| **Sections** | The parts the author fills in. Required sections must be filled in before the task can be submitted. | `Context`, `Acceptance criteria` |
| **Section → Jira field** | Leave empty to put the section into the issue's description, under a heading with the section name. Fill it in to send the section to its own Jira field instead. | `customfield_10020` for an "Acceptance criteria" custom field, or `environment` |
| **Default labels** | Labels added to every issue of this type. Spaces are not allowed. | `feature` |
| **Jira for this type → Project key** | Sends this type's issues to a different project than the connection's default. Empty uses the default. | `PLAT` |
| **Jira for this type → Extra Jira fields (JSON)** | Fixed values sent with every issue of this type, such as components, priority or required custom fields. Written as Jira REST API `fields` JSON. | see below |

Example of **Extra Jira fields**:

```json
{
  "components": [{ "name": "ETL" }],
  "priority": { "name": "Medium" },
  "customfield_10010": "Team Data",
  "customfield_10030": { "value": "Platform" }
}
```

To find a custom field's id:
- **Any Jira:** while signed in to Jira, open `https://<your-jira>/rest/api/2/field` and search the list for the field's name. Its `id` (for example `customfield_10020`) is what you need.
- **Jira Cloud:** you can also go to **Settings → Issues → Custom fields**, open the field, and read the number at the end of the page address.

The value's format depends on the field type:
- text: `"text"`;
- select list: `{ "value": "Option" }`;
- multi-select: `[{ "value": "A" }]`;
- user on Cloud: `{ "accountId": "..." }`;
- user on Data Center: `{ "name": "username" }`.

If Jira rejects an issue, TeamDesk shows Jira's own message on the task (for example `Jira said: components: Component name 'ETL' is not valid`), and you can fix the type and click **Retry Jira**.

## 7. Connector: Jira

**Where:** Settings → Connections → Jira. **Who:** workspace admins. Each team connects its own Jira and project, so teams never share settings.

### 7.1 Get a token for TeamDesk

Use a dedicated service account (for example `jira-bot@yourcompany.com`) rather than a person's account, so issues don't depend on one employee. That account needs these permissions in the target projects:
- **Browse projects**
- **Create issues**
- **Add comments**

**Jira Cloud (API token):**
1. Sign in to Atlassian as the service account and open <https://id.atlassian.com/manage-profile/security/api-tokens>.
2. Click **Create API token**. Name it `TeamDesk`, choose an expiry, and copy the token. Atlassian shows it only once.

**Jira Data Center (personal access token):**
1. Sign in to Jira as the service account and open **Profile → Personal Access Tokens**.
2. Click **Create token**. Name it `TeamDesk`, choose an expiry, and copy it.

Personal access tokens need Jira Data Center or Server 8.14 or later.

### 7.2 Fill in the connection

| Field | What to fill in | Example |
|---|---|---|
| **Jira type** | **Cloud** if the address ends in `atlassian.net`, otherwise **Data Center**. | Cloud |
| **Address** | The address you open Jira at, starting with `https://`. Don't add `/browse` or a path after it, unless Jira itself runs under a path (Data Center). | `https://acme.atlassian.net` or `https://jira.acme.com` |
| **Account email** (Cloud only) | The email of the account the API token belongs to. | `jira-bot@acme.com` |
| **API token / Personal access token** | The token from 7.1. Stored encrypted; after saving it's never shown again. Leave the field empty when editing other fields to keep the saved token. | |
| **Default project key** | The key of the project issues go to: the letters before the number in an issue key such as `DATA-123`. A task type can override it. | `DATA` |

Click **Connect Jira**, then **Test connection**:
- **"Connected as … to …"**: all good.
- **"Jira refused the credentials"**: the email or token is wrong or expired.
- **"Signed in, but project …"**: the key is wrong, or the account can't see that project.
- **"Couldn't reach Jira"**: the address is wrong, or OpenShift can't reach Jira over the network.

### 7.3 Jira comments

| Setting | Effect |
|---|---|
| **Copy comments to Jira** (on by default) | Every comment written on a task that has a Jira issue is added to that issue, ending with "*Name*, via TeamDesk". If Jira refuses, the task's activity shows why. |
| **Tidy comments with AI** (on by default) | Before posting, AI fixes grammar and wording, keeping every fact, number, link and code snippet. It works only when AI is turned on for TeamDesk (section 10). Otherwise, or if the AI call fails, the comment is posted exactly as written. The comment in TeamDesk always stays as the person wrote it. |

Comments written before the Jira issue existed are not copied.

### 7.4 Jira workflow (status mapping)

Every team's Jira workflow has different statuses, such as "In Review", "QA" or "Ready for Release". TeamDesk shows three Jira-side states: **In Jira (to do)**, **In progress** and **Done**.

1. Click **Load statuses from Jira** to list every status in your project.
2. For each one, leave **Automatic** or choose what it means for your team. Automatic follows Jira's own category for that status: To Do → In Jira, In Progress → In progress, Done → Done. Most teams only change a few. For example, set "Ready for Release" to Done if your team treats that as finished.
3. Click **Save mapping**.

The worker reads the status of each linked, unfinished task every `JIRA_SYNC_MINUTES` minutes (10 by default). The task then shows the TeamDesk status and the exact Jira status, for example `DATA-7 · In Review in Jira`.

### 7.5 Using it

- **Create the issue:** when a task is approved, its author or an approver clicks **Create Jira issue** on the task. The issue gets the title as its summary. The description is built from the sections, plus "Requested by … in TeamDesk (#n)".
- **Retry:** if creation fails, the task shows Jira's reason and a **Retry Jira** button. A second click can't create a duplicate.
- **Find the key:** the Jira key shows in the **Jira** column of the Tasks list; click it to open the issue. Inside a task, use **Open DATA-7 in Jira**.
- **Disconnect:** **Disconnect** removes the connection and the saved token. Existing keys and links on tasks stay.

## 8. Connector: Microsoft Teams channel

**Where:** Settings → Connections → Microsoft Teams. **Who:** workspace admins. It posts team updates to one Teams channel. This uses Teams **Workflows**, so no bot or app registration is needed. (The old Office 365 "Incoming Webhook" connectors are retired.)

### 8.1 Create the workflow in Teams

1. In Teams, go to the channel, click **⋯** next to its name, and choose **Workflows**.
2. Pick the template **Send webhook alerts to a channel**. If your tenant names it differently, search for "webhook".
3. Give it a name, such as `TeamDesk`, and sign in if asked. Confirm the team and channel, then click **Add workflow**.
4. Copy the link it shows. It starts with `https://` and contains `logic.azure.com` or `powerplatform.com`.

The workflow posts as the person who created it. If that person leaves the company, the workflow stops working and must be recreated.

### 8.2 Fill in the connection

| Field | What to fill in |
|---|---|
| **Workflow link** | The link from 8.1. Stored encrypted. Only Microsoft workflow addresses are accepted. Leave it empty when editing to keep the saved link. |
| **Post when** | Tick the updates the channel should get: a task needs approval; a task is approved, rejected or sent back; someone comments; a Jira issue is created or fails. |

Click **Connect Teams**, then **Send a test**; a card should appear in the channel. Each card has the update, the task title and an **Open TeamDesk** button. If it fails, TeamDesk shows Teams' answer. A 4xx answer usually means the workflow was turned off or deleted.

## 9. Personal Teams reminders

**Where:** your name at the bottom left → **My settings** → **Teams reminders**. **Who:** each person, for themselves.

1. In Teams, open **Workflows** (from the left bar, or **⋯** in your chat with yourself).
2. Pick **Send webhook alerts to a chat**, choose your own chat, and click **Add workflow**.
3. Copy the link, paste it in **Teams reminders**, then click **Connect** and **Send a test**.

From then on, your Teams chat gets:
- your reminders;
- "still waiting on …" follow-ups;
- at 9:00 in your time zone, a summary of your pinned, due and overdue tasks.

These come from the background worker, so they stop if it isn't running. Only you can see or change your link.

## 10. AI

AI is off until the platform team turns it on with `AI_ENABLED=true` and a `VERTEX_API_KEY`. No AI settings are shown in the app.

- **Where the calls are:** every AI call is in `backend/app/ai.py`. It sends a Gemini `generateContent` request to `AI_BASE_URL`/publishers/google/models/`GEMINI_MODEL`, with the key in the `x-goog-api-key` header.
- **Using a proxy:** to route through a company proxy, change the `generate` function in that one file.
- **What uses it today:** tidying Jira comments (7.3). Each team can still turn that off.
- **If AI fails:** the original text is used, so nothing is lost.

## 11. Troubleshooting

| What you see | Why, and the fix |
|---|---|
| A workspace you created doesn't appear in the sidebar | You aren't in its admin group and you aren't a platform owner. Check `DEV_USER_GROUPS` / your entitlement groups. |
| "Jira refused the credentials" | Token expired or wrong, or (Cloud) the email isn't the token's owner. Make a new token, paste it, save. |
| "Jira said: issuetype: …" | The task type's **Jira issue type** doesn't exist in that project. Fix it under Task types. |
| "Jira said: customfield_…: … is required" | The project needs a field TeamDesk isn't sending. Add it to **Extra Jira fields** or map a section to it. |
| Statuses never change in TeamDesk | The worker isn't running, or it can't reach Jira. Check the worker logs for "Jira sync failed". |
| Comments don't appear in Jira | **Copy comments to Jira** is off, or the task has no Jira key. Open the task's activity to see any Jira error. |
| Teams test says HTTP 4xx | The workflow was turned off or deleted, or its owner left. Recreate it (8.1) and paste the new link. |
| Saved Jira/Teams connections stopped working after a deploy | `SESSION_SECRET` changed, so the saved secrets can't be decrypted. Re-enter the token and links. |
