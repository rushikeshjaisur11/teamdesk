"""Microsoft Teams through Workflows webhooks (no bot registration needed), two ways:

- Team channel, per workspace (Settings > Connections > Teams): approvals needed, decisions, comments, Jira issues.
- Personal chat, per person (My settings > Teams reminders): reminders, waiting-on nudges and a 9:00 digest.

Each is a link from a Teams workflow ("Send webhook alerts to a channel" / "...to a chat"). We post Adaptive Cards to it."""
import logging
from typing import Literal
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.access import Ctx, require
from app.audit import record
from app.config import Settings
from app.crypto import seal, unseal
from app.me import Me, personal

log = logging.getLogger(__name__)
TRANSPORT: httpx.AsyncBaseTransport | None = None  # tests swap in httpx.MockTransport
# Only Microsoft's workflow hosts, so the server can't be pointed at internal addresses.
HOSTS = (".logic.azure.com", ".logic.azure.us", ".api.powerplatform.com", ".api.powerplatform.us")

EVENTS = ("approval_needed", "decision", "comment", "jira")

router = APIRouter(prefix="/api/me/teams")
ws_router = APIRouter(prefix="/api/w/{workspace_id}/connections/teams")


def check_link(url: str) -> str:
    parts = urlsplit(url.strip())
    if parts.scheme != "https" or not (parts.hostname or "").endswith(HOSTS):
        raise HTTPException(422, "Paste the link from your Teams workflow. It starts with https:// and ends in logic.azure.com or powerplatform.com.")
    return url.strip()


def card(title: str, lines: list[str], url: str) -> dict:
    body = [{"type": "TextBlock", "text": title, "weight": "Bolder", "size": "Medium", "wrap": True}]
    body += [{"type": "TextBlock", "text": f"- {line}", "wrap": True, "spacing": "Small"} for line in lines]
    return {"type": "message", "attachments": [{
        "contentType": "application/vnd.microsoft.card.adaptive",
        "content": {"$schema": "http://adaptivecards.io/schemas/adaptive-card.json", "type": "AdaptiveCard", "version": "1.4",
                    "body": body, "actions": [{"type": "Action.OpenUrl", "title": "Open TeamDesk", "url": url}]}}]}


async def post(settings: Settings, sealed_url: str, payload: dict) -> str | None:
    """Returns None when Teams accepted it, else a plain-language reason."""
    try:
        async with httpx.AsyncClient(timeout=15, transport=TRANSPORT) as c:
            r = await c.post(unseal(settings, sealed_url), json=payload)
    except httpx.HTTPError as e:
        return f"Couldn't reach Teams: {e.__class__.__name__}."
    return None if r.status_code < 300 else f"Teams answered with HTTP {r.status_code}. Check the workflow is turned on."


async def notify_user(db, settings: Settings, sub: str, title: str, lines: list[str], path: str = "/me/today") -> None:
    user = await db.users.find_one({"_id": sub}) or {}
    if user.get("teams_webhook"):
        error = await post(settings, user["teams_webhook"], card(title, lines, f"{settings.public_url}{path}"))
        if error:
            log.warning("Teams reminder failed: %s", error)


class Webhook(BaseModel):
    url: str = Field(max_length=2000)


@router.get("")
async def get_teams(me: Me = Depends(personal)):
    user = await me.db.users.find_one({"_id": me.user.sub}) or {}
    return {"connected": bool(user.get("teams_webhook"))}


@router.put("")
async def put_teams(body: Webhook, me: Me = Depends(personal)):
    await me.db.users.update_one({"_id": me.user.sub}, {"$set": {"teams_webhook": seal(me.settings, check_link(body.url))}})
    return {"connected": True}


@router.delete("", status_code=204)
async def delete_teams(me: Me = Depends(personal)):
    await me.db.users.update_one({"_id": me.user.sub}, {"$unset": {"teams_webhook": ""}})
    return Response(status_code=204)


@router.post("/test")
async def test_teams(me: Me = Depends(personal)):
    user = await me.db.users.find_one({"_id": me.user.sub}) or {}
    if not user.get("teams_webhook"):
        raise HTTPException(404, "Save your Teams link first.")
    error = await post(me.settings, user["teams_webhook"],
                       card("TeamDesk is connected", ["Reminders, follow-ups and a 9:00 summary of your day will arrive here."],
                            f"{me.settings.public_url}/me/today"))
    return {"ok": not error, "message": error or "Sent. Check your Teams chat."}


# ---- team channel, per workspace ----

async def post_workspace(settings: Settings, workspace: dict, event: str, title: str, lines: list[str], path: str) -> None:
    teams = workspace.get("teams")
    if teams and event in teams.get("events", EVENTS):
        error = await post(settings, teams["url"], card(title, lines, f"{settings.public_url}{path}"))
        if error:
            log.warning("Teams channel post failed: %s", error)


class ChannelBody(BaseModel):
    url: str = Field("", max_length=2000)  # empty on update keeps the saved link
    events: list[Literal["approval_needed", "decision", "comment", "jira"]] = list(EVENTS)


def channel_view(teams: dict | None) -> dict | None:
    return teams and {"events": teams.get("events", list(EVENTS)), "has_url": True}


@ws_router.get("")
async def get_channel(ctx: Ctx = Depends(require("connections.manage"))):
    return channel_view(ctx.workspace.get("teams"))


@ws_router.put("")
async def put_channel(body: ChannelBody, ctx: Ctx = Depends(require("connections.manage"))):
    old = ctx.workspace.get("teams") or {}
    if not body.url and not old.get("url"):
        raise HTTPException(422, "Paste the link from your Teams workflow.")
    teams = {"url": seal(ctx.settings, check_link(body.url)) if body.url else old["url"], "events": body.events}
    await ctx.scoped.db.workspaces.update_one({"_id": ctx.scoped.workspace_id}, {"$set": {"teams": teams}})
    await record(ctx, "connection.teams.saved", "workspace", {"events": body.events})
    return channel_view(teams)


@ws_router.delete("", status_code=204)
async def delete_channel(ctx: Ctx = Depends(require("connections.manage"))):
    await ctx.scoped.db.workspaces.update_one({"_id": ctx.scoped.workspace_id}, {"$unset": {"teams": ""}})
    await record(ctx, "connection.teams.removed", "workspace", {})
    return Response(status_code=204)


@ws_router.post("/test")
async def test_channel(ctx: Ctx = Depends(require("connections.manage"))):
    teams = ctx.workspace.get("teams")
    if not teams:
        raise HTTPException(404, "Save the Teams link first.")
    error = await post(ctx.settings, teams["url"], card(f"TeamDesk is connected to {ctx.workspace['name']}",
                                                        ["Approvals, decisions, comments and Jira updates will be posted here."],
                                                        f"{ctx.settings.public_url}/w/{ctx.scoped.workspace_id}/tasks"))
    return {"ok": not error, "message": error or "Sent. Check the Teams channel."}
