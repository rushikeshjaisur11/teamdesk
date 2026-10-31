from app.access import DEFAULT_ROLES, PERMISSIONS, resolve

WS = {"roles": DEFAULT_ROLES, "group_mappings": [
    {"group": "g-admin", "role": "admin"}, {"group": "g-dev", "role": "member"},
    {"group": "g-ghost", "role": "nope"}]}


def test_resolve_unions_roles():
    roles, perms = resolve(WS, ["g-dev", "g-admin"])
    assert roles == ["admin", "member"] and perms == set(PERMISSIONS)


def test_resolve_ignores_unknown_roles_and_groups():
    assert resolve(WS, ["g-ghost", "other"]) == ([], set())


def test_default_role_permissions():
    assert len(PERMISSIONS) == 10
    assert set(DEFAULT_ROLES["approver"]["permissions"]) == {"task.view", "task.create", "task.approve", "jira.view_all", "doc.edit"}
    assert set(DEFAULT_ROLES["member"]["permissions"]) == {"task.view", "task.create", "doc.edit"}
    assert DEFAULT_ROLES["viewer"]["permissions"] == ["task.view"]
