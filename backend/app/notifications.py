import logging
import smtplib
from email.message import EmailMessage

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel

from app.access import Ctx, require
from app.away import route_approvers
from app.config import Settings
from app.db import now
from app.scoped import out
from app.teams import post_workspace

log = logging.getLogger(__name__)


def email_subject(text: str) -> str:
    """Mail headers can't hold line breaks; the subject is the first line, the body keeps everything."""
    return text.splitlines()[0][:150] if text else ""


def send_email(settings: Settings, to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.smtp_from, to, email_subject(subject)
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_port == 587:
                smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
    except (OSError, smtplib.SMTPException):
        log.exception("Email to %s failed", to)


async def approver_subs(ctx: Ctx) -> list[str]:
    """Who to ask for approval: the workspace's approvers, with anyone away replaced by their backup."""
    return route_approvers([u async for u in ctx.scoped.db.users.find({})], ctx.workspace, now())


async def notify(ctx: Ctx, user_subs: list[str], kind: str, task: dict, text: str) -> None:
    recipients = [s for s in dict.fromkeys(user_subs) if s != ctx.user.sub]
    for sub in recipients:
        await ctx.scoped.col("notifications").insert(
            {"user_sub": sub, "kind": kind, "task_id": task["_id"], "text": text, "read": False, "created_at": now()})
    settings: Settings = ctx.settings
    ctx.background.add_task(post_workspace, settings, ctx.workspace, kind, text, [task["title"]],
                            f"/w/{ctx.scoped.workspace_id}/tasks/{task['_id']}")
    if not settings.smtp_host or not recipients:
        return
    link = f"{settings.public_url}/w/{ctx.scoped.workspace_id}/tasks/{task['_id']}"
    async for u in ctx.scoped.db.users.find({"_id": {"$in": recipients}, "email": {"$ne": ""}}):
        ctx.background.add_task(send_email, settings, u.get("email", ""), text, f"{text}\n\n{link}")


router = APIRouter(prefix="/api/w/{workspace_id}/notifications")


class MarkRead(BaseModel):
    ids: list[str] = []
    all: bool = False


@router.get("")
async def list_notifications(unread: bool = False, limit: int = Query(50, ge=1, le=200),
                             ctx: Ctx = Depends(require("task.view"))):
    f = {"user_sub": ctx.user.sub, **({"read": False} if unread else {})}
    return [out(n) for n in await ctx.scoped.col("notifications").find(f, sort=[("created_at", -1), ("_id", -1)], limit=limit)]


@router.post("/read", status_code=204)
async def mark_read(body: MarkRead, ctx: Ctx = Depends(require("task.view"))):
    f = {"user_sub": ctx.user.sub, "read": False}
    if not body.all:
        f["_id"] = {"$in": body.ids}
    await ctx.scoped.col("notifications").update_many(f, {"$set": {"read": True}})
    return Response(status_code=204)
