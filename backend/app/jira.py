"""Jira per workspace (Cloud or Data Center, REST API v2): connection, creating issues from team tasks,
copying comments to Jira (tidied by AI), and reading Jira status back through the team's own status mapping."""
import logging
from datetime import datetime, timedelta
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app import ai
from app.access import Ctx, require
from app.audit import record
from app.config import Settings
from app.crypto import seal, unseal
from app.db import now
from app.scoped import Scoped
from app.teams import post_workspace
from app.templates import get_template

log = logging.getLogger(__name__)
TRANSPORT: httpx.AsyncBaseTransport | None = None  # tests swap in httpx.MockTransport
CREATABLE = ("approved", "jira_failed")
SYNCED = ("in_jira", "in_progress", "done")  # TeamDesk statuses a Jira status can map to
# Used when a team hasn't mapped a Jira status by name: every Jira workflow puts each status in one of these categories.
CATEGORY = {"new": "in_jira", "indeterminate": "in_progress", "done": "done"}

router = APIRouter(prefix="/api/w/{workspace_id}")


class JiraConnection(BaseModel):
    kind: Literal["cloud", "datacenter"]
    base_url: str = Field(pattern=r"^https://[^\s/]+(/[^\s]*)?$", max_length=300)
    email: str = Field("", max_length=200)  # Cloud only
    token: str = Field("", max_length=2000)  # empty on update keeps the saved token
    project_key: str = Field(pattern=r"^[A-Z][A-Z0-9_]{1,19}$")
    status_map: dict[str, Literal["in_jira", "in_progress", "done"]] = Field(default_factory=dict, max_length=100)
    sync_comments: bool = True
    ai_comments: bool = True


FIELDS = ("kind", "base_url", "email", "project_key", "status_map", "sync_comments", "ai_comments")


def public_view(jira: dict | None) -> dict | None:
    return jira and {k: jira.get(k) for k in FIELDS} | {"has_token": True}


def client(settings: Settings, jira: dict) -> httpx.AsyncClient:
    token = unseal(settings, jira["token"])
    auth = httpx.BasicAuth(jira["email"], token) if jira["kind"] == "cloud" else None
    headers = {} if auth else {"Authorization": f"Bearer {token}"}
    return httpx.AsyncClient(base_url=jira["base_url"].rstrip("/"), auth=auth, headers=headers,
                             timeout=15, transport=TRANSPORT)


def explain(r: httpx.Response) -> str:
    if r.status_code in (401, 403):
        return "Jira refused the credentials. Check the email and token."
    if r.status_code == 404:
        return "Jira couldn't find that. Check the address and project key."
    try:
        body = r.json()
        msgs = [*body.get("errorMessages", []), *(f"{k}: {v}" for k, v in body.get("errors", {}).items())]
    except ValueError:
        msgs = []
    return f"Jira said: {'; '.join(msgs)}" if msgs else f"Jira answered with HTTP {r.status_code}."


def unreachable(e: httpx.HTTPError) -> str:
    return f"Couldn't reach Jira: {e.__class__.__name__}. Check the address and network."


# ---- connection settings ----

@router.get("/connections/jira")
async def get_jira(ctx: Ctx = Depends(require("connections.manage"))):
    return public_view(ctx.workspace.get("jira"))


@router.put("/connections/jira")
async def put_jira(body: JiraConnection, ctx: Ctx = Depends(require("connections.manage"))):
    old = ctx.workspace.get("jira") or {}
    if body.kind == "cloud" and not body.email.strip():
        raise HTTPException(422, "Jira Cloud needs the email of the account the token belongs to.")
    if not body.token and not old.get("token"):
        raise HTTPException(422, "Add a token.")
    jira = {**body.model_dump(exclude={"token"}), "base_url": body.base_url.rstrip("/"),
            "email": body.email.strip() if body.kind == "cloud" else "",
            "token": seal(ctx.settings, body.token) if body.token else old["token"]}
    await ctx.scoped.db.workspaces.update_one({"_id": ctx.scoped.workspace_id}, {"$set": {"jira": jira}})
    await record(ctx, "connection.jira.saved", "workspace", {"base_url": jira["base_url"], "project_key": jira["project_key"]})
    return public_view(jira)


@router.delete("/connections/jira", status_code=204)
async def delete_jira(ctx: Ctx = Depends(require("connections.manage"))):
    await ctx.scoped.db.workspaces.update_one({"_id": ctx.scoped.workspace_id}, {"$unset": {"jira": ""}})
    await record(ctx, "connection.jira.removed", "workspace", {})
    return Response(status_code=204)


