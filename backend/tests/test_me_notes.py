from tests.conftest import OWNER, login, submitted


async def test_note_is_private(ws_with_dev, make_client):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    r = await c["dev"].put(f"/api/me/notes/{wid}/{tid}", json={"text": "Ask Priya about storage cost"})
    assert r.status_code == 200 and r.json()["text"] == "Ask Priya about storage cost"
    assert (await c["dev"].get(f"/api/me/notes/{wid}/{tid}")).json()["text"] == "Ask Priya about storage cost"
    owner = await make_client(); await login(owner, "own", OWNER + ["g-admin"])
    for who in (c["adm"], owner):
        assert (await who.get(f"/api/me/notes/{wid}/{tid}")).json() == {"text": "", "updated_at": None}


async def test_note_needs_task_access(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    await c["dev"].put(f"/api/me/notes/{wid}/{tid}", json={"text": "x"})
    assert (await c["dev"].get(f"/api/me/notes/{wid}/{tid}")).json()["text"] == "x"
    await c["adm"].put(f"/api/w/{wid}/group-mappings", json=[{"group": "g-admin", "role": "admin"}])
    assert (await c["dev"].get(f"/api/me/notes/{wid}/{tid}")).status_code == 404
    assert (await c["dev"].put(f"/api/me/notes/{wid}/{tid}", json={"text": "y"})).status_code == 404
    assert (await c["adm"].get(f"/api/me/notes/{wid}/missing")).status_code == 404


async def test_note_limit(ws_with_dev):
    wid, c = ws_with_dev
    tid = await submitted(c, wid)
    assert (await c["dev"].put(f"/api/me/notes/{wid}/{tid}", json={"text": "x" * 20001})).status_code == 422
