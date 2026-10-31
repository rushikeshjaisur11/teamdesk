from datetime import date, timedelta

from tests.conftest import STORY, submitted


async def add(c, **body):
    r = await c.post("/api/me/items", json={"kind": "task", **body})
    assert r.status_code == 201, r.text
    return r.json()


async def test_today_sections(ws_with_dev, db):
    wid, c = ws_with_dev
    today = date.today()
    roll = await add(c["dev"], title="from yesterday")
    await db.personal_items.update_one({"_id": roll["id"]}, {"$set": {"today_on": (today - timedelta(days=1)).isoformat()}})
    pinned = await add(c["dev"], title="pinned")
    await c["dev"].post(f"/api/me/items/{pinned['id']}/pin", json={"on": True})
    await add(c["dev"], title="overdue", due_on=(today - timedelta(days=2)).isoformat())
    await add(c["dev"], title="due today", due_on=today.isoformat())
    await add(c["dev"], title="later", due_on=(today + timedelta(days=3)).isoformat())
    await add(c["dev"], kind="waiting", title="cost numbers",
              waiting={"who": "Priya", "since": (today - timedelta(days=5)).isoformat(), "nudge_after_days": 3})
    await add(c["dev"], kind="waiting", title="fresh wait", waiting={"who": "Dan"})
    t = (await c["dev"].get("/api/me/today")).json()
    titles = lambda k: [i["title"] for i in t[k]]
    assert t["date"] == today.isoformat()
    assert titles("rollover") == ["from yesterday"]
    assert titles("pinned") == ["pinned"]
    assert titles("due") == ["overdue", "due today"]
    assert titles("followups") == ["cost numbers"]


async def test_sent_back_respects_access(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    await c["appr"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "request_changes", "reason": "add AC"})
    sent = (await c["dev"].get("/api/me/today")).json()["sent_back"]
    assert sent == [{"workspace_id": wid, "workspace_name": "Team", "task": {"id": tid, "number": 1, "title": STORY["title"]}}]
    await c["adm"].put(f"/api/w/{wid}/group-mappings", json=[{"group": "g-admin", "role": "admin"}])
    r = await c["dev"].get("/api/me/today")
    assert r.status_code == 200 and r.json()["sent_back"] == []


async def test_approval_counts_only_for_approvers(ws_with_dev):
    wid, c = ws_with_dev
    await submitted(c, wid)
    assert (await c["appr"].get("/api/me/today")).json()["approvals"] == [{"workspace_id": wid, "workspace_name": "Team", "count": 1}]
    assert (await c["dev"].get("/api/me/today")).json()["approvals"] == []


async def test_today_is_private(ws_with_dev):
    wid, c = ws_with_dev
    p = await add(c["dev"], title="mine", due_on=date.today().isoformat())
    await c["dev"].post(f"/api/me/items/{p['id']}/pin", json={"on": True})
    t = (await c["adm"].get("/api/me/today")).json()
    assert t["pinned"] == [] and t["due"] == []
