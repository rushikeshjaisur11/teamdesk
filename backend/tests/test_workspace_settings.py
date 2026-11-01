from app.access import DEFAULT_ROLES
from tests.conftest import login, make_workspace

MAPS = [{"group": "g-admin", "role": "admin"}, {"group": "g-dev", "role": "member"}]


async def admin_of(make_client):
    wid = await make_workspace(make_client)
    a = await make_client(); await login(a, "adm", ["g-admin"])
    return wid, a


async def test_admin_reads_and_updates_settings(make_client):
    wid, a = await admin_of(make_client)
    r = await a.patch(f"/api/w/{wid}/settings", json={"name": "Data Platform"})
    assert r.json()["name"] == "Data Platform"
    assert (await a.get(f"/api/w/{wid}/settings")).json()["group_mappings"] == [{"group": "g-admin", "role": "admin"}]
    log = (await a.get(f"/api/w/{wid}/audit")).json()
    assert log[0]["action"] == "settings.updated" and log[0]["actor"]["sub"] == "adm"


async def test_member_cannot_read_settings(make_client):
    wid, a = await admin_of(make_client)
    await a.put(f"/api/w/{wid}/group-mappings", json=MAPS)
    m = await make_client(); await login(m, "dev", ["g-dev"])
    r = await m.get(f"/api/w/{wid}/settings")
    assert r.status_code == 403 and "Ask a workspace admin" in r.json()["detail"]


async def test_removing_mapping_takes_effect_on_next_request(make_client):
    wid, a = await admin_of(make_client)
    await a.put(f"/api/w/{wid}/group-mappings", json=MAPS)
    m = await make_client(); await login(m, "dev", ["g-dev"])
    assert (await m.get(f"/api/w/{wid}/members")).status_code == 200
    await a.put(f"/api/w/{wid}/group-mappings", json=MAPS[:1])
    assert (await m.get(f"/api/w/{wid}/members")).status_code == 404


async def test_lockout_is_refused(make_client):
    wid, a = await admin_of(make_client)
    r = await a.put(f"/api/w/{wid}/group-mappings", json=[{"group": "g-admin", "role": "member"}])
    assert r.status_code == 422 and "nobody could fix access" in r.json()["detail"]
    roles = dict(DEFAULT_ROLES)
    roles["admin"] = {"name": "Admin", "permissions": ["task.view"]}
    r = await a.put(f"/api/w/{wid}/roles", json=roles)
    assert r.status_code == 422 and "nobody could fix access" in r.json()["detail"]


async def test_unknown_role_and_permission_rejected(make_client):
    wid, a = await admin_of(make_client)
    r = await a.put(f"/api/w/{wid}/group-mappings", json=[*MAPS, {"group": "g-x", "role": "boss"}])
    assert r.status_code == 422 and r.json()["detail"] == "Unknown role: boss."
    roles = {**DEFAULT_ROLES, "qa": {"name": "QA", "permissions": ["task.fly"]}}
    assert (await a.put(f"/api/w/{wid}/roles", json=roles)).status_code == 422


async def test_custom_role_and_removed_role_mappings_dropped(make_client):
    wid, a = await admin_of(make_client)
    await a.put(f"/api/w/{wid}/group-mappings", json=[*MAPS, {"group": "g-v", "role": "viewer"}])
    roles = {k: v for k, v in DEFAULT_ROLES.items() if k != "viewer"}
    roles["qa"] = {"name": "QA", "permissions": ["task.view", "task.create"]}
    r = await a.put(f"/api/w/{wid}/roles", json=roles)
    assert r.status_code == 200 and "qa" in r.json()["roles"]
    assert {"group": "g-v", "role": "viewer"} not in r.json()["group_mappings"]


async def test_members_lists_seen_users_with_roles(make_client):
    wid, a = await admin_of(make_client)
    await a.put(f"/api/w/{wid}/group-mappings", json=MAPS)
    m = await make_client(); await login(m, "dev", ["g-dev"], name="Dev One")
    stranger = await make_client(); await login(stranger, "zed", ["g-other"])
    members = (await m.get(f"/api/w/{wid}/members")).json()
    assert members == [{"sub": "adm", "name": "Adm", "email": "adm@example.com", "roles": ["admin"], "away_until": None},
                       {"sub": "dev", "name": "Dev One", "email": "dev@example.com", "roles": ["member"], "away_until": None}]
