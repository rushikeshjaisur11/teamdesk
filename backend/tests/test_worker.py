import asyncio
from datetime import UTC, datetime, timedelta

from app.worker import run_once
from tests.conftest import STORY

NOW = datetime(2026, 11, 3, 9, 0, tzinfo=UTC)


async def mk(c, **body):
    r = await c.post("/api/me/items", json={"kind": "task", **body})
    assert r.status_code == 201, r.text
    return r.json()


async def notifs(c):
    return (await c.get("/api/me/notifications")).json()


async def test_reminder_fires_once_even_with_concurrent_workers(ws_with_dev, db, settings):
    wid, c = ws_with_dev
    await mk(c["dev"], title="call vendor", remind_at="2026-11-03T08:59:00Z")
    await mk(c["dev"], title="later", remind_at="2026-11-03T12:00:00Z")
    await asyncio.gather(run_once(db, settings, NOW), run_once(db, settings, NOW), run_once(db, settings, NOW))
    n = await notifs(c["dev"])
    assert [x["text"] for x in n] == ["Reminder: call vendor"]
    await run_once(db, settings, NOW)
    assert len(await notifs(c["dev"])) == 1
    assert await notifs(c["adm"]) == []
    await run_once(db, settings, NOW + timedelta(hours=4))
    assert len(await notifs(c["dev"])) == 2


async def test_done_item_does_not_remind(ws_with_dev, db, settings):
    wid, c = ws_with_dev
    i = await mk(c["dev"], title="x", remind_at="2026-11-03T08:00:00Z")
    await c["dev"].post(f"/api/me/items/{i['id']}/complete")
    await run_once(db, settings, NOW)
    assert await notifs(c["dev"]) == []


async def test_linked_reminder_uses_current_title_or_hides_it_after_access_loss(ws_with_dev, db, settings):
    wid, c = ws_with_dev
    r = await c["dev"].post(f"/api/w/{wid}/tasks", json=STORY)
    tid = r.json()["id"]
    await mk(c["dev"], title="chase", remind_at="2026-11-03T08:00:00Z", link={"workspace_id": wid, "task_id": tid})
    await run_once(db, settings, NOW)
    assert (await notifs(c["dev"]))[0]["text"] == f"Reminder: {STORY['title']}"
    await mk(c["dev"], title="chase 2", remind_at="2026-11-03T08:30:00Z", link={"workspace_id": wid, "task_id": tid})
    await c["adm"].put(f"/api/w/{wid}/group-mappings", json=[{"group": "g-admin", "role": "admin"}])
    await run_once(db, settings, NOW)
    texts = [n["text"] for n in await notifs(c["dev"])]
    assert "Reminder: A task you no longer have access to" in texts and "chase 2" not in " ".join(texts)


async def test_waiting_nudge_once(ws_with_dev, db, settings):
    wid, c = ws_with_dev
    await mk(c["dev"], kind="waiting", title="cost numbers",
             waiting={"who": "Priya", "since": "2026-10-29", "nudge_after_days": 3})
    await mk(c["dev"], kind="waiting", title="fresh", waiting={"who": "Dan", "since": "2026-11-02", "nudge_after_days": 3})
    await run_once(db, settings, NOW); await run_once(db, settings, NOW)
    assert [n["text"] for n in await notifs(c["dev"])] == ["Still waiting on Priya for cost numbers (5 days)"]


async def test_nudge_uses_user_time_zone(ws_with_dev, db, settings):
    wid, c = ws_with_dev
    await c["dev"].patch("/api/me/profile", json={"tz": "Pacific/Auckland"})
    await mk(c["dev"], kind="waiting", title="t", waiting={"who": "P", "since": "2026-11-01", "nudge_after_days": 3})
    await run_once(db, settings, datetime(2026, 11, 3, 12, 0, tzinfo=UTC))  # Nov 4 01:00 in Auckland
    assert len(await notifs(c["dev"])) == 1


async def test_email_sent_when_smtp_set(ws_with_dev, db, settings, monkeypatch):
    wid, c = ws_with_dev
    sent = []
    monkeypatch.setattr("app.worker.send_email", lambda s, to, subj, body: sent.append((to, subj)))
    settings.smtp_host = "smtp.test"
    await mk(c["dev"], title="call", remind_at="2026-11-03T08:00:00Z")
    await run_once(db, settings, NOW)
    assert sent == [("dev@example.com", "Reminder: call")]
