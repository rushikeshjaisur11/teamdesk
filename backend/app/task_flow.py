EDITABLE = {"draft", "changes_requested", "pending_approval"}

_QUEUE = ["pending_approval", "snoozed"]
_TRANSITIONS = {
    "submit": (["draft", "changes_requested"], "pending_approval"),
    "auto_approve": (["draft", "changes_requested"], "approved"),
    "approve": (_QUEUE, "approved"),
    "reject": (_QUEUE, "rejected"),
    "request_changes": (_QUEUE, "changes_requested"),
    "duplicate": (_QUEUE, "duplicate"),
    "snooze": (["pending_approval"], "snoozed"),
}


class InvalidTransition(Exception):
    pass


def from_statuses(action: str) -> list[str]:
    if action not in _TRANSITIONS:
        raise InvalidTransition(f"Unknown action: {action}.")
    return _TRANSITIONS[action][0]


def next_status(current: str, action: str) -> str:
    if current not in from_statuses(action):
        raise InvalidTransition(f"Can't {action.replace('_', ' ')} a task that is {current.replace('_', ' ')}.")
    return _TRANSITIONS[action][1]


def missing_required(template: dict, fields: dict[str, str]) -> dict[str, str]:
    return {s["key"]: f"{s['label']} is required." for s in template["sections"]
            if s["required"] and not fields.get(s["key"], "").strip()}


def search_text(fields: dict[str, str], labels: list[str]) -> str:
    return " ".join([*fields.values(), *labels])


def rule_matches(rule: dict, type_key: str, author_roles: list[str], labels: list[str]) -> bool:
    conds = (rule["type_keys"], rule["author_roles"], rule["labels_any"])
    if not rule["enabled"] or not any(conds):
        return False
    return ((not rule["type_keys"] or type_key in rule["type_keys"])
            and (not rule["author_roles"] or any(r in rule["author_roles"] for r in author_roles))
            and (not rule["labels_any"] or any(l in rule["labels_any"] for l in labels)))
