from datetime import UTC, datetime

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING, TEXT
from pymongo.asynchronous.database import AsyncDatabase


def new_id() -> str:
    return str(ObjectId())


def now() -> datetime:
    return datetime.now(UTC)


async def ensure_indexes(db: AsyncDatabase) -> None:
    await db.workspaces.create_index("slug", unique=True)
    await db.templates.create_index([("workspace_id", ASCENDING), ("key", ASCENDING)], unique=True)
    await db.tasks.create_index([("workspace_id", ASCENDING), ("number", ASCENDING)], unique=True)
    await db.tasks.create_index([("title", TEXT), ("search_text", TEXT)])
    await db.tasks.create_index([("workspace_id", ASCENDING), ("status", ASCENDING), ("submitted_at", ASCENDING)])
    await db.personal_items.create_index([("owner_sub", ASCENDING), ("status", ASCENDING), ("kind", ASCENDING)])
    await db.personal_items.create_index([("owner_sub", ASCENDING), ("today_on", ASCENDING)])
    await db.personal_items.create_index([("title", TEXT), ("search_text", TEXT)])
    await db.personal_notes.create_index([("owner_sub", ASCENDING), ("workspace_id", ASCENDING), ("task_id", ASCENDING)], unique=True)
    await db.personal_items.create_index([("remind_at", ASCENDING)], partialFilterExpression={"fired_at": None, "remind_at": {"$type": "date"}})
    await db.personal_notifications.create_index([("owner_sub", ASCENDING), ("read", ASCENDING), ("created_at", DESCENDING)])
    await db.activity.create_index([("workspace_id", ASCENDING), ("task_id", ASCENDING), ("at", ASCENDING)])
    await db.docs.create_index([("title", TEXT), ("body", TEXT)])
    await db.docs.create_index([("workspace_id", ASCENDING), ("folder_id", ASCENDING)])
    await db.doc_versions.create_index([("workspace_id", ASCENDING), ("doc_id", ASCENDING), ("version", DESCENDING)])
    await db.meetings.create_index([("workspace_id", ASCENDING), ("date", DESCENDING)])
    await db.audit.create_index([("workspace_id", ASCENDING), ("at", DESCENDING)])
    await db.notifications.create_index([("workspace_id", ASCENDING), ("user_sub", ASCENDING), ("read", ASCENDING)])
