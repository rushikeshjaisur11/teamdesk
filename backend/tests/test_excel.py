import base64
import io

from openpyxl import Workbook, load_workbook


def sheet(rows: list[list]) -> str:
    wb = Workbook()
    for r in rows:
        wb.active.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return base64.b64encode(buf.getvalue()).decode()


MANAGER = [
    [],  # blank first row, as in many hand-kept sheets
    ["Task", "Kind", "Why", "Owner", "Tags"],
    ["Add retries to the loader", "Story", "flaky nightly runs", "Priya", "etl, reliability"],
    ["Fix null dates", "bug", "", "Sam", ""],
    ["", "", "", "", ""],
    ["Drop old cron", "Unknown type", "", "", ""],
]


async def test_preview_then_import_keeps_every_column(ws_with_dev):
    wid, c = ws_with_dev
    data = sheet(MANAGER)
    p = (await c["dev"].post(f"/api/w/{wid}/tasks/import/preview", json={"filename": "plan.xlsx", "data": data})).json()
    assert p["columns"] == ["Task", "Kind", "Why", "Owner", "Tags"] and p["total"] == 3 and p["rows"][0][0] == "Add retries to the loader"

    r = (await c["dev"].post(f"/api/w/{wid}/tasks/import", json={
        "filename": "plan.xlsx", "data": data, "default_type": "tech_debt",
        "mapping": {"title": 0, "type": 1, "labels": 4, "fields": {"context": 2}}})).json()
    assert r == {"created": 3, "submitted": 0, "drafts_missing_fields": [], "skipped_empty": 0}
    tasks = {t["title"]: t for t in (await c["dev"].get(f"/api/w/{wid}/tasks")).json()}
    loader = tasks["Add retries to the loader"]
    assert (loader["type_key"], loader["status"], loader["labels"]) == ("story", "draft", ["etl", "reliability"])
    assert loader["fields"]["context"] == "flaky nightly runs\n\nOwner: Priya"  # unmapped column kept
    assert tasks["Fix null dates"]["type_key"] == "bug" and tasks["Drop old cron"]["type_key"] == "tech_debt"


async def test_import_and_submit_uses_the_approval_flow(ws_with_dev):
    wid, c = ws_with_dev
    data = sheet([["Title", "Context", "Scope", "Acceptance"], ["Ready one", "c", "s", "a"], ["Half done", "c", "", ""]])
    r = (await c["dev"].post(f"/api/w/{wid}/tasks/import", json={
        "filename": "x.xlsx", "data": data, "default_type": "story", "submit": True,
        "mapping": {"title": 0, "fields": {"context": 1, "scope": 2, "acceptance": 3}}})).json()
    assert r["created"] == 2 and r["submitted"] == 1 and len(r["drafts_missing_fields"]) == 1
    statuses = {t["title"]: t["status"] for t in (await c["dev"].get(f"/api/w/{wid}/tasks")).json()}
    assert statuses == {"Ready one": "pending_approval", "Half done": "draft"}


async def test_bad_files_and_permissions(ws_with_dev):
    wid, c = ws_with_dev
    url = f"/api/w/{wid}/tasks/import/preview"
    assert (await c["dev"].post(url, json={"filename": "a.csv", "data": ""})).status_code == 415
    assert (await c["dev"].post(url, json={"filename": "a.xlsx", "data": base64.b64encode(b"nope").decode()})).status_code == 422
    assert (await c["view"].post(url, json={"filename": "a.xlsx", "data": sheet([["T"], ["x"]])})).status_code == 403


async def test_export_follows_filters(ws_with_dev):
    wid, c = ws_with_dev
    await c["dev"].post(f"/api/w/{wid}/tasks", json={"type_key": "story", "title": "Alpha", "fields": {"context": "why"}})
    await c["adm"].post(f"/api/w/{wid}/tasks", json={"type_key": "bug", "title": "Beta"})
    r = await c["view"].get(f"/api/w/{wid}/tasks/export", params={"type": "story"})
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    rows = list(load_workbook(io.BytesIO(r.content)).active.iter_rows(values_only=True))
    assert rows[0][:4] == ("ID", "Title", "Type", "Status")
    assert [(x[1], x[2], x[3]) for x in rows[1:]] == [("Alpha", "Story", "draft")] and "Context: why" in rows[1][10]
