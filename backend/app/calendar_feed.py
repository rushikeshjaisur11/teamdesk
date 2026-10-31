"""Private iCalendar feed (spec 6.16): a random token per user, stored hashed, titles only."""
import hashlib
import secrets
import time
from datetime import date, datetime, timedelta, UTC

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from app.me import Me, personal

me_router = APIRouter(prefix="/api/me/calendar")
public_router = APIRouter(prefix="/api/calendar")

LIMIT, WINDOW = 60, 3600
HITS: dict[str, list[float]] = {}  # per process; with several replicas the effective limit is LIMIT x replicas


def digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def esc(text: str) -> str:
    text = text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
    return text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\\n")


def fold(line: str) -> str:
    out, b = [], line.encode()
    while len(b) > 75:
        cut = 75
        while b[cut] & 0xC0 == 0x80:  # don't split a UTF-8 character
            cut -= 1
        out.append(b[:cut].decode()); b = b" " + b[cut:]
    out.append(b.decode())
    return "\r\n".join(out)


def build(items: list[dict], stamp: datetime) -> str:
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TeamDesk//My space//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:TeamDesk"]
    s = stamp.strftime("%Y%m%dT%H%M%SZ")
    for i in items:
        if i.get("due_on"):
            d = date.fromisoformat(i["due_on"])
            lines += ["BEGIN:VEVENT", f"UID:{i['_id']}-due@teamdesk", f"DTSTAMP:{s}",
                      f"DTSTART;VALUE=DATE:{d:%Y%m%d}", f"DTEND;VALUE=DATE:{d + timedelta(days=1):%Y%m%d}",
                      f"SUMMARY:{esc(i['title'])}", "END:VEVENT"]
        if i.get("remind_at"):
            t = i["remind_at"].astimezone(UTC)
            lines += ["BEGIN:VEVENT", f"UID:{i['_id']}-remind@teamdesk", f"DTSTAMP:{s}",
                      f"DTSTART:{t:%Y%m%dT%H%M%SZ}", f"DTEND:{t + timedelta(minutes=15):%Y%m%dT%H%M%SZ}",
                      f"SUMMARY:{esc(i['title'])}", "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold(l) for l in lines) + "\r\n"


@me_router.get("")
async def status(me: Me = Depends(personal)):
    u = await me.db.users.find_one({"_id": me.user.sub}) or {}
    return {"enabled": bool(u.get("feed_token_hash"))}


@me_router.post("/reset")
async def reset(request: Request, me: Me = Depends(personal)):
    token = secrets.token_urlsafe(32)
    await me.db.users.update_one({"_id": me.user.sub}, {"$set": {"feed_token_hash": digest(token)}})
    return {"url": f"{me.settings.public_url}/api/calendar/{token}.ics"}


@public_router.get("/{token}.ics")
async def feed(token: str, request: Request):
    t = time.monotonic()
    hits = [h for h in HITS.get(token, []) if t - h < WINDOW]
    if len(hits) >= LIMIT:
        HITS[token] = hits
        raise HTTPException(429, "Too many requests.", headers={"Retry-After": "600"})
    HITS[token] = [*hits, t]
    db = request.app.state.db
    user = await db.users.find_one({"feed_token_hash": digest(token)})
    if not user:
        raise HTTPException(404, "Not found.")
    items = [i async for i in db.personal_items.find(
        {"owner_sub": user["_id"], "status": "open", "$or": [{"due_on": {"$ne": None}}, {"remind_at": {"$ne": None}}]},
        limit=1000)]
    return Response(build(items, datetime.now(UTC)), media_type="text/calendar; charset=utf-8",
                    headers={"Cache-Control": "private, max-age=300"})