def saved(ctx: Ctx) -> dict:
    jira = ctx.workspace.get("jira")
    if not jira:
        raise HTTPException(404, "Save the Jira connection first.")
    return jira


@router.post("/connections/jira/test")
async def test_jira(ctx: Ctx = Depends(require("connections.manage"))):
    jira = saved(ctx)
    try:
        async with client(ctx.settings, jira) as c:
            me = await c.get("/rest/api/2/myself")
            if me.status_code != 200:
                return {"ok": False, "message": explain(me)}
            project = await c.get(f"/rest/api/2/project/{jira['project_key']}")
            if project.status_code != 200:
                return {"ok": False, "message": f"Signed in, but project {jira['project_key']}: {explain(project)}"}
    except httpx.HTTPError as e:
        return {"ok": False, "message": unreachable(e)}
    who = me.json().get("displayName") or me.json().get("name", "")
    return {"ok": True, "message": f"Connected as {who} to {project.json().get('name', jira['project_key'])}."}


@router.get("/connections/jira/statuses")
async def jira_statuses(ctx: Ctx = Depends(require("connections.manage"))):
    """The statuses in this team's Jira workflow, each with the TeamDesk status it maps to by default."""
    jira = saved(ctx)
    try:
        async with client(ctx.settings, jira) as c:
            r = await c.get(f"/rest/api/2/project/{jira['project_key']}/statuses")
    except httpx.HTTPError as e:
        raise HTTPException(502, unreachable(e))
    if r.status_code != 200:
        raise HTTPException(502, explain(r))
    found: dict[str, str] = {}
    for issue_type in r.json():
        for s in issue_type.get("statuses", []):
            found.setdefault(s["name"], CATEGORY.get(s.get("statusCategory", {}).get("key", ""), "in_jira"))
    return [{"name": n, "default": d} for n, d in sorted(found.items())]


# ---- creating issues ----

def build_fields(jira: dict, template: dict, task: dict) -> dict:
    """The team's Jira template: issue type, project, extra fields, and which sections go to their own Jira fields."""
    described, own = [], {}
    for s in template["sections"]:
        text = task["fields"].get(s["key"], "").strip()
        if not text:
            continue
        if s.get("jira_field"):
            own[s["jira_field"]] = text
        else:
            described.append(f"h3. {s['label']}\n{text}")
    described.append(f"_Requested by {task['author']['name']} in TeamDesk (#{task['number']})._")
    labels = [l.replace(" ", "-") for l in dict.fromkeys([*template.get("default_labels", []), *task["labels"]])]
    return {**template.get("jira_extra_fields", {}), **own,
            "project": {"key": template.get("jira_project_key") or jira["project_key"]},
            "summary": task["title"][:250], "issuetype": {"name": template["jira_issue_type"]},
            "description": "\n\n".join(described), "labels": labels}


async def _activity(scoped: Scoped, task_id: str, who: dict, kind: str, data: dict) -> None:
    await scoped.col("activity").insert({"task_id": task_id, "at": now(), "actor": who, "kind": kind, "data": data})


@router.post("/tasks/{task_id}/jira")
async def create_jira(task_id: str, ctx: Ctx = Depends(require("task.view"))):
    jira = ctx.workspace.get("jira")
    if not jira:
        raise HTTPException(409, "Jira isn't connected for this workspace.")
    tasks = ctx.scoped.col("tasks")
    task = await tasks.find_one({"_id": task_id})
    if not task:
        raise HTTPException(404, "Task not found.")
    if task["author"]["sub"] != ctx.user.sub and not ctx.can("task.approve"):
        raise HTTPException(403, "Only the author or an approver can create the Jira issue.")
    template = await get_template(ctx, task["type_key"])
    # Claim first so two clicks can't create two issues.
    task = await tasks.update({"_id": task_id, "status": {"$in": list(CREATABLE)}, "jira_key": None, "jira_creating": {"$ne": True}},
                              {"$set": {"jira_creating": True}})
    if not task:
        raise HTTPException(409, "This task can't get a Jira issue now. It needs to be approved and not have one already.")
    who = {"sub": ctx.user.sub, "name": ctx.user.name}
    error = None
    try:
        async with client(ctx.settings, jira) as c:
            r = await c.post("/rest/api/2/issue", json={"fields": build_fields(jira, template, task)})
        if r.status_code != 201:
            error = explain(r)
    except httpx.HTTPError as e:
        error = unreachable(e)
    t = now()
    link = f"/w/{ctx.scoped.workspace_id}/tasks/{task_id}"
    if error:
        await tasks.update({"_id": task_id}, {"$set": {"status": "jira_failed", "jira_error": error, "jira_creating": False, "updated_at": t}})
        await _activity(ctx.scoped, task_id, who, "jira_failed", {"error": error})
        ctx.background.add_task(post_workspace, ctx.settings, ctx.workspace, "jira", f"Jira issue failed for #{task['number']} {task['title']}", [error], link)
        raise HTTPException(502, error)
    key = r.json()["key"]
    task = await tasks.update({"_id": task_id}, {"$set": {
        "status": "in_jira", "jira_key": key, "jira_url": f"{jira['base_url']}/browse/{key}", "jira_error": None,
        "jira_creating": False, "updated_at": t}})
    await _activity(ctx.scoped, task_id, who, "jira_created", {"key": key})
    await record(ctx, "jira.created", task_id, {"key": key, "number": task["number"]})
    ctx.background.add_task(post_workspace, ctx.settings, ctx.workspace, "jira", f"{key} created for #{task['number']} {task['title']}", [], link)
    return {"jira_key": key, "jira_url": task["jira_url"], "status": task["status"]}


