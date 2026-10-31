from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import AwareDatetime, BaseModel, Field

from app.access import Ctx, require
from app.audit import record
from app.db import now
from app.notifications import notify
from app.task_flow import from_statuses, next_status
from app.tasks import actor, load, log_activity, view

NEED_REASON = "Please add a reason so the author knows what to change."
ALREADY = "This task was already decided by someone else. Refresh to see the latest."
STATUS = {a: next_status("pending_approval", a) for a in ("approve", "reject", "request_changes", "duplicate", "snooze")}


async def decide(ctx: Ctx, task_id: str, action: str, reason: str | None = None,
                 duplicate_of: str | None = None, until: datetime | None = None) -> dict:
    if not ctx.can("task.approve"):
        raise HTTPException(403, "You don't have permission to do this. Ask a workspace admin.")
    if action not in STATUS:
        raise HTTPException(422, f"Unknown action: {action}.")
    task = await load(ctx, task_id)
    if action == "approve" and task["author"]["sub"] == ctx.user.sub:
        raise HTTPException(403, "You can't approve your own task. Ask another approver.")
    reason = (reason or "").strip() or None
    if action in ("reject", "request_changes") and not reason:
        raise HTTPException(422, NEED_REASON)
    if action == "duplicate" and (duplicate_of == task_id or not duplicate_of
                                  or not await ctx.scoped.col("tasks").find_one({"_id": duplicate_of})):
        raise HTTPException(422, "Pick the original task this one duplicates.")
    if action == "snooze" and (until is None or until <= now()):
        raise HTTPException(422, "Pick a time in the future to snooze until.")
    decision = {"action": action, "by": actor(ctx), "at": now(), "reason": reason}
    task = await ctx.scoped.col("tasks").update(
        {"_id": task_id, "status": {"$in": from_statuses(action)}},
        {"$set": {"status": STATUS[action], "decision": decision, "updated_at": now(),
                  "duplicate_of": duplicate_of if action == "duplicate" else task.get("duplicate_of"),
                  "snoozed_until": until if action == "snooze" else None}})
    if not task:
        raise HTTPException(409, ALREADY)
    await log_activity(ctx, task_id, "decision", {"action": action, "reason": reason})
    await record(ctx, f"task.{action}", task_id, {"number": task["number"]})
    text = decision_text(task["number"], action, ctx.user.name, reason)
    if text:
        await notify(ctx, [task["author"]["sub"]], "decision", task, text)
    return task


def decision_text(number: int, action: str, who: str, reason: str | None) -> str | None:
    return {"approve": f"#{number} was approved by {who}",
            "reject": f"#{number} was rejected by {who}: {reason}",
            "request_changes": f"{who} asked for changes on #{number}: {reason}",
            "duplicate": f"#{number} was marked as a duplicate by {who}"}.get(action)


def queue_filter() -> dict:
    return {"$or": [{"status": "pending_approval"}, {"status": "snoozed", "snoozed_until": {"$lte": now()}}]}


class Decision(BaseModel):
    action: str
    reason: str | None = Field(None, max_length=2000)
    duplicate_of: str | None = None
    until: AwareDatetime | None = None


class Bulk(BaseModel):
    task_ids: list[str] = Field(max_length=100)


router = APIRouter(prefix="/api/w/{workspace_id}")


@router.get("/approvals")
async def queue(ctx: Ctx = Depends(require("task.approve"))):
    found = await ctx.scoped.col("tasks").find(queue_filter(), sort=[("submitted_at", 1), ("_id", 1)])
    return [view(t) for t in found]


@router.get("/approvals/count")
async def queue_count(ctx: Ctx = Depends(require("task.approve"))):
    return {"count": await ctx.scoped.col("tasks").count(queue_filter())}


@router.post("/tasks/{task_id}/decision")
async def post_decision(task_id: str, body: Decision, ctx: Ctx = Depends(require("task.view"))):
    return view(await decide(ctx, task_id, body.action, body.reason, body.duplicate_of, body.until))


@router.post("/approvals/bulk-approve")
async def bulk_approve(body: Bulk, ctx: Ctx = Depends(require("task.approve"))):
    approved, failed = [], []
    for tid in body.task_ids:
        try:
            await decide(ctx, tid, "approve")
            approved.append(tid)
        except HTTPException as e:
            failed.append({"id": tid, "error": e.detail})
    return {"approved": approved, "failed": failed}
