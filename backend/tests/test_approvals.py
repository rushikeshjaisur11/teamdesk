import asyncio
from datetime import UTC, datetime, timedelta

from tests.conftest import STORY, login, make_workspace, submitted

TECH_DEBT = {"type_key": "tech_debt", "title": "Bump deps",
             "fields": {"context": "c", "scope": "s", "acceptance": "a"}, "submit": True}


def decide(c, wid, tid, **body):
    return c.post(f"/api/w/{wid}/tasks/{tid}/decision", json=body)


async def test_approver_sees_queue_and_approves(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    assert (await c["appr"].get(f"/api/w/{wid}/approvals/count")).json() == {"count": 1}
    t = (await decide(c["appr"], wid, tid, action="approve")).json()
    assert t["status"] == "approved" and t["decision"]["by"] == {"sub": "appr", "name": "Appr"}
    assert (await c["appr"].get(f"/api/w/{wid}/approvals")).json() == []
    kinds = [a["kind"] for a in (await c["dev"].get(f"/api/w/{wid}/tasks/{tid}/activity")).json()]
    assert kinds[-1] == "decision"
    assert (await c["adm"].get(f"/api/w/{wid}/audit")).json()[0]["action"] == "task.approve"


async def test_queue_is_oldest_first(ws_with_dev):
    wid, c = ws_with_dev
    first, second = await submitted(c, wid), await submitted(c, wid)
    assert [t["id"] for t in (await c["appr"].get(f"/api/w/{wid}/approvals")).json()] == [first, second]


async def test_member_cannot_decide_or_see_queue(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    assert (await decide(c["dev"], wid, tid, action="approve")).status_code == 403
    assert (await c["dev"].get(f"/api/w/{wid}/approvals")).status_code == 403


async def test_self_approval_always_blocked(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid, who="appr")
    r = await decide(c["appr"], wid, tid, action="approve")
    assert r.status_code == 403 and r.json()["detail"] == "You can't approve your own task. Ask another approver."
    assert (await decide(c["adm"], wid, tid, action="approve")).status_code == 200


async def test_reject_and_request_changes_need_reason(ws_with_dev):
    wid, c = ws_with_dev
    a, b = await submitted(c, wid), await submitted(c, wid)
    r = await decide(c["appr"], wid, a, action="reject")
    assert r.status_code == 422 and r.json()["detail"] == "Please add a reason so the author knows what to change."
    assert (await decide(c["appr"], wid, b, action="request_changes", reason=" ")).status_code == 422
    assert (await decide(c["appr"], wid, a, action="reject", reason="out of scope")).json()["status"] == "rejected"
    t = (await decide(c["appr"], wid, b, action="request_changes", reason="add AC")).json()
    assert t["status"] == "changes_requested" and t["decision"]["reason"] == "add AC"


async def test_second_decision_conflicts(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    r1, r2 = await asyncio.gather(
        decide(c["appr"], wid, tid, action="approve"),
        decide(c["adm"], wid, tid, action="reject", reason="no"))
    assert sorted([r1.status_code, r2.status_code]) == [200, 409]
    loser = r1 if r1.status_code == 409 else r2
    assert loser.json()["detail"] == "This task was already decided by someone else. Refresh to see the latest."


async def test_unknown_action_is_422(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    assert (await decide(c["appr"], wid, tid, action="fly")).status_code == 422


async def test_duplicate_must_point_inside_workspace(ws_with_dev):
    wid, c = ws_with_dev
    orig, dup = await submitted(c, wid), await submitted(c, wid)
    assert (await decide(c["appr"], wid, dup, action="duplicate", duplicate_of="nope")).status_code == 422
    assert (await decide(c["appr"], wid, dup, action="duplicate", duplicate_of=dup)).status_code == 422
    t = (await decide(c["appr"], wid, dup, action="duplicate", duplicate_of=orig)).json()
    assert t["status"] == "duplicate" and t["duplicate_of"] == orig


async def test_snoozed_task_returns_to_queue_when_due(ws_with_dev, db):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    assert (await decide(c["appr"], wid, tid, action="snooze", until=past)).status_code == 422
    later = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
    assert (await decide(c["appr"], wid, tid, action="snooze", until=later)).json()["status"] == "snoozed"
    assert (await c["appr"].get(f"/api/w/{wid}/approvals/count")).json() == {"count": 0}
    await db.tasks.update_one({"_id": tid}, {"$set": {"snoozed_until": datetime.now(UTC) - timedelta(minutes=1)}})
    assert [t["id"] for t in (await c["appr"].get(f"/api/w/{wid}/approvals")).json()] == [tid]


async def test_bulk_approve_reports_failures(ws_with_dev):
    wid, c = ws_with_dev
    a, b = await submitted(c, wid), await submitted(c, wid)
    await decide(c["appr"], wid, b, action="reject", reason="no")
    r = (await c["appr"].post(f"/api/w/{wid}/approvals/bulk-approve", json={"task_ids": [a, b, "missing"]})).json()
    assert r["approved"] == [a]
    assert [f["id"] for f in r["failed"]] == [b, "missing"] and all(f["error"] for f in r["failed"])


async def test_auto_approve_rule_fires_on_submit(ws_with_dev):
    wid, c = ws_with_dev
    r = await c["adm"].post(f"/api/w/{wid}/rules", json={"name": "Dev tech debt", "enabled": True,
                                                          "type_keys": ["tech_debt"], "author_roles": ["member"], "labels_any": []})
    assert r.status_code == 201
    t = (await c["dev"].post(f"/api/w/{wid}/tasks", json=TECH_DEBT)).json()
    assert t["status"] == "approved" and t["decision"]["by"] == {"sub": "rule", "name": "Dev tech debt"}
    assert (await c["adm"].get(f"/api/w/{wid}/audit")).json()[0]["action"] == "rule.fired"
    kinds = [a["kind"] for a in (await c["dev"].get(f"/api/w/{wid}/tasks/{t['id']}/activity")).json()]
    assert kinds == ["created", "auto_approved"]
    story = (await c["dev"].post(f"/api/w/{wid}/tasks", json={**STORY, "submit": True})).json()
    assert story["status"] == "pending_approval"


async def test_rules_crud_and_validation(ws_with_dev):
    wid, c = ws_with_dev
    empty = {"name": "x", "enabled": True, "type_keys": [], "author_roles": [], "labels_any": []}
    r = await c["adm"].post(f"/api/w/{wid}/rules", json=empty)
    assert r.status_code == 422 and r.json()["detail"] == "A rule needs at least one condition."
    rule = (await c["adm"].post(f"/api/w/{wid}/rules", json={**empty, "labels_any": ["deps"]})).json()
    upd = (await c["adm"].put(f"/api/w/{wid}/rules/{rule['id']}", json={**empty, "labels_any": ["deps"], "enabled": False})).json()
    assert upd["enabled"] is False
    assert [x["id"] for x in (await c["adm"].get(f"/api/w/{wid}/rules")).json()] == [rule["id"]]
    assert (await c["adm"].delete(f"/api/w/{wid}/rules/{rule['id']}")).status_code == 204
    assert (await c["dev"].get(f"/api/w/{wid}/rules")).status_code == 403


async def test_new_workspace_lets_developer_tasks_skip_the_queue(make_client):
    wid = await make_workspace(make_client)
    a = await make_client(); await login(a, "adm", ["g-admin"])
    await a.put(f"/api/w/{wid}/group-mappings", json=[{"group": "g-admin", "role": "admin"}, {"group": "g-dev", "role": "member"}])
    d = await make_client(); await login(d, "dev", ["g-dev"])
    t = (await d.post(f"/api/w/{wid}/tasks", json={**STORY, "submit": True})).json()
    assert t["status"] == "approved"
    assert t["decision"]["by"] == {"sub": "rule", "name": "Developer tasks skip the queue"}


async def test_new_workspace_lets_tech_tasks_skip_the_queue(make_client):
    wid = await make_workspace(make_client)
    a = await make_client(); await login(a, "adm", ["g-admin"])
    await a.put(f"/api/w/{wid}/group-mappings", json=[{"group": "g-admin", "role": "admin"}, {"group": "g-appr", "role": "approver"}])
    p = await make_client(); await login(p, "appr", ["g-appr"])
    t = (await p.post(f"/api/w/{wid}/tasks", json=TECH_DEBT)).json()
    assert t["status"] == "approved"
    assert t["decision"]["by"] == {"sub": "rule", "name": "Tech tasks skip the queue"}
