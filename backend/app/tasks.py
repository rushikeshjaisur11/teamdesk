from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, StringConstraints

from app.access import Ctx, require
from app.audit import record
from app.db import now
from app.notifications import approver_subs, notify
from app.rules import find_matching_rule
from app.scoped import out
from app.task_flow import EDITABLE, missing_required, next_status, search_text
from app.templates import get_template

FieldText = Annotated[str, StringConstraints(max_length=20000)]
Label = Annotated[str, StringConstraints(pattern=r"^\S{1,50}$")]
TEXT_SCORE = [("score", {"$meta": "textScore"})]


class NewTask(BaseModel):
    type_key: str
    title: str = Field(min_length=1, max_length=200)
    fields: dict[str, FieldText] = {}
    labels: list[Label] | None = Field(None, max_length=20)
    submit: bool = False
    from_idea_id: str | None = None


class TaskPatch(BaseModel):
    type_key: str | None = None
    title: str | None = Field(None, min_length=1, max_length=200)
    fields: dict[str, FieldText] | None = None
    labels: list[Label] | None = Field(None, max_length=20)


class Comment(BaseModel):
    text: str = Field(min_length=1, max_length=10000)


def view(task: dict) -> dict:
    d = out(task)
    d.pop("search_text", None)
    return d


def actor(ctx: Ctx) -> dict:
    return {"sub": ctx.user.sub, "name": ctx.user.name}


async def log_activity(ctx: Ctx, task_id: str, kind: str, data: dict | None = None) -> dict:
    return await ctx.scoped.col("activity").insert(
        {"task_id": task_id, "at": now(), "actor": actor(ctx), "kind": kind, "data": data or {}})


def check_field_keys(template: dict, fields: dict) -> None:
    unknown = set(fields) - {s["key"] for s in template["sections"]}
    if unknown:
        raise HTTPException(422, f"Unknown fields for {template['name']}: {', '.join(sorted(unknown))}.")


async def submit_task(ctx: Ctx, task: dict) -> dict:
    template = await get_template(ctx, task["type_key"])
    missing = missing_required(template, task["fields"])
    if missing:
        raise HTTPException(422, {"message": "Some required fields are empty.", "fields": missing})
    rule = await find_matching_rule(ctx, task)
    t = now()
    fields = {"status": next_status(task["status"], "auto_approve" if rule else "submit"),
              "submitted_at": t, "updated_at": t}
    if rule:
        fields["decision"] = {"action": "approve", "by": {"sub": "rule", "name": rule["name"]}, "at": t, "reason": None}
    task = await ctx.scoped.col("tasks").update({"_id": task["_id"], "status": task["status"]}, {"$set": fields})
    if not task:
        raise HTTPException(409, "This task changed while you were submitting it. Refresh and try again.")
    if rule:
        await log_activity(ctx, task["_id"], "auto_approved", {"rule": rule["name"]})
        await record(ctx, "rule.fired", task["_id"], {"rule": rule["name"], "number": task["number"]})
    else:
        await log_activity(ctx, task["_id"], "submitted")
        await notify(ctx, await approver_subs(ctx), "approval_needed", task,
                     f"#{task['number']} {task['title']} needs approval")
    return task


async def load(ctx: Ctx, task_id: str) -> dict:
    task = await ctx.scoped.col("tasks").find_one({"_id": task_id})
    if not task:
        raise HTTPException(404, "Task not found.")
    return task


def check_can_edit(ctx: Ctx, task: dict) -> None:
    if task["author"]["sub"] != ctx.user.sub and not ctx.can("task.edit_any"):
        raise HTTPException(403, "Only the author or a workspace admin can change this task.")


router = APIRouter(prefix="/api/w/{workspace_id}/tasks")


