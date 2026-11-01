"""Jira connection per workspace (Cloud or Data Center, REST API v2) and creating a Jira issue from a team task."""
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.access import Ctx, require
from app.audit import record
from app.crypto import seal, unseal
from app.db import now
from app.tasks import log_activity
from app.templates import get_template

TRANSPORT: httpx.AsyncBaseTransport | None = None  # tests swap in httpx.MockTransport
CREATABLE = ("approved", "jira_failed")

router = APIRouter(prefix="/api/w/{workspace_id}")


class JiraConnection(BaseModel):
    kind: Literal["cloud", "datacenter"]
    base_url: str = Field(pattern=r"^https://[^\s/]+(/[^\s]*)?$", max_length=300)
    email: str = Field("", max_length=200)  # Cloud only
    token: str = Field("", max_length=2000)  # empty on update keeps the saved token
    project_key: str = Field(pattern=r"^[A-Z][A-Z0-9_]{1,19}$")


def public_view(jira: dict | None) -> dict | None:
    return jira and {k: jira[k] for k in ("kind", "base_url", "email", "project_key")} | {"has_token": True}


def client(ctx: Ctx, jira: dict) -> httpx.AsyncClient:
    token = unseal(ctx.settings, jira["token"])
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
    jira = {"kind": body.kind, "base_url": body.base_url.rstrip("/"), "email": body.email.strip() if body.kind == "cloud" else "",
            "project_key": body.project_key, "token": seal(ctx.settings, body.token) if body.token else old["token"]}
    await ctx.scoped.db.workspaces.update_one({"_id": ctx.scoped.workspace_id}, {"$set": {"jira": jira}})
    await record(ctx, "connection.jira.saved", "workspace", {"base_url": jira["base_url"], "project_key": jira["project_key"]})
    return public_view(jira)


@router.delete("/connections/jira", status_code=204)
async def delete_jira(ctx: Ctx = Depends(require("connections.manage"))):
    await ctx.scoped.db.workspaces.update_one({"_id": ctx.scoped.workspace_id}, {"$unset": {"jira": ""}})
    await record(ctx, "connection.jira.removed", "workspace", {})
    return Response(status_code=204)


@router.post("/connections/jira/test")
async def test_jira(ctx: Ctx = Depends(require("connections.manage"))):
    jira = ctx.workspace.get("jira")
    if not jira:
        raise HTTPException(404, "Save the Jira connection first.")
    try:
        async with client(ctx, jira) as c:
            me = await c.get("/rest/api/2/myself")
            if me.status_code != 200:
                return {"ok": False, "message": explain(me)}
            project = await c.get(f"/rest/api/2/project/{jira['project_key']}")
            if project.status_code != 200:
                return {"ok": False, "message": f"Signed in, but project {jira['project_key']}: {explain(project)}"}
    except httpx.HTTPError as e:
        return {"ok": False, "message": f"Couldn't reach Jira: {e.__class__.__name__}. Check the address and network."}
    who = me.json().get("displayName") or me.json().get("name", "")
    return {"ok": True, "message": f"Connected as {who} to {project.json().get('name', jira['project_key'])}."}


def description(template: dict, task: dict) -> str:
    parts = [f"h3. {s['label']}\n{task['fields'][s['key']].strip()}"
             for s in template["sections"] if task["fields"].get(s["key"], "").strip()]
    parts.append(f"_Requested by {task['author']['name']} in TeamDesk (#{task['number']})._")
    return "\n\n".join(parts)


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
    payload = {"fields": {"project": {"key": jira["project_key"]}, "summary": task["title"][:250],
                          "issuetype": {"name": template["jira_issue_type"]}, "description": description(template, task),
                          "labels": [l.replace(" ", "-") for l in [*template.get("default_labels", []), *task["labels"]]]}}
    error = None
    try:
        async with client(ctx, jira) as c:
            r = await c.post("/rest/api/2/issue", json=payload)
        if r.status_code != 201:
            error = explain(r)
    except httpx.HTTPError as e:
        error = f"Couldn't reach Jira: {e.__class__.__name__}."
    t = now()
    if error:
        task = await tasks.update({"_id": task_id}, {"$set": {"status": "jira_failed", "jira_error": error, "jira_creating": False, "updated_at": t}})
        await log_activity(ctx, task_id, "jira_failed", {"error": error})
        raise HTTPException(502, error)
    key = r.json()["key"]
    task = await tasks.update({"_id": task_id}, {"$set": {
        "status": "in_jira", "jira_key": key, "jira_url": f"{jira['base_url']}/browse/{key}", "jira_error": None,
        "jira_creating": False, "updated_at": t}})
    await log_activity(ctx, task_id, "jira_created", {"key": key})
    await record(ctx, "jira.created", task_id, {"key": key, "number": task["number"]})
    return {"jira_key": key, "jira_url": task["jira_url"], "status": task["status"]}
