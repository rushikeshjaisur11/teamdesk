"""My space: one person's private items, profile and notes. Everything here goes through Personal(owner = caller)."""
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

from app.access import resolve_user
from app.auth import User, current_user, remember_user
from app.config import Settings
from app.db import now
from app.my_time import next_due, today_for
from app.task_flow import queue_filter
from app.scoped import Personal, Scoped, ScopedCollection, out

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

    @field_validator("checklist")
    @classmethod
    def unique_ids(cls, v):
        if v and len({c.id for c in v}) != len(v):
            raise ValueError("Checklist items need distinct ids.")
        return v

    recurrence: Recurrence | None = None
    waiting: Waiting | None = None
    remind_at: datetime | None = None


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

    @model_validator(mode="after")
    def no_null_required(self):
        for f in ("title", "notes", "labels", "checklist", "waiting", "kind"):
            if f in self.model_fields_set and getattr(self, f) is None:
                raise ValueError(f"{f} cannot be empty.")
        return self


class ProfilePatch(BaseModel):
    tz: str | None = Field(None, max_length=64)
    use_ai: bool | None = None


@dataclass
class Me:
    user: User
    items: ScopedCollection
    notes: ScopedCollection
    notifs: ScopedCollection
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
    return Me(user, p.col("personal_items"), p.col("personal_notes"), p.col("personal_notifications"), db, request.app.state.settings,
              doc.get("tz", "UTC"), doc.get("use_ai", True))


def item_view(doc: dict) -> dict:
    d = out(doc)
    for k in ("search_text", "fired_at", "nudge_fired_at", "next_id"):
        d.pop(k, None)
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
        except (ZoneInfoNotFoundError, ValueError, OSError):
            raise HTTPException(422, "Unknown time zone.")
    if changes:
        await remember_user(me.db, me.user)  # never leave a users doc without name, email and groups
        await me.db.users.update_one({"_id": me.user.sub}, {"$set": changes})
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
    if body.link:
        await require_task_access(me, body.link.workspace_id, body.link.task_id)
    fields = stored(body.model_dump(), me)
    t = now()
    doc = {"notes": "", "labels": [], "checklist": [], **{k: v for k, v in fields.items() if v is not None},
           "status": "open", "today_on": None, "promoted_to": None, "done_at": None, "updated_at": t}
    doc.update(fired_at=None, nudge_fired_at=None)
    for key in ("due_on", "recurrence", "waiting", "link", "remind_at"):
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
    if changes.get("kind") == "task" and item["kind"] == "waiting":
        changes["waiting"] = None
    if "remind_at" in changes:
        changes["fired_at"] = None
    if "waiting" in changes or changes.get("kind") == "task":
        changes["nudge_fired_at"] = None
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


PIN_LIMIT = 3


class Pin(BaseModel):
    on: bool


@router.post("/items/{item_id}/pin")
async def pin_item(item_id: str, body: Pin, me: Me = Depends(personal)):
    await load_item(me, item_id)
    today = me.today().isoformat()
    if body.on and await me.items.count({"status": "open", "today_on": today, "_id": {"$ne": item_id}}) >= PIN_LIMIT:
        raise HTTPException(409, "You can pin three things for today. Unpin one first.")
    # ponytail: count-then-set can let two simultaneous pins both land; a fourth pin is harmless, not data loss.
    return item_view(await me.items.update({"_id": item_id}, {"$set": {"today_on": today if body.on else None, "updated_at": now()}}))


@router.post("/items/{item_id}/complete")
async def complete_item(item_id: str, me: Me = Depends(personal)):
    await load_item(me, item_id)
    t = now()
    done = await me.items.update({"_id": item_id, "status": "open"}, {"$set": {"status": "done", "done_at": t, "updated_at": t}})
    if not done:
        raise HTTPException(409, "Already done.")
    nxt = None
    prior = done.get("next_id") and await me.items.find_one({"_id": done["next_id"], "status": "open"})
    if (rule := done.get("recurrence")) and not prior:
        due = date.fromisoformat(done["due_on"]) if done.get("due_on") else None
        nxt = await me.items.insert({
            **{k: done[k] for k in ("kind", "title", "notes", "labels", "recurrence", "waiting", "link")},
            "checklist": [{**c, "done": False} for c in done["checklist"]],
            "due_on": next_due(rule, due, me.today()).isoformat(),
            "status": "open", "today_on": None, "promoted_to": None, "done_at": None, "updated_at": t,
            "search_text": done.get("search_text", ""),
        })
        await me.items.update({"_id": item_id}, {"$set": {"next_id": nxt["_id"]}})
    return {"item": item_view(done), "next": item_view(nxt) if nxt else None}


