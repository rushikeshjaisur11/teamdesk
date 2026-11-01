
from tests.conftest import OWNER, login


async def test_owner_creates_workspace_and_admin_group_sees_it(make_client):
    owner = await make_client(); await login(owner, "own", OWNER)
    r = await owner.post("/api/platform/workspaces", json={"name": "Data Eng", "slug": "data-eng", "admin_group": "g-admin"})
    assert r.status_code == 201
    assert r.json()["admin_groups"] == ["g-admin"]
    admin = await make_client(); await login(admin, "adm", ["g-admin"])
    ws = (await admin.get("/api/auth/me")).json()["workspaces"]
    assert [w["slug"] for w in ws] == ["data-eng"] and "settings.manage" in ws[0]["permissions"]
    assert ws[0]["roles"] == ["admin"]


async def test_non_owner_cannot_create(make_client):
    c = await make_client(); await login(c, "x", ["g-admin"])
    r = await c.post("/api/platform/workspaces", json={"name": "A", "slug": "aa", "admin_group": "g"})
    assert r.status_code == 403


async def test_duplicate_slug_409(make_client):
    c = await make_client(); await login(c, "own", OWNER)
    body = {"name": "A", "slug": "aa", "admin_group": "g"}
    await c.post("/api/platform/workspaces", json=body)
    r = await c.post("/api/platform/workspaces", json=body)
    assert r.status_code == 409 and r.json()["detail"] == "That short name is taken."


async def test_bad_slug_422(make_client):
    c = await make_client(); await login(c, "own", OWNER)
    r = await c.post("/api/platform/workspaces", json={"name": "A", "slug": "Bad Slug", "admin_group": "g"})
    assert r.status_code == 422


async def test_owner_lists_workspaces(make_client):
    c = await make_client(); await login(c, "own", OWNER)
    await c.post("/api/platform/workspaces", json={"name": "B", "slug": "bb", "admin_group": "g"})
    await c.post("/api/platform/workspaces", json={"name": "A", "slug": "aa", "admin_group": "g"})
    assert [w["slug"] for w in (await c.get("/api/platform/workspaces")).json()] == ["aa", "bb"]


async def test_owner_without_mapping_can_open_workspace(make_client):
    c = await make_client(); await login(c, "own", OWNER)
    wid = (await c.post("/api/platform/workspaces", json={"name": "A", "slug": "aa", "admin_group": "g"})).json()["id"]
    assert [w["id"] for w in (await c.get("/api/auth/me")).json()["workspaces"]] == [wid]
    assert (await c.get(f"/api/w/{wid}/settings")).status_code == 200


async def test_archived_workspace_disappears(make_client):
    owner = await make_client(); await login(owner, "own", OWNER)
    wid = (await owner.post("/api/platform/workspaces", json={"name": "A", "slug": "aa", "admin_group": "g-admin"})).json()["id"]
    assert (await owner.post(f"/api/platform/workspaces/{wid}/archive")).status_code == 204
    admin = await make_client(); await login(admin, "adm", ["g-admin"])
    assert (await admin.get("/api/auth/me")).json()["workspaces"] == []
    r = await admin.get(f"/api/w/{wid}/settings")
    assert r.status_code == 404 and r.json()["detail"] == "Workspace not found."
