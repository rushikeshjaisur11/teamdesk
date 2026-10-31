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
    await db.ideas.create_index([("workspace_id", ASCENDING), ("owner_sub", ASCENDING)])
    await db.activity.create_index([("workspace_id", ASCENDING), ("task_id", ASCENDING), ("at", ASCENDING)])
    await db.audit.create_index([("workspace_id", ASCENDING), ("at", DESCENDING)])
    await db.notifications.create_index([("workspace_id", ASCENDING), ("user_sub", ASCENDING), ("read", ASCENDING)])
