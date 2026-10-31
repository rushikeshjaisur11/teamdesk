from tests.conftest import OWNER, login


async def test_remind_at_stored_and_reset_on_change(ws_with_dev, db):
    wid, c = ws_with_dev
    r = await c["dev"].post("/api/me/items", json={"kind": "task", "title": "call", "remind_at": "2026-11-03T09:00:00Z"})
    assert r.status_code == 201 and r.json()["remind_at"].startswith("2026-11-03T09:00")
    iid = r.json()["id"]
    await db.personal_items.update_one({"_id": iid}, {"$set": {"fired_at": "x"}})
    p = await c["dev"].patch(f"/api/me/items/{iid}", json={"remind_at": "2026-11-04T09:00:00Z"})
    assert p.status_code == 200
    assert (await db.personal_items.find_one({"_id": iid}))["fired_at"] is None
    assert "fired_at" not in p.json()


async def test_personal_notifications_are_private(ws_with_dev, make_client, db):
    wid, c = ws_with_dev
    await db.personal_notifications.insert_one({"_id": "n1", "owner_sub": "dev", "kind": "reminder", "text": "Call",
                                                "item_id": None, "read": False, "created_at": __import__("datetime").datetime.now(__import__("datetime").UTC)})
    got = (await c["dev"].get("/api/me/notifications")).json()
    assert [n["text"] for n in got] == ["Call"] and "owner_sub" not in got[0]
    owner = await make_client(); await login(owner, "own", OWNER + ["g-admin"])
    for who in (c["adm"], owner):
        assert (await who.get("/api/me/notifications")).json() == []
        await who.post("/api/me/notifications/read", json={"all": True})
    assert (await c["dev"].get("/api/me/notifications?unread=true")).json() != []
    assert (await c["dev"].post("/api/me/notifications/read", json={"ids": ["n1"]})).status_code == 204
    assert (await c["dev"].get("/api/me/notifications?unread=true")).json() == []
