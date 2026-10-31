from datetime import UTC, date, datetime

import pytest

from app.my_time import next_due, task_group, today_for


def test_today_uses_the_users_zone():
    now = datetime(2026, 10, 31, 19, 0, tzinfo=UTC)  # 00:30 on 1 Nov in Kolkata
    assert today_for("Asia/Kolkata", now) == date(2026, 11, 1)
    assert today_for("UTC", now) == date(2026, 10, 31)


@pytest.mark.parametrize("rule,due,today,expected", [
    ({"freq": "daily"}, date(2026, 11, 2), date(2026, 11, 2), date(2026, 11, 3)),
    ({"freq": "daily"}, date(2026, 10, 20), date(2026, 11, 2), date(2026, 11, 3)),
    ({"freq": "daily"}, None, date(2026, 11, 2), date(2026, 11, 3)),
    ({"freq": "weekdays"}, date(2026, 10, 30), date(2026, 10, 30), date(2026, 11, 2)),
    ({"freq": "weekly", "days": [0, 3]}, date(2026, 11, 2), date(2026, 11, 2), date(2026, 11, 5)),
    ({"freq": "weekly", "days": [0]}, date(2026, 11, 9), date(2026, 11, 2), date(2026, 11, 16)),
    ({"freq": "monthly", "day": 31}, date(2026, 10, 31), date(2026, 10, 31), date(2026, 11, 30)),
    ({"freq": "monthly", "day": 15}, date(2026, 8, 15), date(2026, 11, 2), date(2026, 11, 15)),
])
def test_next_due(rule, due, today, expected):
    assert next_due(rule, due, today) == expected


def test_task_group():
    today = date(2026, 11, 2)
    g = lambda **kw: task_group({"status": "open", "due_on": None, **kw}, today)
    assert g(due_on="2026-11-01") == "overdue"
    assert g(due_on="2026-11-02") == "today"
    assert g(due_on="2026-11-03") == "upcoming"
    assert g() == "no_date"
    assert g(status="done", due_on="2026-11-01") == "done"
