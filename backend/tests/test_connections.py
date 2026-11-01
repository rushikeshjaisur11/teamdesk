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


def jira_with(calls: list, status: dict | None = None):
    def handle(req: httpx.Request) -> httpx.Response:
        calls.append(req)
        if req.url.path == "/rest/api/2/issue":
            return httpx.Response(201, json={"key": "DATA-7"})
        if req.url.path.endswith("/comment"):
            return httpx.Response(201, json={})
        if req.url.path == "/rest/api/2/issue/DATA-7":
            return httpx.Response(200, json={"fields": {"status": status}})
        return httpx.Response(404)
    return httpx.MockTransport(handle)


async def linked_task(c, wid) -> str:
    tid = (await c["dev"].post(f"/api/w/{wid}/tasks", json=STORY)).json()["id"]
    await c["dev"].post(f"/api/w/{wid}/tasks/{tid}/submit")
    await c["appr"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "approve"})
    assert (await c["dev"].post(f"/api/w/{wid}/tasks/{tid}/jira")).status_code == 200
    return tid


async def test_comment_goes_to_jira_rewritten_by_ai(ws_with_dev, settings, monkeypatch):
    from app import ai
    wid, c = ws_with_dev
    calls, prompts = [], []
    monkeypatch.setattr(jira, "TRANSPORT", jira_with(calls))
    monkeypatch.setattr(ai, "TRANSPORT", httpx.MockTransport(lambda req: prompts.append(json.loads(req.content)) or httpx.Response(
        200, json={"candidates": [{"content": {"parts": [{"text": "Loader retries are now covered by tests."}]}}]})))
    settings.ai_enabled, settings.vertex_api_key = True, "k"
    await c["adm"].put(f"/api/w/{wid}/connections/jira", json=JIRA)
    tid = await linked_task(c, wid)
    await c["dev"].post(f"/api/w/{wid}/tasks/{tid}/comments", json={"text": "added tests for loader retrys"})
    sent = json.loads(calls[-1].content)["body"]
    assert calls[-1].url.path == "/rest/api/2/issue/DATA-7/comment"
    assert sent.startswith("Loader retries are now covered by tests.") and "Dev, via TeamDesk" in sent
    assert "added tests for loader retrys" in prompts[0]["contents"][0]["parts"][0]["text"]


async def test_comment_sent_as_written_when_ai_off(ws_with_dev, monkeypatch):
    wid, c = ws_with_dev
    calls = []
    monkeypatch.setattr(jira, "TRANSPORT", jira_with(calls))
    await c["adm"].put(f"/api/w/{wid}/connections/jira", json=JIRA)
    tid = await linked_task(c, wid)
    await c["dev"].post(f"/api/w/{wid}/tasks/{tid}/comments", json={"text": "raw words"})
    assert json.loads(calls[-1].content)["body"].startswith("raw words")


async def test_team_template_shapes_the_issue(ws_with_dev, monkeypatch):
    wid, c = ws_with_dev
    calls = []
    monkeypatch.setattr(jira, "TRANSPORT", jira_with(calls))
    await c["adm"].put(f"/api/w/{wid}/connections/jira", json=JIRA)
    story = next(t for t in (await c["adm"].get(f"/api/w/{wid}/templates")).json() if t["key"] == "story")
    for s in story["sections"]:
        s["jira_field"] = "customfield_10020" if s["key"] == "acceptance" else ""
    r = await c["adm"].put(f"/api/w/{wid}/templates/story", json={
        "name": "Story", "jira_issue_type": "Feature", "sections": story["sections"], "default_labels": [],
        "jira_project_key": "PLAT", "jira_extra_fields": {"components": [{"name": "ETL"}]}})
    assert r.status_code == 200, r.text
    await linked_task(c, wid)
    fields = json.loads(next(x for x in calls if x.url.path == "/rest/api/2/issue").content)["fields"]
    assert fields["project"] == {"key": "PLAT"} and fields["issuetype"] == {"name": "Feature"}
    assert fields["customfield_10020"] == "retries 3x" and "Acceptance" not in fields["description"]
    assert fields["components"] == [{"name": "ETL"}]


async def test_status_sync_uses_team_mapping(ws_with_dev, db, settings, monkeypatch):
    wid, c = ws_with_dev
    monkeypatch.setattr(jira, "TRANSPORT", jira_with([], {"name": "In Review", "statusCategory": {"key": "indeterminate"}}))
    await c["adm"].put(f"/api/w/{wid}/connections/jira", json=JIRA)
    tid = await linked_task(c, wid)
    await run_once(db, settings, datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc))
    task = (await c["dev"].get(f"/api/w/{wid}/tasks/{tid}")).json()
    assert (task["status"], task["jira_status"]) == ("in_progress", "In Review")
    # This team's workflow says "In Review" means done for us.
    await c["adm"].put(f"/api/w/{wid}/connections/jira", json={**JIRA, "token": "", "status_map": {"In Review": "done"}})
    await db.workspaces.update_one({"_id": wid}, {"$set": {"jira_synced_at": None}})
    await run_once(db, settings, datetime(2026, 11, 2, 9, 1, tzinfo=timezone.utc))
    assert (await c["dev"].get(f"/api/w/{wid}/tasks/{tid}")).json()["status"] == "done"


async def test_team_channel_gets_approvals(ws_with_dev, monkeypatch):
    wid, c = ws_with_dev
    sent = []
    monkeypatch.setattr(teams, "TRANSPORT", httpx.MockTransport(lambda req: sent.append(json.loads(req.content)) or httpx.Response(202)))
    assert (await c["dev"].put(f"/api/w/{wid}/connections/teams", json={"url": HOOK})).status_code == 403
    r = await c["adm"].put(f"/api/w/{wid}/connections/teams", json={"url": HOOK, "events": ["approval_needed"]})
    assert r.json() == {"events": ["approval_needed"], "has_url": True}
    tid = (await c["dev"].post(f"/api/w/{wid}/tasks", json=STORY)).json()["id"]
    await c["dev"].post(f"/api/w/{wid}/tasks/{tid}/submit")
    await c["appr"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "approve"})
    titles = [m["attachments"][0]["content"]["body"][0]["text"] for m in sent]
    assert titles == ["#1 Add retry to loader needs approval"]  # decisions not chosen, so not posted
