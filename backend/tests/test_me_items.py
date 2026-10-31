from datetime import datetime
from zoneinfo import ZoneInfo

from tests.conftest import OWNER, STORY, login


async def test_items_crud_and_privacy(ws_with_dev, make_client):
    wid, c = ws_with_dev
    r = await c["dev"].post("/api/me/items", json={"kind": "task", "title": "Ring the vendor", "due_on": "2026-11-03"})
    assert r.status_code == 201
    item = r.json()
    assert "owner_sub" not in item and item["status"] == "open"
    assert [i["title"] for i in (await c["dev"].get("/api/me/items")).json()] == ["Ring the vendor"]
    owner = await make_client(); await login(owner, "own", OWNER + ["g-admin"])
    for who in (c["adm"], owner):
        assert (await who.get("/api/me/items")).json() == []
        assert (await who.patch(f"/api/me/items/{item['id']}", json={"title": "x"})).status_code == 404
        assert (await who.delete(f"/api/me/items/{item['id']}")).status_code == 404
        assert (await who.post(f"/api/me/items/{item['id']}/drop")).status_code == 404
    upd = (await c["dev"].patch(f"/api/me/items/{item['id']}", json={"title": "Call the vendor", "labels": ["vendor"]})).json()
    assert upd["title"] == "Call the vendor"
    assert (await c["dev"].post(f"/api/me/items/{item['id']}/drop")).json()["status"] == "dropped"
    assert (await c["dev"].post(f"/api/me/items/{item['id']}/reopen")).json()["status"] == "open"
    assert (await c["dev"].delete(f"/api/me/items/{item['id']}")).status_code == 204
    assert (await c["dev"].get("/api/me/items")).json() == []


async def test_waiting_item_needs_who_and_defaults_since(ws_with_dev):
    wid, c = ws_with_dev
    assert (await c["dev"].post("/api/me/items", json={"kind": "waiting", "title": "Cost numbers"})).status_code == 422
    await c["dev"].patch("/api/me/profile", json={"tz": "Asia/Kolkata"})
    w = (await c["dev"].post("/api/me/items", json={"kind": "waiting", "title": "Cost numbers",
                                                    "waiting": {"who": "Priya", "nudge_after_days": 3}})).json()
    assert w["waiting"]["since"] == datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()


async def test_recurrence_only_on_tasks(ws_with_dev):
    wid, c = ws_with_dev
    r = await c["dev"].post("/api/me/items", json={"kind": "idea", "title": "x", "recurrence": {"freq": "daily"}})
    assert r.status_code == 422
    bad = await c["dev"].post("/api/me/items", json={"kind": "task", "title": "x", "recurrence": {"freq": "weekly", "days": []}})
    assert bad.status_code == 422


async def test_limits(ws_with_dev):
    wid, c = ws_with_dev
    assert (await c["dev"].post("/api/me/items", json={"kind": "task", "title": "x" * 501})).status_code == 422
    many = [{"id": str(i), "text": "step", "done": False} for i in range(51)]
    assert (await c["dev"].post("/api/me/items", json={"kind": "task", "title": "x", "checklist": many})).status_code == 422
    assert (await c["dev"].post("/api/me/items", json={"kind": "task", "title": "x", "due_on": "next tuesday"})).status_code == 422


async def test_profile_tz_and_ai_switch(ws_with_dev):
    wid, c = ws_with_dev
    p = (await c["dev"].get("/api/me/profile")).json()
    assert (p["tz"], p["use_ai"]) == ("UTC", True)
    assert (await c["dev"].patch("/api/me/profile", json={"tz": "Mars/Base"})).status_code == 422
    p = (await c["dev"].patch("/api/me/profile", json={"tz": "Asia/Kolkata", "use_ai": False})).json()
    assert (p["tz"], p["use_ai"]) == ("Asia/Kolkata", False)


