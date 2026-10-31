from tests.conftest import STORY


async def test_ideas_are_private(ws_with_dev):
    wid, c = ws_with_dev
    r = await c["dev"].post(f"/api/w/{wid}/ideas", json={"text": "  cache schema lookups?  "})
    assert r.status_code == 201 and r.json()["text"] == "cache schema lookups?"
    assert [i["text"] for i in (await c["dev"].get(f"/api/w/{wid}/ideas")).json()] == ["cache schema lookups?"]
    assert (await c["adm"].get(f"/api/w/{wid}/ideas")).json() == []


async def test_ideas_newest_first(ws_with_dev):
    wid, c = ws_with_dev
    for text in ("one", "two"):
        await c["dev"].post(f"/api/w/{wid}/ideas", json={"text": text})
    assert [i["text"] for i in (await c["dev"].get(f"/api/w/{wid}/ideas")).json()] == ["two", "one"]


async def test_promoted_idea_leaves_inbox(ws_with_dev):
    wid, c = ws_with_dev
    idea = (await c["dev"].post(f"/api/w/{wid}/ideas", json={"text": "retry"})).json()
    await c["dev"].post(f"/api/w/{wid}/tasks", json={**STORY, "from_idea_id": idea["id"]})
    assert (await c["dev"].get(f"/api/w/{wid}/ideas")).json() == []


async def test_cannot_delete_someone_elses_idea(ws_with_dev):
    wid, c = ws_with_dev
    idea = (await c["dev"].post(f"/api/w/{wid}/ideas", json={"text": "retry"})).json()
    assert (await c["adm"].delete(f"/api/w/{wid}/ideas/{idea['id']}")).status_code == 404
    assert (await c["dev"].delete(f"/api/w/{wid}/ideas/{idea['id']}")).status_code == 204
    assert (await c["dev"].get(f"/api/w/{wid}/ideas")).json() == []


async def test_blank_or_long_idea_is_422(ws_with_dev):
    wid, c = ws_with_dev
    assert (await c["dev"].post(f"/api/w/{wid}/ideas", json={"text": "   "})).status_code == 422
    assert (await c["dev"].post(f"/api/w/{wid}/ideas", json={"text": "x" * 2001})).status_code == 422


async def test_viewer_has_no_inbox(ws_with_dev):
    wid, c = ws_with_dev
    assert (await c["view"].post(f"/api/w/{wid}/ideas", json={"text": "x"})).status_code == 403
