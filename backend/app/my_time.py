import calendar
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo


def today_for(tz: str, now: datetime) -> date:
    return now.astimezone(ZoneInfo(tz)).date()


def _matches(rule: dict, d: date) -> bool:
    freq = rule["freq"]
    if freq == "daily":
        return True
    if freq == "weekdays":
        return d.weekday() < 5
    if freq == "weekly":
        return d.weekday() in rule["days"]
    last = calendar.monthrange(d.year, d.month)[1]
    return d.day == min(rule["day"], last)


def next_due(rule: dict, due_on: date | None, today: date) -> date:
    """Next rule date after the due date, or after today when the task is late (missed cycles aren't back-filled)."""
    d = due_on if due_on and due_on >= today else today
    for _ in range(400):  # ponytail: linear scan, fine for the four rule kinds (worst case ~31 steps)
        d += timedelta(days=1)
        if _matches(rule, d):
            return d
    raise ValueError("Recurrence never matches.")


def task_group(item: dict, today: date) -> Literal["overdue", "today", "upcoming", "no_date", "done"]:
    if item["status"] != "open":
        return "done"
    if not item.get("due_on"):
        return "no_date"
    due = date.fromisoformat(item["due_on"])
    return "overdue" if due < today else "today" if due == today else "upcoming"
