from tests.conftest import submitted


async def test_checklist_rejects_duplicate_ids(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    dup = [{"id": "a", "text": "one", "done": False}, {"id": "a", "text": "two", "done": False}]
    r = await c["dev"].put(f"/api/w/{wid}/tasks/{tid}/checklist", json=dup)
    assert r.status_code == 422 and r.json()["detail"] == "Each step needs its own id."


async def test_reminder_linked_to_team_task(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    r = await c["dev"].post("/api/me/items", json={"kind": "task", "title": "Follow up on #1",
                                                   "link": {"workspace_id": wid, "task_id": tid}, "remind_at": "2030-01-01T09:00:00Z"})
    assert r.status_code == 201 and r.json()["link"] == {"workspace_id": wid, "task_id": tid}


async def test_link_to_task_you_cannot_open_is_refused(ws_with_dev, make_client):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    from tests.conftest import login
    stranger = await make_client(); await login(stranger, "zed", ["g-other"])
    r = await stranger.post("/api/me/items", json={"kind": "task", "title": "peek", "link": {"workspace_id": wid, "task_id": tid}})
    assert r.status_code == 404
    r = await c["dev"].post("/api/me/items", json={"kind": "task", "title": "x", "link": {"workspace_id": wid, "task_id": "nope"}})
    assert r.status_code == 404
