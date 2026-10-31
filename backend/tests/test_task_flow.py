import pytest

from app.task_flow import InvalidTransition, from_statuses, missing_required, next_status, rule_matches, search_text


@pytest.mark.parametrize("cur,action,new", [
    ("draft", "submit", "pending_approval"), ("changes_requested", "submit", "pending_approval"),
    ("draft", "auto_approve", "approved"), ("changes_requested", "auto_approve", "approved"),
    ("pending_approval", "approve", "approved"), ("snoozed", "approve", "approved"),
    ("pending_approval", "reject", "rejected"), ("snoozed", "reject", "rejected"),
    ("pending_approval", "request_changes", "changes_requested"),
    ("pending_approval", "duplicate", "duplicate"), ("pending_approval", "snooze", "snoozed")])
def test_allowed(cur, action, new):
    assert next_status(cur, action) == new


@pytest.mark.parametrize("cur,action", [
    ("approved", "approve"), ("rejected", "submit"), ("draft", "approve"),
    ("snoozed", "snooze"), ("approved", "reject"), ("pending_approval", "fly")])
def test_refused(cur, action):
    with pytest.raises(InvalidTransition):
        next_status(cur, action)


def test_from_statuses():
    assert from_statuses("approve") == ["pending_approval", "snoozed"]
    assert from_statuses("snooze") == ["pending_approval"]


def test_missing_required_flags_blank_values():
    tpl = {"sections": [{"key": "context", "label": "Context", "required": True},
                        {"key": "notes", "label": "Notes", "required": False}]}
    assert missing_required(tpl, {"context": "  "}) == {"context": "Context is required."}
    assert missing_required(tpl, {}) == {"context": "Context is required."}
    assert missing_required(tpl, {"context": "ok"}) == {}


def test_search_text():
    assert search_text({"a": "flaky loader", "b": "retry"}, ["infra"]) == "flaky loader retry infra"


def test_rule_matching():
    r = {"enabled": True, "type_keys": ["tech_debt"], "author_roles": ["member"], "labels_any": []}
    assert rule_matches(r, "tech_debt", ["member"], [])
    assert not rule_matches(r, "story", ["member"], [])
    assert not rule_matches(r, "tech_debt", ["viewer"], [])
    assert not rule_matches({**r, "enabled": False}, "tech_debt", ["member"], [])
    assert not rule_matches({"enabled": True, "type_keys": [], "author_roles": [], "labels_any": []}, "x", [], [])
    labels = {"enabled": True, "type_keys": [], "author_roles": [], "labels_any": ["chore", "deps"]}
    assert rule_matches(labels, "story", [], ["deps"]) and not rule_matches(labels, "story", [], ["ui"])
