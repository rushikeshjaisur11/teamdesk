from app import calendar_feed
from tests.conftest import OWNER, login


async def mk(c, **body):
    r = await c.post("/api/me/items", json={"kind": "task", **body})
    assert r.status_code == 201, r.text
    return r.json()


async def token(c):
    r = await c.post("/api/me/calendar/reset")
    assert r.status_code == 200, r.text
    return r.json()["url"].rsplit("/", 1)[1].removesuffix(".ics")


async def test_feed_has_titles_not_notes_and_needs_no_session(ws_with_dev, make_client, db):
    wid, c = ws_with_dev
    await mk(c["dev"], title="Pay invoice", notes="secret bank details", due_on="2026-11-05")
    await mk(c["dev"], title="Call Dan", remind_at="2026-11-03T09:30:00Z")
    await mk(c["dev"], title="no date")
    tok = await token(c["dev"])
    anon = await make_client()
    r = await anon.get(f"/api/calendar/{tok}.ics")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
    assert "SUMMARY:Pay invoice" in r.text and "DTSTART;VALUE=DATE:20261105" in r.text
    assert "SUMMARY:Call Dan" in r.text and "DTSTART:20261103T093000Z" in r.text
    assert "no date" not in r.text and "secret" not in r.text


async def test_feed_is_per_user_and_reset_invalidates(ws_with_dev, make_client, db):
    wid, c = ws_with_dev
    await mk(c["dev"], title="mine", due_on="2026-11-05")
    await mk(c["adm"], title="theirs", due_on="2026-11-05")
    tok = await token(c["dev"])
    anon = await make_client()
    assert "theirs" not in (await anon.get(f"/api/calendar/{tok}.ics")).text
    stored = await db.users.find_one({"_id": "dev"})
    assert tok not in str(stored) and stored["feed_token_hash"]
    tok2 = await token(c["dev"])
    assert tok2 != tok
    assert (await anon.get(f"/api/calendar/{tok}.ics")).status_code == 404
    assert (await anon.get(f"/api/calendar/{tok2}.ics")).status_code == 200
    assert (await anon.get("/api/calendar/bogus.ics")).status_code == 404


async def test_feed_escapes_text_and_rate_limits(ws_with_dev, make_client, monkeypatch):
    wid, c = ws_with_dev
    await mk(c["dev"], title="a,b;c\\d\nX-INJECT:1", due_on="2026-11-05")
    tok = await token(c["dev"])
    anon = await make_client()
    body = (await anon.get(f"/api/calendar/{tok}.ics")).text
    assert "SUMMARY:a\\,b\\;c\\\\d\\nX-INJECT:1" in body and "\nX-INJECT" not in body
    calendar_feed.HITS.clear()
    codes = [(await anon.get(f"/api/calendar/{tok}.ics")).status_code for _ in range(62)]
    assert codes[:60] == [200] * 60 and codes[60:] == [429, 429]


async def test_admin_cannot_get_someone_elses_link(ws_with_dev):
    wid, c = ws_with_dev
    r = await c["adm"].post("/api/me/calendar/reset")
    assert r.status_code == 200
    assert (await c["adm"].get("/api/me/calendar")).json() == {"enabled": True}
    assert (await c["dev"].get("/api/me/calendar")).json() == {"enabled": False}
