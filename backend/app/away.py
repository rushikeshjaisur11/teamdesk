"""Out of office: a person sets away dates and a backup. While they're away, approval requests go to the backup
(if the backup can approve in that workspace) instead of them, teammates see "Away until …", and their 9:00
Teams summary pauses. No permission is ever lent: the backup must already be an approver there."""
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, model_validator

from app.access import resolve
from app.my_time import today_for
from app.me import Me, personal

router = APIRouter(prefix="/api/me/away")


def away_now(user: dict, at: datetime) -> dict | None:
    """The person's away record if today (in their time zone) falls inside it."""
    a = user.get("away")
    if not a:
        return None
    today = today_for(user.get("tz", "UTC"), at).isoformat()
    return a if a["from"] <= today <= a["to"] else None


def route_approvers(users: list[dict], workspace: dict, at: datetime) -> list[str]:
    """Approvers for a workspace, with each away approver replaced by their backup when the backup can approve here.
    If that leaves nobody, everyone who can approve is told, so a request is never lost."""
    approvers = {u["_id"]: u for u in users if "task.approve" in resolve(workspace, u.get("groups", []))[1]}
    routed: list[str] = []
    for sub, u in approvers.items():
        a = away_now(u, at)
        if not a:
            routed.append(sub)
        elif a.get("backup_sub") in approvers and not away_now(approvers[a["backup_sub"]], at):
            routed.append(a["backup_sub"])
    return list(dict.fromkeys(routed)) or list(approvers)


class Away(BaseModel):
    from_: date = Field(alias="from")
    to: date
    backup_sub: str | None = Field(None, max_length=200)
    note: str = Field("", max_length=200)

    @model_validator(mode="after")
    def order(self):
        if self.to < self.from_:
            raise ValueError("The last day can't be before the first day.")
        return self


@router.get("")
async def get_away(me: Me = Depends(personal)):
    return ((await me.db.users.find_one({"_id": me.user.sub})) or {}).get("away")


@router.put("")
async def put_away(body: Away, me: Me = Depends(personal)):
    if body.backup_sub == me.user.sub:
        raise HTTPException(422, "Choose someone else as your backup.")
    backup = body.backup_sub and await me.db.users.find_one({"_id": body.backup_sub})
    if body.backup_sub and not backup:
        raise HTTPException(422, "That backup isn't a TeamDesk user.")
    away = {"from": body.from_.isoformat(), "to": body.to.isoformat(), "backup_sub": body.backup_sub,
            "backup_name": backup.get("name", "") if backup else "", "note": body.note.strip()}
    await me.db.users.update_one({"_id": me.user.sub}, {"$set": {"away": away}})
    return away


@router.delete("", status_code=204)
async def end_away(me: Me = Depends(personal)):
    await me.db.users.update_one({"_id": me.user.sub}, {"$unset": {"away": ""}})
    return Response(status_code=204)


@router.get("/backups")
async def backups(me: Me = Depends(personal)):
    """People who can approve in at least one workspace you can approve in: the useful backups."""
    mine = [ws async for ws in me.db.workspaces.find({"archived": False}) if "task.approve" in resolve(ws, me.user.groups)[1]]
    found = {}
    async for u in me.db.users.find({"_id": {"$ne": me.user.sub}}, sort=[("name", 1)]):
        shared = [ws["name"] for ws in mine if "task.approve" in resolve(ws, u.get("groups", []))[1]]
        if shared:
            found[u["_id"]] = {"sub": u["_id"], "name": u.get("name", ""), "workspaces": shared}
    return list(found.values())