@router.get("/today")
async def today_view(me: Me = Depends(personal)):
    today = me.today()
    d = today.isoformat()
    open_items = await me.items.find({"status": "open"}, sort=[("due_on", 1), ("created_at", 1)])
    rollover = [i for i in open_items if i.get("today_on") and i["today_on"] < d]
    pinned = [i for i in open_items if i.get("today_on") == d]
    due = [i for i in open_items if i["kind"] == "task" and i.get("due_on") and i["due_on"] <= d and not i.get("today_on")]
    followups = [i for i in open_items if i["kind"] == "waiting"
                 and date.fromisoformat(i["waiting"]["since"]) + timedelta(days=i["waiting"]["nudge_after_days"]) <= today]

    sent_back, approvals = [], []
    async for ws in me.db.workspaces.find({"archived": False}, sort=[("name", 1)]):
        _, perms = resolve_user(ws, me.user, me.settings)
        if not perms:
            continue
        tasks = Scoped(me.db, ws["_id"]).col("tasks")
        for t in await tasks.find({"author.sub": me.user.sub, "status": "changes_requested"}, sort=[("updated_at", -1)]):
            sent_back.append({"workspace_id": ws["_id"], "workspace_name": ws["name"],
                              "task": {"id": t["_id"], "number": t["number"], "title": t["title"]}})
        if "task.approve" in perms and (n := await tasks.count(queue_filter())):
            approvals.append({"workspace_id": ws["_id"], "workspace_name": ws["name"], "count": n})

    return {"date": d, "is_friday": today.weekday() == 4,
            "rollover": [item_view(i) for i in rollover], "pinned": [item_view(i) for i in pinned],
            "due": [item_view(i) for i in due], "followups": [item_view(i) for i in followups],
            "sent_back": sent_back, "approvals": approvals}


@router.get("/notifications")
async def list_notifications(unread: bool = False, limit: int = Query(50, ge=1, le=200), me: Me = Depends(personal)):
    f = {"read": False} if unread else {}
    return [out(n) for n in await me.notifs.find(f, sort=[("created_at", -1), ("_id", -1)], limit=limit)]


class MarkRead(BaseModel):
    ids: list[str] = []
    all: bool = False


@router.post("/notifications/read", status_code=204)
async def mark_notifications_read(body: MarkRead, me: Me = Depends(personal)):
    f: dict = {"read": False}
    if not body.all:
        f["_id"] = {"$in": body.ids}
    await me.notifs.update_many(f, {"$set": {"read": True}})
    return Response(status_code=204)


class NoteBody(BaseModel):
    text: str = Field(max_length=20000)


async def require_task_access(me: Me, workspace_id: str, task_id: str) -> None:
    """A private note hangs off a team task; you must still be able to open that task."""
    ws = await me.db.workspaces.find_one({"_id": workspace_id, "archived": False})
    if not ws or "task.view" not in resolve_user(ws, me.user, me.settings)[1] \
            or not await Scoped(me.db, workspace_id).col("tasks").find_one({"_id": task_id}):
        raise HTTPException(404, "Task not found.")


@router.get("/notes/{workspace_id}/{task_id}")
async def get_note(workspace_id: str, task_id: str, me: Me = Depends(personal)):
    await require_task_access(me, workspace_id, task_id)
    note = await me.notes.find_one({"workspace_id": workspace_id, "task_id": task_id})
    return {"text": note["text"], "updated_at": note["updated_at"]} if note else {"text": "", "updated_at": None}


@router.put("/notes/{workspace_id}/{task_id}")
async def put_note(workspace_id: str, task_id: str, body: NoteBody, me: Me = Depends(personal)):
    await require_task_access(me, workspace_id, task_id)
    note = await me.notes.upsert({"workspace_id": workspace_id, "task_id": task_id}, {"text": body.text, "updated_at": now()})
    return {"text": note["text"], "updated_at": note["updated_at"]}
