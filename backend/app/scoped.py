from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.db import new_id, now


def out(doc: dict) -> dict:
    d = {k: v for k, v in doc.items() if k not in ("_id", "workspace_id", "owner_sub")}
    return {"id": doc["_id"], **d}


class ScopedCollection:
    """A collection seen through one key: a workspace (Scoped) or an owner (Personal). Every query carries it."""

    def __init__(self, col, key: str, value: str):
        self._col = col
        self._key = key
        self._value = value

    def _f(self, filter: dict) -> dict:
        return {**filter, self._key: self._value}

    async def insert(self, doc: dict) -> dict:
        doc = {"_id": new_id(), "created_at": now(), **doc, self._key: self._value}
        await self._col.insert_one(doc)
        return doc

    async def find(self, filter: dict, sort: list[tuple[str, int]] | None = None, limit: int = 0) -> list[dict]:
        cursor = self._col.find(self._f(filter), sort=sort, limit=limit)
        return [d async for d in cursor]

    async def find_one(self, filter: dict) -> dict | None:
        return await self._col.find_one(self._f(filter))

    def _check(self, update: dict) -> None:
        for op in ("$set", "$unset", "$rename"):
            if self._key in update.get(op, {}):
                raise ValueError(f"{self._key} cannot be changed")

    async def update(self, filter: dict, update: dict) -> dict | None:
        self._check(update)
        return await self._col.find_one_and_update(self._f(filter), update, return_document=ReturnDocument.AFTER)

    async def update_many(self, filter: dict, update: dict) -> int:
        self._check(update)
        return (await self._col.update_many(self._f(filter), update)).modified_count

    async def count(self, filter: dict) -> int:
        return await self._col.count_documents(self._f(filter))

    async def delete(self, filter: dict) -> int:
        return (await self._col.delete_many(self._f(filter))).deleted_count


class Scoped:
    def __init__(self, db: AsyncDatabase, workspace_id: str):
        self.db = db
        self.workspace_id = workspace_id

    def col(self, name: str) -> ScopedCollection:
        return ScopedCollection(self.db[name], "workspace_id", self.workspace_id)

    async def next_seq(self, name: str) -> int:
        doc = await self.db.counters.find_one_and_update(
            {"_id": f"{self.workspace_id}:{name}"}, {"$inc": {"seq": 1}},
            upsert=True, return_document=ReturnDocument.AFTER)
        return doc["seq"]


class Personal:
    """One person's private data. No role or permission reaches past it."""

    def __init__(self, db: AsyncDatabase, owner_sub: str):
        self.db = db
        self.owner_sub = owner_sub

    def col(self, name: str) -> ScopedCollection:
        return ScopedCollection(self.db[name], "owner_sub", self.owner_sub)
