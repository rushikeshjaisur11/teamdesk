"""Excel in and out of a team's task list.

Import: upload the manager's sheet, see its columns and first rows, map columns to task fields, import.
Every row becomes a draft (or is submitted, so the team's normal approval and auto-approve rules apply);
columns that aren't mapped are kept as "Column: value" lines so nothing in the sheet is lost.
Export: the task list with the same filters as the Tasks screen, as .xlsx."""
import base64
import binascii
import zipfile
import io
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openpyxl import Workbook, load_workbook
from openpyxl.utils.exceptions import InvalidFileException
from pydantic import BaseModel, Field

from app.access import Ctx, require
from app.tasks import NewTask, create_task, list_tasks, submit_task

router = APIRouter(prefix="/api/w/{workspace_id}/tasks")
MAX_BYTES = 10 * 1024 * 1024
MAX_ROWS = 1000


class Sheet(BaseModel):
    filename: str = Field(max_length=200)
    data: str  # base64 of the .xlsx


class Mapping(BaseModel):
    title: int  # column index
    type: int | None = None  # a column whose values name the task type
    labels: int | None = None  # comma-separated labels
    fields: dict[str, int] = Field(default_factory=dict)  # section key -> column index


class ImportBody(Sheet):
    mapping: Mapping
    default_type: str
    submit: bool = False


def cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.date().isoformat() if v.time() == datetime.min.time() else v.isoformat(sep=" ", timespec="minutes")
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def read(body: Sheet) -> tuple[list[str], list[list[str]]]:
    """Header row (the first row with any text) and the data rows under it, from the first sheet."""
    if not body.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(415, "Upload an Excel .xlsx file. For .xls or .csv, open it in Excel and save as .xlsx.")
    try:
        data = base64.b64decode(body.data, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "The file didn't upload correctly. Try again.")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "That file is over 10 MB.")
    try:
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except (InvalidFileException, zipfile.BadZipFile, KeyError, OSError, ValueError):
        raise HTTPException(422, "That file couldn't be read as Excel. Save it again as .xlsx and retry.")
    rows = [[cell(v) for v in r] for r in wb.worksheets[0].iter_rows(values_only=True)]
    wb.close()
    rows = [r for r in rows if any(r)]
    if not rows:
        raise HTTPException(422, "The first sheet is empty.")
    header, body_rows = rows[0], rows[1:]
    width = len(header)
    header = [h or f"Column {i + 1}" for i, h in enumerate(header)]
    return header, [(r + [""] * width)[:width] for r in body_rows]


@router.post("/import/preview")
async def preview(body: Sheet, ctx: Ctx = Depends(require("task.create"))):
    header, rows = read(body)
    return {"columns": header, "rows": rows[:8], "total": len(rows)}


@router.post("/import")
async def import_tasks(body: ImportBody, ctx: Ctx = Depends(require("task.create"))):
    header, rows = read(body)
    if len(rows) > MAX_ROWS:
        raise HTTPException(413, f"That sheet has {len(rows)} rows. Import up to {MAX_ROWS} at a time.")
    m = body.mapping
    used = {m.title, m.type, m.labels, *m.fields.values()} - {None}
    if any(not 0 <= i < len(header) for i in used):
        raise HTTPException(422, "The column mapping doesn't match this file. Upload it again.")
    templates = {t["key"]: t for t in await ctx.scoped.col("templates").find({"archived": False})}
    if body.default_type not in templates:
        raise HTTPException(422, "Choose a task type for rows that don't name one.")
    by_name = {**{k.lower(): k for k in templates}, **{t["name"].lower(): k for k, t in templates.items()}}
    created, submitted, kept_as_draft, skipped = [], 0, [], 0
    for r in rows:
        title = r[m.title][:200]
        if not title:
            skipped += 1
            continue
        type_key = by_name.get(r[m.type].lower(), body.default_type) if m.type is not None else body.default_type
        sections = [s["key"] for s in templates[type_key]["sections"]]
        fields = {k: r[i][:20000] for k, i in m.fields.items() if k in sections and r[i]}
        extra = "\n".join(f"{header[i]}: {r[i]}" for i in range(len(header)) if i not in used and r[i])
        if extra and sections:
            fields[sections[0]] = f"{fields.get(sections[0], '')}\n\n{extra}".strip()[:20000]
        labels = None if m.labels is None else [l.strip().replace(" ", "-")[:50] for l in r[m.labels].split(",") if l.strip()][:20]
        task = await create_task(NewTask(type_key=type_key, title=title, fields=fields, labels=labels), ctx)
        created.append(task["id"])
        if body.submit:
            try:
                await submit_task(ctx, await ctx.scoped.col("tasks").find_one({"_id": task["id"]}))
                submitted += 1
            except HTTPException:
                kept_as_draft.append(task["number"])  # required sections empty: stays a draft to finish
    return {"created": len(created), "submitted": submitted, "drafts_missing_fields": kept_as_draft, "skipped_empty": skipped}


@router.get("/export")
async def export_tasks(status: str = "", type: str = "", mine: bool = False, q: str = "",
                       ctx: Ctx = Depends(require("task.view"))):
    tasks = await list_tasks(status=status, type=type, mine=mine, q=q, number=None, limit=500, ctx=ctx)
    templates = {t["key"]: t for t in await ctx.scoped.col("templates").find({})}
    wb = Workbook()
    ws = wb.active
    ws.title = "Tasks"
    ws.append(["ID", "Title", "Type", "Status", "Author", "Labels", "Jira key", "Jira link", "Created", "Updated", "Details"])
    for t in tasks:
        tpl = templates.get(t["type_key"], {"name": t["type_key"], "sections": []})
        details = "\n\n".join(f"{s['label']}: {t['fields'][s['key']]}" for s in tpl["sections"] if t["fields"].get(s["key"]))
        ws.append([t["number"], t["title"], tpl["name"], t["status"].replace("_", " "), t["author"]["name"], ", ".join(t["labels"]),
                   t.get("jira_key") or "", t.get("jira_url") or "", t["created_at"].replace(tzinfo=None), t["updated_at"].replace(tzinfo=None), details])
    for col, width in zip("ABCDEFGHIJK", (8, 50, 14, 18, 20, 20, 12, 40, 18, 18, 80)):
        ws.column_dimensions[col].width = width
    ws.freeze_panes = "A2"
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    name = f"{ctx.workspace['slug']}-tasks-{date.today().isoformat()}.xlsx"
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})
