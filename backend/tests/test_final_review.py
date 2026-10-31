import pytest
from datetime import date, timedelta

from tests.conftest import STORY


async def test_profile_patch_does_not_break_members_or_submit(ws_with_dev, db):
    wid, c = ws_with_dev
    await db.users.insert_one({"_id": "ghost", "tz": "UTC"})  # what a profile PATCH before sign-in leaves behind
    assert (await c["adm"].get(f"/api/w/{wid}/members")).status_code == 200
    r = await c["dev"].post(f"/api/w/{wid}/tasks", json={**STORY, "submit": True})
    assert r.status_code == 201, r.text


async def test_profile_patch_creates_no_partial_user(ws_with_dev, db):
    wid, c = ws_with_dev
    await db.users.delete_many({"_id": "dev"})
    assert (await c["dev"].patch("/api/me/profile", json={"tz": "Asia/Kolkata"})).status_code == 200
    u = await db.users.find_one({"_id": "dev"})
    assert u["groups"] == ["g-dev"] and u["tz"] == "Asia/Kolkata"


@pytest.mark.parametrize("tz", ["America", "Etc", "../x", ""])
async def test_bad_time_zone_is_422(ws_with_dev, tz):
    wid, c = ws_with_dev
    assert (await c["dev"].patch("/api/me/profile", json={"tz": tz})).status_code == 422


@pytest.mark.parametrize("field", ["title", "notes", "labels", "checklist", "waiting", "kind"])
async def test_patch_null_on_required_field_is_422(ws_with_dev, field):
    wid, c = ws_with_dev
    r = await c["dev"].post("/api/me/items", json={"kind": "waiting", "title": "w", "waiting": {"who": "Dan"}})
    assert (await c["dev"].patch(f"/api/me/items/{r.json()['id']}", json={field: None})).status_code == 422
    assert (await c["dev"].get("/api/me/today")).status_code == 200


async def test_kind_change_drops_waiting(ws_with_dev):
    wid, c = ws_with_dev
    r = await c["dev"].post("/api/me/items", json={"kind": "waiting", "title": "w", "waiting": {"who": "Dan"}})
    p = await c["dev"].patch(f"/api/me/items/{r.json()['id']}", json={"kind": "task"})
    assert p.status_code == 200 and p.json()["waiting"] is None
    assert (await c["dev"].get("/api/me/today")).status_code == 200


async def test_rollover_item_not_also_due(ws_with_dev, db):
    wid, c = ws_with_dev
    past = (date.today() - timedelta(days=2)).isoformat()
    r = await c["dev"].post("/api/me/items", json={"kind": "task", "title": "t", "due_on": past})
    await db.personal_items.update_one({"_id": r.json()["id"]}, {"$set": {"today_on": past}})
    t = (await c["dev"].get("/api/me/today")).json()
    assert [i["title"] for i in t["rollover"]] == ["t"] and t["due"] == []


async def test_reopen_recurring_does_not_duplicate_next(ws_with_dev):
    wid, c = ws_with_dev
    r = await c["dev"].post("/api/me/items", json={"kind": "task", "title": "daily", "recurrence": {"freq": "daily"}})
    iid = r.json()["id"]
    await c["dev"].post(f"/api/me/items/{iid}/complete")
    await c["dev"].post(f"/api/me/items/{iid}/reopen")
    await c["dev"].post(f"/api/me/items/{iid}/complete")
    open_ = [i for i in (await c["dev"].get("/api/me/items")).json() if i["title"] == "daily" and i["id"] != iid]
    assert len(open_) == 1


async def test_checklist_duplicate_ids_422(ws_with_dev):
    wid, c = ws_with_dev
    r = await c["dev"].post("/api/me/items", json={"kind": "task", "title": "x",
        "checklist": [{"id": "a", "text": "1"}, {"id": "a", "text": "2"}]})
    assert r.status_code == 422