@router.post("", status_code=201)
async def create_task(body: NewTask, ctx: Ctx = Depends(require("task.create"))):
    template = await get_template(ctx, body.type_key)
    check_field_keys(template, body.fields)
    if body.submit and (missing := missing_required(template, body.fields)):
        raise HTTPException(422, {"message": "Some required fields are empty.", "fields": missing})
    labels = template["default_labels"] if body.labels is None else body.labels
    t = now()
    task = await ctx.scoped.col("tasks").insert({
        "number": await ctx.scoped.next_seq("tasks"), "type_key": body.type_key, "title": body.title,
        "fields": body.fields, "labels": labels, "status": "draft",
        "author": {"sub": ctx.user.sub, "name": ctx.user.name, "email": ctx.user.email},
        "decision": None, "duplicate_of": None, "snoozed_until": None, "jira_key": None,
        "search_text": search_text(body.fields, labels), "created_at": t, "updated_at": t, "submitted_at": None})
    await log_activity(ctx, task["_id"], "created")
    if body.from_idea_id:
        await ctx.scoped.col("ideas").update({"_id": body.from_idea_id, "owner_sub": ctx.user.sub},
                                             {"$set": {"promoted_task_id": task["_id"]}})
    if body.submit:
        task = await submit_task(ctx, task)
    return view(task)


@router.get("")
async def list_tasks(status: str = "", type: str = "", mine: bool = False, q: str = "", number: int | None = None,
                     limit: int = Query(200, ge=1, le=500), ctx: Ctx = Depends(require("task.view"))):
    f: dict = {}
    if status:
        f["status"] = {"$in": status.split(",")}
    if type:
        f["type_key"] = type
    if number is not None:
        f["number"] = number
    if mine:
        f["author.sub"] = ctx.user.sub
    sort = [("updated_at", -1), ("_id", -1)]
    if q.strip():
        f["$text"] = {"$search": q}
        sort = TEXT_SCORE
    return [view(t) for t in await ctx.scoped.col("tasks").find(f, sort=sort, limit=limit)]


@router.get("/similar")
async def similar(text: str = "", ctx: Ctx = Depends(require("task.view"))):
    if not text.strip():
        return []
    found = await ctx.scoped.col("tasks").find(
        {"$text": {"$search": text}, "status": {"$nin": ["rejected", "duplicate", "done"]}}, sort=TEXT_SCORE, limit=5)
    return [{"id": t["_id"], "number": t["number"], "title": t["title"], "status": t["status"]} for t in found]


@router.get("/{task_id}")
async def get_task(task_id: str, ctx: Ctx = Depends(require("task.view"))):
    return view(await load(ctx, task_id))


@router.patch("/{task_id}")
async def edit_task(task_id: str, body: TaskPatch, ctx: Ctx = Depends(require("task.view"))):
    task = await load(ctx, task_id)
    check_can_edit(ctx, task)
    if task["status"] not in EDITABLE:
        raise HTTPException(409, "This task is already decided and can't be edited. Add a comment instead.")
    changes = body.model_dump(exclude_none=True)
    merged = {**task, **changes}
    check_field_keys(await get_template(ctx, merged["type_key"]), merged["fields"])
    task = await ctx.scoped.col("tasks").update(
        {"_id": task_id, "status": task["status"]},
        {"$set": {**changes, "search_text": search_text(merged["fields"], merged["labels"]), "updated_at": now(),
                  "last_edited_by": actor(ctx)}})
    if not task:
        raise HTTPException(409, "This task changed while you were editing it. Refresh and try again.")
    await log_activity(ctx, task_id, "edited", {"changed": sorted(changes)})
    return view(task)


@router.post("/{task_id}/submit")
async def submit(task_id: str, ctx: Ctx = Depends(require("task.view"))):
    task = await load(ctx, task_id)
    check_can_edit(ctx, task)
    if task["status"] not in ("draft", "changes_requested"):
        raise HTTPException(409, "This task has already been submitted.")
    return view(await submit_task(ctx, task))


@router.get("/{task_id}/activity")
async def activity(task_id: str, ctx: Ctx = Depends(require("task.view"))):
    await load(ctx, task_id)
    return [out(a) for a in await ctx.scoped.col("activity").find({"task_id": task_id}, sort=[("at", 1), ("_id", 1)])]


@router.post("/{task_id}/comments", status_code=201)
async def comment(task_id: str, body: Comment, ctx: Ctx = Depends(require("task.view"))):
    task = await load(ctx, task_id)
    item = await log_activity(ctx, task_id, "comment", {"text": body.text})
    await notify(ctx, [task["author"]["sub"]], "comment", task, f"{ctx.user.name} commented on #{task['number']}")
    return out(item)
