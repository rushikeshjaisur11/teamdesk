import json
from datetime import datetime, timezone

import httpx

from app import jira, teams
from app.worker import run_once
from tests.conftest import STORY, login

JIRA = {"kind": "cloud", "base_url": "https://acme.atlassian.net", "email": "bot@acme.test", "token": "secret-token", "project_key": "DATA"}
HOOK = "https://prod-01.westus.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=xyz"


def fake_jira(calls: list):
    def handle(req: httpx.Request) -> httpx.Response:
        calls.append(req)
        if req.url.path == "/rest/api/2/myself":
            return httpx.Response(200, json={"displayName": "Bot"})
        if req.url.path == "/rest/api/2/project/DATA":
            return httpx.Response(200, json={"name": "Data"})
        if req.url.path == "/rest/api/2/issue":
            return httpx.Response(201, json={"key": "DATA-7"})
        return httpx.Response(404)
    return httpx.MockTransport(handle)


async def test_jira_connection_never_returns_token(ws_with_dev, db, monkeypatch):
    wid, c = ws_with_dev
    calls = []
    monkeypatch.setattr(jira, "TRANSPORT", fake_jira(calls))
    assert (await c["dev"].put(f"/api/w/{wid}/connections/jira", json=JIRA)).status_code == 403
    r = await c["adm"].put(f"/api/w/{wid}/connections/jira", json=JIRA)
    assert r.status_code == 200 and "token" not in r.json() and r.json()["has_token"]
    assert "secret-token" not in json.dumps((await db.workspaces.find_one({"_id": wid}))["jira"])
    t = (await c["adm"].post(f"/api/w/{wid}/connections/jira/test")).json()
    assert t == {"ok": True, "message": "Connected as Bot to Data."}
    assert calls[0].headers["authorization"].startswith("Basic ")
    me = (await c["dev"].get("/api/auth/me")).json()
    assert me["workspaces"][0]["jira_connected"] is True


async def test_create_jira_once_from_approved_task(ws_with_dev, monkeypatch):
    wid, c = ws_with_dev
    calls = []
    monkeypatch.setattr(jira, "TRANSPORT", fake_jira(calls))
    await c["adm"].put(f"/api/w/{wid}/connections/jira", json=JIRA)
    tid = (await c["dev"].post(f"/api/w/{wid}/tasks", json=STORY)).json()["id"]
    assert (await c["dev"].post(f"/api/w/{wid}/tasks/{tid}/jira")).status_code == 409  # still a draft
    await c["dev"].post(f"/api/w/{wid}/tasks/{tid}/submit")
    await c["appr"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "approve"})
    r = await c["dev"].post(f"/api/w/{wid}/tasks/{tid}/jira")
    assert r.status_code == 200 and r.json()["jira_key"] == "DATA-7" and r.json()["status"] == "in_jira"
    sent = json.loads(calls[-1].content)["fields"]
    assert sent["project"] == {"key": "DATA"} and sent["issuetype"] == {"name": "Story"} and "h3. Context" in sent["description"]
    assert (await c["dev"].post(f"/api/w/{wid}/tasks/{tid}/jira")).status_code == 409  # never twice


async def test_jira_failure_is_explained_and_retryable(ws_with_dev, monkeypatch):
    wid, c = ws_with_dev
    await c["adm"].put(f"/api/w/{wid}/connections/jira", json=JIRA)
    monkeypatch.setattr(jira, "TRANSPORT", httpx.MockTransport(
        lambda req: httpx.Response(400, json={"errors": {"issuetype": "not valid"}})))
    tid = (await c["dev"].post(f"/api/w/{wid}/tasks", json=STORY)).json()["id"]
    await c["dev"].post(f"/api/w/{wid}/tasks/{tid}/submit")
    await c["appr"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "approve"})
    r = await c["dev"].post(f"/api/w/{wid}/tasks/{tid}/jira")
    assert r.status_code == 502 and r.json()["detail"] == "Jira said: issuetype: not valid"
    task = (await c["dev"].get(f"/api/w/{wid}/tasks/{tid}")).json()
    assert task["status"] == "jira_failed"
    monkeypatch.setattr(jira, "TRANSPORT", fake_jira([]))
    assert (await c["dev"].post(f"/api/w/{wid}/tasks/{tid}/jira")).json()["jira_key"] == "DATA-7"


async def test_teams_link_only_microsoft_hosts(make_client, db):
    c = await make_client(); await login(c, "asha", [])
    r = await c.put("/api/me/teams", json={"url": "https://169.254.169.254/latest"})
    assert r.status_code == 422
    assert (await c.put("/api/me/teams", json={"url": HOOK})).json() == {"connected": True}
    assert "sig=xyz" not in (await db.users.find_one({"_id": "asha"}))["teams_webhook"]


async def test_reminder_and_digest_reach_teams(make_client, db, settings, monkeypatch):
    sent = []
    monkeypatch.setattr(teams, "TRANSPORT", httpx.MockTransport(lambda req: sent.append(json.loads(req.content)) or httpx.Response(202)))
    c = await make_client(); await login(c, "asha", [])
    await c.put("/api/me/teams", json={"url": HOOK})
    await c.post("/api/me/items", json={"kind": "task", "title": "Ship the loader", "due_on": "2026-11-02",
                                        "remind_at": "2026-11-02T03:00:00Z"})
    await run_once(db, settings, datetime(2026, 11, 2, 9, 30, tzinfo=timezone.utc))
    texts = [b["text"] for m in sent for b in m["attachments"][0]["content"]["body"]]
    assert "Reminder: Ship the loader" in texts and "Your day: 1 task" in texts and "- Ship the loader" in texts
    n = len(sent)
    await run_once(db, settings, datetime(2026, 11, 2, 10, 30, tzinfo=timezone.utc))
    assert len(sent) == n  # one digest a day
