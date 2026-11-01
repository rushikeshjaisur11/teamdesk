from datetime import date, timedelta

from tests.conftest import STORY, login

TODAY = date.today()
AWAY = {"from": (TODAY - timedelta(days=1)).isoformat(), "to": (TODAY + timedelta(days=3)).isoformat()}


async def approval_recipients(db, wid) -> set[str]:
    return {n["user_sub"] async for n in db.notifications.find({"workspace_id": wid, "kind": "approval_needed"})}


async def add_second_approver(make_client):
    c = await make_client()
    await login(c, "appr2", ["g-appr"], name="Second Approver")
    return c


async def test_away_approver_requests_go_to_backup(ws_with_dev, make_client, db):
    wid, c = ws_with_dev
    await add_second_approver(make_client)
    backups = (await c["appr"].get("/api/me/away/backups")).json()
    assert "appr2" in [b["sub"] for b in backups] and "dev" not in [b["sub"] for b in backups]
    r = await c["appr"].put("/api/me/away", json={**AWAY, "backup_sub": "appr2", "note": "Leave"})
    assert r.status_code == 200 and r.json()["backup_name"] == "Second Approver"
    await c["dev"].post(f"/api/w/{wid}/tasks", json={**STORY, "submit": True})
    recipients = await approval_recipients(db, wid)
    assert "appr" not in recipients and "appr2" in recipients and "adm" in recipients  # admins approve too
    members = {m["sub"]: m for m in (await c["dev"].get(f"/api/w/{wid}/members")).json()}
    assert members["appr"]["away_until"] == AWAY["to"] and members["adm"]["away_until"] is None


async def test_nobody_left_means_everyone_is_asked(ws_with_dev, db):
    wid, c = ws_with_dev
    await c["appr"].put("/api/me/away", json=AWAY)
    await c["adm"].put("/api/me/away", json=AWAY)
    await c["dev"].post(f"/api/w/{wid}/tasks", json={**STORY, "submit": True})
    assert await approval_recipients(db, wid) >= {"appr", "adm"}


async def test_future_or_ended_away_changes_nothing(ws_with_dev, db):
    wid, c = ws_with_dev
    later = {"from": (TODAY + timedelta(days=5)).isoformat(), "to": (TODAY + timedelta(days=9)).isoformat()}
    await c["appr"].put("/api/me/away", json=later)
    assert (await c["appr"].get("/api/me/away")).json()["from"] == later["from"]
    await c["dev"].post(f"/api/w/{wid}/tasks", json={**STORY, "submit": True})
    assert "appr" in await approval_recipients(db, wid)
    assert (await c["appr"].delete("/api/me/away")).status_code == 204
    assert (await c["appr"].get("/api/me/away")).json() is None


async def test_away_validation(ws_with_dev):
    wid, c = ws_with_dev
    assert (await c["appr"].put("/api/me/away", json={"from": "2026-11-05", "to": "2026-11-01"})).status_code == 422
    assert (await c["appr"].put("/api/me/away", json={**AWAY, "backup_sub": "appr"})).status_code == 422
    assert (await c["appr"].put("/api/me/away", json={**AWAY, "backup_sub": "ghost"})).status_code == 422
