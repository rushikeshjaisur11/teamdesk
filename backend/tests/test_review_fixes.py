import pytest
from pydantic import ValidationError

from app.config import Settings
from app.notifications import email_subject
from tests.conftest import STORY, submitted


async def test_failed_submit_creates_no_draft(ws_with_dev, db):
    wid, c = ws_with_dev
    r = await c["dev"].post(f"/api/w/{wid}/tasks", json={**STORY, "fields": {"context": "x"}, "submit": True})
    assert r.status_code == 422
    assert await db.tasks.count_documents({"workspace_id": wid}) == 0


async def test_approver_cannot_approve_text_they_edited(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    assert (await c["adm"].patch(f"/api/w/{wid}/tasks/{tid}", json={"title": "Rewritten by admin"})).status_code == 200
    r = await c["adm"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "approve"})
    assert r.status_code == 403 and "you edited" in r.json()["detail"].lower()
    assert (await c["appr"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "approve"})).status_code == 200


async def test_decision_on_stale_version_is_409(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    seen = (await c["appr"].get(f"/api/w/{wid}/tasks/{tid}")).json()["updated_at"]
    await c["dev"].patch(f"/api/w/{wid}/tasks/{tid}", json={"title": "Changed after the approver opened it"})
    r = await c["appr"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "approve", "seen_updated_at": seen})
    assert r.status_code == 409 and "changed since you opened it" in r.json()["detail"]


async def test_decision_with_current_version_succeeds(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    seen = (await c["appr"].get(f"/api/w/{wid}/tasks/{tid}")).json()["updated_at"]
    r = await c["appr"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "approve", "seen_updated_at": seen})
    assert r.status_code == 200


def test_email_subject_is_one_short_line():
    assert email_subject("#3 was rejected by Asha: first line\nsecond line") == "#3 was rejected by Asha: first line"
    assert len(email_subject("x" * 500)) == 150


async def test_state_changing_request_without_app_header_is_refused(app):
    import httpx
    from httpx import ASGITransport
    bare = httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t")
    r = await bare.post("/api/auth/logout")
    assert r.status_code == 403
    assert (await bare.get("/api/health")).status_code == 200


def test_session_secret_must_be_long():
    with pytest.raises(ValidationError):
        Settings(session_secret="replace-me")
