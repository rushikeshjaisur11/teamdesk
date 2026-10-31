"""My space: one person's private items, profile and notes. Everything here goes through Personal(owner = caller)."""
from dataclasses import dataclass
from datetime import date
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.auth import User, current_user
from app.config import Settings
from app.db import now
from app.my_time import today_for
from app.scoped import Personal, ScopedCollection, out

Label = Annotated[str, StringConstraints(pattern=r"^\S{1,50}$")]
Kind = Literal["task", "idea", "waiting"]


class ChecklistItem(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    text: str = Field(min_length=1, max_length=300)
    done: bool = False


class Recurrence(BaseModel):
    freq: Literal["daily", "weekdays", "weekly", "monthly"]
    days: list[Annotated[int, Field(ge=0, le=6)]] = []
    day: int | None = Field(None, ge=1, le=31)

    @model_validator(mode="after")
    def complete(self):
        if self.freq == "weekly" and not self.days:
            raise ValueError("Pick at least one day of the week.")
        if self.freq == "monthly" and self.day is None:
            raise ValueError("Pick a day of the month.")
        return self


class Waiting(BaseModel):
    who: str = Field(min_length=1, max_length=200)
    since: date | None = None
    nudge_after_days: int = Field(3, ge=1, le=60)


class Link(BaseModel):
    workspace_id: str
    task_id: str


class ItemFields(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    notes: str | None = Field(None, max_length=20000)
    due_on: date | None = None
    labels: list[Label] | None = Field(None, max_length=20)
    checklist: list[ChecklistItem] | None = Field(None, max_length=50)
    recurrence: Recurrence | None = None
    waiting: Waiting | None = None


class NewItem(ItemFields):
    kind: Kind
    title: str = Field(min_length=1, max_length=500)
    link: Link | None = None

    @model_validator(mode="after")
    def fits_kind(self):
        if self.recurrence and self.kind != "task":
            raise ValueError("Only tasks can repeat.")
        if (self.kind == "waiting") != (self.waiting is not None):
            raise ValueError("Say who you're waiting on." if self.kind == "waiting" else "Only waiting items have a 'waiting on'.")
        return self


class ItemPatch(ItemFields):
    kind: Literal["task"] | None = None  # an idea can become a task; nothing else changes kind


class ProfilePatch(BaseModel):
    tz: str | None = Field(None, max_length=64)
    use_ai: bool | None = None


@dataclass
class Me:
    user: User
    items: ScopedCollection
    notes: ScopedCollection
    db: object
    settings: Settings
    tz: str
    use_ai: bool

    def today(self) -> date:
        return today_for(self.tz, now())


async def personal(request: Request, user: User = Depends(current_user)) -> Me:
    db = request.app.state.db
    doc = await db.users.find_one({"_id": user.sub}) or {}
    p = Personal(db, user.sub)
    return Me(user, p.col("personal_items"), p.col("personal_notes"), db, request.app.state.settings,
              doc.get("tz", "UTC"), doc.get("use_ai", True))


def item_view(doc: dict) -> dict:
    d = out(doc)
    d.pop("search_text", None)
    return d


def search_text(d: dict) -> str:
    return " ".join([d.get("notes") or "", *(d.get("labels") or []), *[c["text"] for c in d.get("checklist") or []]])


def stored(fields: dict, me: Me) -> dict:
    """Dates become the user's-day strings the collection stores."""
    if fields.get("due_on"):
        fields["due_on"] = fields["due_on"].isoformat()
    if w := fields.get("waiting"):
        w["since"] = (w["since"] or me.today()).isoformat()
    return fields


router = APIRouter(prefix="/api/me")


@router.get("/profile")
async def get_profile(me: Me = Depends(personal)):
    return {"sub": me.user.sub, "name": me.user.name, "email": me.user.email, "tz": me.tz, "use_ai": me.use_ai}


@router.patch("/profile")
async def patch_profile(body: ProfilePatch, me: Me = Depends(personal)):
    changes = body.model_dump(exclude_none=True)
    if "tz" in changes:
        try:
            ZoneInfo(changes["tz"])
        except (ZoneInfoNotFoundError, ValueError):
            raise HTTPException(422, "Unknown time zone.")
    if changes:
        await me.db.users.update_one({"_id": me.user.sub}, {"$set": changes}, upsert=True)
    me.tz, me.use_ai = changes.get("tz", me.tz), changes.get("use_ai", me.use_ai)
    return await get_profile(me)


@router.get("/items")
async def list_items(kind: Kind | None = None, status: Literal["open", "done", "dropped"] = "open", q: str = "",
                     limit: int = Query(200, ge=1, le=500), me: Me = Depends(personal)):
    f: dict = {"status": status}
    if kind:
        f["kind"] = kind
    sort = [("updated_at", -1), ("_id", -1)]
    if q.strip():
        f["$text"] = {"$search": q}
        sort = [("score", {"$meta": "textScore"})]
    return [item_view(i) for i in await me.items.find(f, sort=sort, limit=limit)]


@router.post("/items", status_code=201)
async def create_item(body: NewItem, me: Me = Depends(personal)):
    fields = stored(body.model_dump(), me)
    t = now()
    doc = {"notes": "", "labels": [], "checklist": [], **{k: v for k, v in fields.items() if v is not None},
           "status": "open", "today_on": None, "promoted_to": None, "done_at": None, "updated_at": t}
    for key in ("due_on", "recurrence", "waiting", "link"):
        doc.setdefault(key, None)
    doc["search_text"] = search_text(doc)
    return item_view(await me.items.insert(doc))


async def load_item(me: Me, item_id: str) -> dict:
    item = await me.items.find_one({"_id": item_id})
    if not item:
        raise HTTPException(404, "Item not found.")
    return item


@router.patch("/items/{item_id}")
async def patch_item(item_id: str, body: ItemPatch, me: Me = Depends(personal)):
    item = await load_item(me, item_id)
    changes = stored(body.model_dump(exclude_unset=True), me)
    merged = {**item, **changes}
    if merged.get("recurrence") and merged["kind"] != "task":
        raise HTTPException(422, "Only tasks can repeat.")
    updated = await me.items.update({"_id": item_id}, {"$set": {**changes, "search_text": search_text(merged), "updated_at": now()}})
    return item_view(updated)


@router.delete("/items/{item_id}", status_code=204)
async def delete_item(item_id: str, me: Me = Depends(personal)):
    if not await me.items.delete({"_id": item_id}):
        raise HTTPException(404, "Item not found.")
    return Response(status_code=204)


async def set_status(me: Me, item_id: str, status: str, done_at) -> dict:
    await load_item(me, item_id)
    return item_view(await me.items.update({"_id": item_id}, {"$set": {"status": status, "done_at": done_at, "updated_at": now()}}))


@router.post("/items/{item_id}/drop")
async def drop_item(item_id: str, me: Me = Depends(personal)):
    return await set_status(me, item_id, "dropped", now())


@router.post("/items/{item_id}/reopen")
async def reopen_item(item_id: str, me: Me = Depends(personal)):
    return await set_status(me, item_id, "open", None)


async def mark_promoted(db, owner_sub: str, item_id: str, workspace_id: str, task_id: str) -> None:
    """Called by the team task route: only the caller's own item can be marked."""
    t = now()
    await Personal(db, owner_sub).col("personal_items").update(
        {"_id": item_id, "status": "open"},
        {"$set": {"promoted_to": {"workspace_id": workspace_id, "task_id": task_id}, "status": "done", "done_at": t, "updated_at": t}})
