"""Background worker: `python -m app.worker`. Fires due reminders, waiting-on nudges, the 9:00 Teams digest and Jira status sync.

Safe with several replicas: each item is claimed with find_one_and_update (sets fired_at / nudge_fired_at)
before anything is sent, so delivery is at most once. Email failures are logged, not retried."""
import asyncio
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from pymongo import AsyncMongoClient

from app.access import resolve
from app.away import away_now
from app.config import Settings
from app.jira import sync_statuses
from app.db import ensure_indexes, new_id, now
from app.my_time import today_for
from app.notifications import send_email
from app.scoped import Scoped
from app.teams import notify_user

log = logging.getLogger(__name__)
INTERVAL = 60
DIGEST_HOUR = 9
BATCH = 200
NO_ACCESS = "A task you no longer have access to"


async def _deliver(db, settings: Settings, item: dict, kind: str, text: str, at: datetime) -> None:
    await db.personal_notifications.insert_one({
        "_id": new_id(), "owner_sub": item["owner_sub"], "kind": kind, "text": text, "item_id": item["_id"],
        "read": False, "created_at": at})
    if settings.smtp_host:
        user = await db.users.find_one({"_id": item["owner_sub"]})
        if user and user.get("email"):
            try:
                await asyncio.to_thread(send_email, settings, user["email"], text, f"{text}\n\n{settings.public_url}/me/today")
            except Exception:
                log.exception("Reminder email failed")
    await notify_user(db, settings, item["owner_sub"], text, [])


async def _reminder_text(db, item: dict) -> str:
    link = item.get("link")
    if not link:
        return f"Reminder: {item['title']}"
    user = await db.users.find_one({"_id": item["owner_sub"]}) or {}
    ws = await db.workspaces.find_one({"_id": link["workspace_id"], "archived": False})
    task = ws and "task.view" in resolve(ws, user.get("groups", []))[1] \
        and await Scoped(db, ws["_id"]).col("tasks").find_one({"_id": link["task_id"]})
    return f"Reminder: {task['title'] if task else NO_ACCESS}"


async def fire_reminders(db, settings: Settings, at: datetime) -> int:
    n = 0
    cursor = db.personal_items.find({"status": "open", "fired_at": None, "remind_at": {"$lte": at}}, limit=BATCH)
    async for cand in cursor:
        item = await db.personal_items.find_one_and_update(
            {"_id": cand["_id"], "status": "open", "fired_at": None, "remind_at": {"$lte": at}}, {"$set": {"fired_at": at}})
        if item:
            await _deliver(db, settings, item, "reminder", await _reminder_text(db, item), at)
            n += 1
    return n


async def fire_nudges(db, settings: Settings, at: datetime) -> int:
    n = 0
    horizon = (at.date() + timedelta(days=1)).isoformat()  # some tz is already on this date
    tzs: dict[str, str] = {}
    cursor = db.personal_items.find({"kind": "waiting", "status": "open", "nudge_fired_at": None,
                                     "waiting.since": {"$lte": horizon}}, limit=BATCH * 5)
    async for cand in cursor:
        sub = cand["owner_sub"]
        if sub not in tzs:
            tzs[sub] = ((await db.users.find_one({"_id": sub})) or {}).get("tz", "UTC")
        w = cand["waiting"]
        since = date.fromisoformat(w["since"])
        days = (today_for(tzs[sub], at) - since).days
        if days < w["nudge_after_days"]:
            continue
        item = await db.personal_items.find_one_and_update(
            {"_id": cand["_id"], "status": "open", "nudge_fired_at": None}, {"$set": {"nudge_fired_at": at}})
        if item:
            await _deliver(db, settings, item, "nudge", f"Still waiting on {w['who']} for {item['title']} ({days} days)", at)
            n += 1
    return n


async def fire_digests(db, settings: Settings, at: datetime) -> int:
    """Once a day after 9:00 in each person's time zone: what's pinned, due or overdue, sent to their Teams chat."""
    n = 0
    async for user in db.users.find({"teams_webhook": {"$exists": True}}):
        tz = user.get("tz", "UTC")
        local = at.astimezone(ZoneInfo(tz))
        d = local.date().isoformat()
        if local.hour < DIGEST_HOUR or user.get("digest_on") == d or away_now(user, at):  # no digest while out of office
            continue
        if not await db.users.find_one_and_update({"_id": user["_id"], "digest_on": {"$ne": d}}, {"$set": {"digest_on": d}}):
            continue
        items = [i async for i in db.personal_items.find(
            {"owner_sub": user["_id"], "status": "open", "kind": "task",
             "$or": [{"today_on": d}, {"due_on": {"$lte": d}}]}, sort=[("due_on", 1)], limit=10)]
        if items:
            lines = [f"{i['title']}{' (overdue)' if (i.get('due_on') or d) < d else ''}" for i in items]
            await notify_user(db, settings, user["_id"], f"Your day: {len(items)} {'task' if len(items) == 1 else 'tasks'}", lines)
            n += 1
    return n


async def run_once(db, settings: Settings, at: datetime | None = None) -> dict:
    at = at or now()
    return {"reminders": await fire_reminders(db, settings, at), "nudges": await fire_nudges(db, settings, at),
            "digests": await fire_digests(db, settings, at), "jira": await sync_statuses(db, settings, at)}


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    settings = Settings()
    client = AsyncMongoClient(settings.mongo_uri, tz_aware=True)
    db = client[settings.mongo_db]
    await ensure_indexes(db)
    log.info("Worker started")
    while True:
        try:
            done = await run_once(db, settings)
            if any(done.values()):
                log.info("Fired %s", done)
        except Exception:
            log.exception("Worker pass failed")
        await asyncio.sleep(INTERVAL)


if __name__ == "__main__":
    asyncio.run(main())
