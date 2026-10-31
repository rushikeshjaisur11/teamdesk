from tests.conftest import submitted


async def test_submit_notifies_approvers_not_author(ws_with_dev):
    wid, c = ws_with_dev
    await submitted(c, wid)
    for who in ("appr", "adm"):
        n = (await c[who].get(f"/api/w/{wid}/notifications")).json()
        assert [(x["kind"], x["text"]) for x in n] == [("approval_needed", "#1 Add retry to loader needs approval")]
    assert (await c["dev"].get(f"/api/w/{wid}/notifications")).json() == []


async def test_decision_notifies_author_and_mark_read(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    await c["appr"].post(f"/api/w/{wid}/tasks/{tid}/decision", json={"action": "reject", "reason": "out of scope"})
    n = (await c["dev"].get(f"/api/w/{wid}/notifications")).json()
    assert n[0]["text"] == "#1 was rejected by Appr: out of scope" and n[0]["task_id"] == tid
    await c["dev"].post(f"/api/w/{wid}/notifications/read", json={"all": True})
    assert (await c["dev"].get(f"/api/w/{wid}/notifications", params={"unread": "true"})).json() == []
    assert len((await c["dev"].get(f"/api/w/{wid}/notifications")).json()) == 1


async def test_mark_specific_read_only_touches_own(ws_with_dev):
    wid, c = ws_with_dev
    await submitted(c, wid)
    mine = (await c["appr"].get(f"/api/w/{wid}/notifications")).json()[0]["id"]
    adm_before = (await c["adm"].get(f"/api/w/{wid}/notifications", params={"unread": "true"})).json()
    await c["adm"].post(f"/api/w/{wid}/notifications/read", json={"ids": [mine]})
    assert (await c["appr"].get(f"/api/w/{wid}/notifications", params={"unread": "true"})).json()[0]["id"] == mine
    await c["appr"].post(f"/api/w/{wid}/notifications/read", json={"ids": [mine]})
    assert (await c["appr"].get(f"/api/w/{wid}/notifications", params={"unread": "true"})).json() == []
    assert len(adm_before) == 1


async def test_comment_notifies_author(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    await c["appr"].post(f"/api/w/{wid}/tasks/{tid}/comments", json={"text": "looks good"})
    assert (await c["dev"].get(f"/api/w/{wid}/notifications")).json()[0]["text"] == "Appr commented on #1"


async def test_email_sent_when_smtp_configured(ws_with_dev, app, monkeypatch):
    sent = []
    monkeypatch.setattr("app.notifications.send_email", lambda s, to, subj, body: sent.append((to, body)))
    app.state.settings.smtp_host = "smtp.local"
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    assert sorted(to for to, _ in sent) == ["adm@example.com", "appr@example.com"]
    assert f"/w/{wid}/tasks/{tid}" in sent[0][1]


async def test_no_email_without_smtp(ws_with_dev, monkeypatch):
    sent = []
    monkeypatch.setattr("app.notifications.send_email", lambda *a: sent.append(a))
    wid, c = ws_with_dev
    await submitted(c, wid)
    assert sent == []
