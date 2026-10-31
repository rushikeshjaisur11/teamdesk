from tests.conftest import submitted

CL = [{"id": "a", "text": "Write the retry", "done": True}, {"id": "b", "text": "Add the test", "done": False}]


async def test_author_updates_checklist_after_approval(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    await c["appr"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "approve"})
    r = await c["dev"].put(f"/api/w/{wid}/tasks/{tid}/checklist", json=CL)
    assert r.status_code == 200 and r.json()["checklist"] == CL
    acts = (await c["dev"].get(f"/api/w/{wid}/tasks/{tid}/activity")).json()
    assert acts[-1]["kind"] == "checklist" and acts[-1]["data"] == {"done": 1, "total": 2}


async def test_checklist_does_not_invalidate_open_approval(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    seen = (await c["appr"].get(f"/api/w/{wid}/tasks/{tid}")).json()["updated_at"]
    await c["dev"].put(f"/api/w/{wid}/tasks/{tid}/checklist", json=CL)
    r = await c["appr"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "approve", "seen_updated_at": seen})
    assert r.status_code == 200


async def test_closed_task_checklist_409(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    await c["appr"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "reject", "reason": "no"})
    r = await c["dev"].put(f"/api/w/{wid}/tasks/{tid}/checklist", json=CL)
    assert r.status_code == 409 and r.json()["detail"] == "This task is closed."


async def test_other_member_cannot_edit_checklist(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    assert (await c["appr"].put(f"/api/w/{wid}/tasks/{tid}/checklist", json=CL)).status_code == 403
    assert (await c["adm"].put(f"/api/w/{wid}/tasks/{tid}/checklist", json=CL)).status_code == 200


async def test_checklist_limits(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    many = [{"id": str(i), "text": "x", "done": False} for i in range(51)]
    assert (await c["dev"].put(f"/api/w/{wid}/tasks/{tid}/checklist", json=many)).status_code == 422
