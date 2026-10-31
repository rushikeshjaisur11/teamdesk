from tests.conftest import login, make_workspace

NEW = {"key": "ops", "name": "Ops request", "jira_issue_type": "Task",
       "sections": [{"key": "what", "label": "What", "required": True, "hint": "What do you need?"}],
       "default_labels": ["ops"]}


async def admin_of(make_client, slug="team", group="g-admin"):
    wid = await make_workspace(make_client, slug=slug, admin_group=group)
    a = await make_client(); await login(a, f"adm-{slug}", [group])
    return wid, a


async def test_new_workspace_has_default_templates(make_client):
    wid, a = await admin_of(make_client)
    tpls = (await a.get(f"/api/w/{wid}/templates")).json()
    assert [t["key"] for t in tpls] == ["story", "bug", "spike", "tech_debt"]
    story = tpls[0]
    assert [(s["key"], s["label"], s["required"]) for s in story["sections"]] == [
        ("context", "Context", True), ("scope", "Scope", True),
        ("acceptance", "Acceptance criteria", True), ("out_of_scope", "Out of scope", False)]
    assert all(s["hint"] for t in tpls for s in t["sections"])
    assert [t["jira_issue_type"] for t in tpls] == ["Story", "Bug", "Task", "Task"]


async def test_admin_adds_and_archives_template(make_client):
    wid, a = await admin_of(make_client)
    assert (await a.post(f"/api/w/{wid}/templates", json=NEW)).status_code == 201
    assert (await a.post(f"/api/w/{wid}/templates", json=NEW)).status_code == 409
    upd = (await a.put(f"/api/w/{wid}/templates/ops", json={**NEW, "name": "Ops"})).json()
    assert upd["name"] == "Ops"
    assert (await a.delete(f"/api/w/{wid}/templates/ops")).status_code == 204
    assert "ops" not in [t["key"] for t in (await a.get(f"/api/w/{wid}/templates")).json()]
    actions = [e["action"] for e in (await a.get(f"/api/w/{wid}/audit")).json()]
    assert actions[:3] == ["template.archived", "template.updated", "template.created"]


async def test_template_needs_a_section_and_valid_keys(make_client):
    wid, a = await admin_of(make_client)
    assert (await a.post(f"/api/w/{wid}/templates", json={**NEW, "sections": []})).status_code == 422
    assert (await a.post(f"/api/w/{wid}/templates", json={**NEW, "key": "Bad Key"})).status_code == 422
    dup = [NEW["sections"][0], NEW["sections"][0]]
    assert (await a.post(f"/api/w/{wid}/templates", json={**NEW, "sections": dup})).status_code == 422


async def test_templates_are_per_workspace(make_client):
    wa, a = await admin_of(make_client, "aa", "g-a")
    wb, b = await admin_of(make_client, "bb", "g-b")
    await a.post(f"/api/w/{wa}/templates", json=NEW)
    assert "ops" not in [t["key"] for t in (await b.get(f"/api/w/{wb}/templates")).json()]