# ---- comments ----

async def push_comment(db, settings: Settings, workspace: dict, task: dict, author: str, text: str) -> None:
    """Runs after the comment is saved. Failures are written to the task's activity, never lost silently."""
    jira = workspace["jira"]
    body = await ai.jira_comment(settings, text, task["title"]) if jira.get("ai_comments", True) else text
    scoped = Scoped(db, workspace["_id"])
    who = {"sub": "jira", "name": "Jira"}
    try:
        async with client(settings, jira) as c:
            r = await c.post(f"/rest/api/2/issue/{task['jira_key']}/comment", json={"body": f"{body}\n\n_{author}, via TeamDesk_"})
        error = None if r.status_code == 201 else explain(r)
    except httpx.HTTPError as e:
        error = unreachable(e)
    if error:
        log.warning("Jira comment on %s failed: %s", task["jira_key"], error)
        await _activity(scoped, task["_id"], who, "jira_comment_failed", {"error": error})


def wants_comment(workspace: dict, task: dict) -> bool:
    return bool(task.get("jira_key") and workspace.get("jira") and workspace["jira"].get("sync_comments", True))


# ---- status sync (worker) ----

def map_status(jira: dict, status: dict) -> str:
    return jira.get("status_map", {}).get(status["name"]) or CATEGORY.get(status.get("statusCategory", {}).get("key", ""), "in_jira")


async def sync_statuses(db, settings: Settings, at: datetime) -> int:
    """Reads the Jira status of every linked, unfinished task and applies the team's mapping. One workspace at a time,
    each at most every JIRA_SYNC_MINUTES; claimed first so several worker replicas don't repeat it."""
    changed = 0
    due = at - timedelta(minutes=settings.jira_sync_minutes)
    async for ws in db.workspaces.find({"archived": False, "jira": {"$exists": True},
                                        "$or": [{"jira_synced_at": None}, {"jira_synced_at": {"$lte": due}}]}):
        if not await db.workspaces.find_one_and_update({"_id": ws["_id"], "jira_synced_at": ws.get("jira_synced_at")},
                                                       {"$set": {"jira_synced_at": at}}):
            continue
        scoped = Scoped(db, ws["_id"])
        tasks = await scoped.col("tasks").find({"jira_key": {"$ne": None}, "status": {"$in": ["in_jira", "in_progress"]}})
        # ponytail: one GET per open linked task (works on Cloud and Data Center alike); batch with JQL search if a team has thousands.
        try:
            async with client(settings, ws["jira"]) as c:
                for t in tasks:
                    r = await c.get(f"/rest/api/2/issue/{t['jira_key']}", params={"fields": "status"})
                    if r.status_code != 200:
                        continue
                    status = r.json()["fields"]["status"]
                    new = map_status(ws["jira"], status)
                    if new != t["status"] or status["name"] != t.get("jira_status"):
                        await scoped.col("tasks").update({"_id": t["_id"]}, {"$set": {"status": new, "jira_status": status["name"], "updated_at": at}})
                        if new != t["status"]:
                            await _activity(scoped, t["_id"], {"sub": "jira", "name": "Jira"}, "jira_status", {"status": status["name"]})
                            changed += 1
        except httpx.HTTPError:
            log.exception("Jira sync failed for workspace %s", ws["_id"])
    return changed
