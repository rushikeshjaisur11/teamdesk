"""Background worker: `python -m app.worker`. Fires due reminders and waiting-on nudges.

Safe with several replicas: each item is claimed with find_one_and_update (sets fired_at / nudge_fired_at)
before anything is sent, so delivery is at most once. Email failures are logged, not retried."""
import asyncio
import logging
from datetime import date, datetime, timedelta

from pymongo import AsyncMongoClient

from app.access import resolve
from app.config import Settings
from app.db import ensure_indexes, new_id, now
from app.my_time import today_for
from app.notifications import send_email
from app.scoped import Scoped

log = logging.getLogger(__name__)
INTERVAL = 60
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


async def run_once(db, settings: Settings, at: datetime | None = None) -> dict:
    at = at or now()
    return {"reminders": await fire_reminders(db, settings, at), "nudges": await fire_nudges(db, settings, at)}


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