async def test_promote_idea_to_team_task(ws_with_dev):
    wid, c = ws_with_dev
    idea = (await c["dev"].post("/api/me/items", json={"kind": "idea", "title": "cache schema lookups"})).json()
    t = (await c["dev"].post(f"/api/w/{wid}/tasks", json={**STORY, "from_item_id": idea["id"]})).json()
    got = (await c["dev"].get("/api/me/items", params={"status": "done"})).json()[0]
    assert got["promoted_to"] == {"workspace_id": wid, "task_id": t["id"]}


async def test_cannot_promote_someone_elses_item(ws_with_dev):
    wid, c = ws_with_dev
    idea = (await c["dev"].post("/api/me/items", json={"kind": "idea", "title": "mine"})).json()
    assert (await c["adm"].post(f"/api/w/{wid}/tasks", json={**STORY, "from_item_id": idea["id"]})).status_code == 201
    assert (await c["dev"].get("/api/me/items")).json()[0]["promoted_to"] is None


async def test_search_is_owner_only(ws_with_dev):
    wid, c = ws_with_dev
    await c["dev"].post("/api/me/items", json={"kind": "task", "title": "Ring the vendor"})
    await c["adm"].post("/api/me/items", json={"kind": "task", "title": "Vendor contract review"})
    assert [i["title"] for i in (await c["dev"].get("/api/me/items", params={"q": "vendor"})).json()] == ["Ring the vendor"]


async def test_workspace_ideas_route_is_gone(ws_with_dev):
    wid, c = ws_with_dev
    assert (await c["dev"].get(f"/api/w/{wid}/ideas")).status_code == 404


async def test_fourth_pin_refused_and_old_pins_dont_count(ws_with_dev, db):
    wid, c = ws_with_dev
    ids = [(await c["dev"].post("/api/me/items", json={"kind": "task", "title": f"t{i}"})).json()["id"] for i in range(5)]
    await db.personal_items.update_one({"_id": ids[4]}, {"$set": {"today_on": "2020-01-01"}})
    for i in ids[:3]:
        r = await c["dev"].post(f"/api/me/items/{i}/pin", json={"on": True})
        assert r.status_code == 200 and r.json()["today_on"]
    r = await c["dev"].post(f"/api/me/items/{ids[3]}/pin", json={"on": True})
    assert r.status_code == 409 and "three things" in r.json()["detail"]
    assert (await c["dev"].post(f"/api/me/items/{ids[0]}/pin", json={"on": False})).json()["today_on"] is None
    assert (await c["dev"].post(f"/api/me/items/{ids[3]}/pin", json={"on": True})).status_code == 200


async def test_completing_recurring_task_once_creates_one_next(ws_with_dev):
    import asyncio
    wid, c = ws_with_dev
    it = (await c["dev"].post("/api/me/items", json={"kind": "task", "title": "Status report", "due_on": "2026-10-30",
          "recurrence": {"freq": "weekly", "days": [4]}, "checklist": [{"id": "a", "text": "draft", "done": True}]})).json()
    r1, r2 = await asyncio.gather(c["dev"].post(f"/api/me/items/{it['id']}/complete"),
                                  c["dev"].post(f"/api/me/items/{it['id']}/complete"))
    assert sorted([r1.status_code, r2.status_code]) == [200, 409]
    body = (r1 if r1.status_code == 200 else r2).json()
    assert body["item"]["status"] == "done"
    nxt = body["next"]
    assert nxt["checklist"][0]["done"] is False and nxt["recurrence"] == {"freq": "weekly", "days": [4], "day": None}
    assert nxt["due_on"] > "2026-10-30" and nxt["today_on"] is None
    assert [i["id"] for i in (await c["dev"].get("/api/me/items")).json()] == [nxt["id"]]


async def test_completing_plain_task_has_no_next(ws_with_dev):
    wid, c = ws_with_dev
    it = (await c["dev"].post("/api/me/items", json={"kind": "task", "title": "once"})).json()
    assert (await c["dev"].post(f"/api/me/items/{it['id']}/complete")).json()["next"] is None
