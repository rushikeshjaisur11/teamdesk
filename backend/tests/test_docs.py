from tests.conftest import make_workspace, login


async def test_folders_docs_search_and_versions(ws_with_dev):
    wid, c = ws_with_dev
    base = f"/api/w/{wid}/docs"
    assert (await c["dev"].post(f"{base}/folders", json={"name": "Runbooks"})).status_code == 403  # members can't manage folders
    folder = (await c["adm"].post(f"{base}/folders", json={"name": "Runbooks"})).json()
    doc = (await c["dev"].post(base, json={"title": "Restart the loader", "body": "Run `kubectl rollout restart` on the loader.",
                                           "folder_id": folder["id"]})).json()
    assert doc["version"] == 1
    assert (await c["view"].post(base, json={"title": "x"})).status_code == 403  # viewers read only
    hits = (await c["view"].get(base, params={"q": "rollout"})).json()
    assert [h["title"] for h in hits] == ["Restart the loader"] and "rollout" in hits[0]["snippet"] and "body" not in hits[0]

    saved = (await c["dev"].put(f"{base}/{doc['id']}", json={"title": "Restart the loader", "body": "v2", "folder_id": folder["id"], "base_version": 1})).json()
    assert saved["version"] == 2
    stale = await c["adm"].put(f"{base}/{doc['id']}", json={"title": "T", "body": "old view", "base_version": 1})
    assert stale.status_code == 409 and "Dev saved this doc after you opened it" in stale.json()["detail"]
    forced = await c["adm"].put(f"{base}/{doc['id']}", json={"title": "T", "body": "mine", "folder_id": folder["id"], "base_version": 1, "force": True})
    assert forced.json()["version"] == 3
    history = (await c["view"].get(f"{base}/{doc['id']}/versions")).json()
    assert [(v["version"], v["body"]) for v in history] == [(2, "v2"), (1, "Run `kubectl rollout restart` on the loader.")]

    assert (await c["adm"].delete(f"{base}/folders/{folder['id']}")).status_code == 409  # not empty


async def test_docs_stay_in_their_workspace(ws_with_dev, make_client):
    wid, c = ws_with_dev
    doc = (await c["dev"].post(f"/api/w/{wid}/docs", json={"title": "Secret plan", "body": "alpha"})).json()
    other = await make_workspace(make_client, slug="other", admin_group="g-other")
    o = await make_client(); await login(o, "olga", ["g-other"])
    assert (await o.get(f"/api/w/{other}/docs/{doc['id']}")).status_code == 404
    assert (await o.get(f"/api/w/{other}/docs", params={"q": "alpha"})).json() == []
    assert (await o.get(f"/api/w/{wid}/docs")).status_code == 404

