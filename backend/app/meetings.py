"""Meeting notes per workspace, grouped by series (e.g. "Daily standup"). Paste or upload a transcript
(.vtt / .docx from Teams, or .txt / .md); AI writes a summary and proposes tasks. Nothing becomes a task until
someone ticks it: the app then creates drafts through the normal task API and records them here."""
import base64
import binascii
import io
import re
import zipfile
from datetime import date
from xml.etree import ElementTree

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app import ai
from app.access import Ctx, require
from app.db import now
from app.scoped import out

router = APIRouter(prefix="/api/w/{workspace_id}/meetings")
MAX_UPLOAD = 5 * 1024 * 1024
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class Proposed(BaseModel):
    title: str = Field(max_length=200)
    details: str = Field("", max_length=4000)
    type_key: str = Field(max_length=30)
    owner: str = Field("", max_length=200)


class Created(BaseModel):
    id: str = Field(max_length=40)
    number: int
    title: str = Field(max_length=200)


class MeetingBody(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    series: str = Field("", max_length=100)
    date: date
    notes: str = Field("", max_length=200_000)
    summary: str = Field("", max_length=50_000)
    proposed: list[Proposed] = Field(default_factory=list, max_length=50)
    created: list[Created] = Field(default_factory=list, max_length=200)  # draft tasks made from this meeting


class Upload(BaseModel):
    filename: str = Field(max_length=200)
    data: str  # base64


def summary_view(m: dict) -> dict:
    v = out(m)
    for k in ("notes", "summary", "proposed"):
        v.pop(k, None)
    return v


def view(m: dict) -> dict:
    return out(m)


async def load(ctx: Ctx, meeting_id: str) -> dict:
    m = await ctx.scoped.col("meetings").find_one({"_id": meeting_id})
    if not m:
        raise HTTPException(404, "Meeting not found.")
    return m


def fields(body: MeetingBody) -> dict:
    return {**body.model_dump(), "date": body.date.isoformat(), "series": body.series.strip(), "title": body.title.strip()}


@router.get("")
async def list_meetings(ctx: Ctx = Depends(require("task.view"))):
    return [summary_view(m) for m in await ctx.scoped.col("meetings").find({}, sort=[("date", -1), ("created_at", -1)], limit=500)]


@router.post("", status_code=201)
async def create_meeting(body: MeetingBody, ctx: Ctx = Depends(require("task.create"))):
    m = await ctx.scoped.col("meetings").insert({**fields(body), "created_by": {"sub": ctx.user.sub, "name": ctx.user.name}, "updated_at": now()})
    return view(m)


@router.get("/{meeting_id}")
async def get_meeting(meeting_id: str, ctx: Ctx = Depends(require("task.view"))):
    return view(await load(ctx, meeting_id))


@router.put("/{meeting_id}")
async def save_meeting(meeting_id: str, body: MeetingBody, ctx: Ctx = Depends(require("task.create"))):
    m = await ctx.scoped.col("meetings").update({"_id": meeting_id}, {"$set": {**fields(body), "updated_at": now()}})
    if not m:
        raise HTTPException(404, "Meeting not found.")
    return view(m)


@router.delete("/{meeting_id}", status_code=204)
async def delete_meeting(meeting_id: str, ctx: Ctx = Depends(require("task.create"))):
    if not await ctx.scoped.col("meetings").delete({"_id": meeting_id}):
        raise HTTPException(404, "Meeting not found.")
    return Response(status_code=204)


@router.post("/{meeting_id}/extract")
async def extract(meeting_id: str, ctx: Ctx = Depends(require("task.create"))):
    """Runs AI on the saved notes and stores the summary and proposed tasks on the meeting."""
    if not ai.enabled(ctx.settings):
        raise HTTPException(503, "AI is turned off for TeamDesk. Ask the platform team to set AI_ENABLED and VERTEX_API_KEY.")
    m = await load(ctx, meeting_id)
    if len(m["notes"].strip()) < 20:
        raise HTTPException(422, "Add the notes or upload the transcript first.")
    types = {t["key"]: t["name"] for t in await ctx.scoped.col("templates").find({"archived": False}, sort=[("created_at", 1)])}
    try:
        r = await ai.meeting_notes(ctx.settings, m["notes"], types)
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        raise HTTPException(502, "The AI couldn't read these notes just now. Try again in a minute, or shorten them.")
    m = await ctx.scoped.col("meetings").update({"_id": meeting_id}, {"$set": {"summary": r["summary"], "proposed": r["tasks"], "updated_at": now()}})
    return view(m)


# ---- transcript files ----

def vtt_text(raw: str) -> str:
    """Teams .vtt: drop the header, cue numbers and timestamps; turn <v Name>text</v> into "Name: text"; merge a speaker's runs."""
    lines: list[str] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or line == "WEBVTT" or "-->" in line or line.isdigit() or line.startswith(("NOTE", "STYLE")):
            continue
        line = re.sub(r"<v\s+([^>]+)>(.*?)(</v>)?$", r"\1: \2", line)
        line = re.sub(r"<[^>]+>", "", line).strip()
        if not line:
            continue
        speaker, _, said = line.partition(": ")
        if lines and said and lines[-1].startswith(f"{speaker}: "):
            lines[-1] += f" {said}"
        else:
            lines.append(line)
    return "\n".join(lines)


def docx_text(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        root = ElementTree.fromstring(z.read("word/document.xml"))
    return "\n".join(t for p in root.iter(f"{W}p") if (t := "".join(x.text or "" for x in p.iter(f"{W}t")).strip()))


@router.post("/parse")
async def parse_transcript(body: Upload, ctx: Ctx = Depends(require("task.create"))):
    try:
        data = base64.b64decode(body.data, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "The file didn't upload correctly. Try again.")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "That file is over 5 MB. Upload the transcript only, without recordings.")
    name = body.filename.lower()
    try:
        if name.endswith(".docx"):
            text = docx_text(data)
        elif name.endswith((".vtt", ".txt", ".md")):
            raw = data.decode("utf-8-sig", errors="replace")
            text = vtt_text(raw) if name.endswith(".vtt") else raw.strip()
        else:
            raise HTTPException(415, "Upload a .vtt, .docx, .txt or .md file. In Teams: Recap, Transcript, Download.")
    except (zipfile.BadZipFile, KeyError, ElementTree.ParseError):
        raise HTTPException(422, "That .docx couldn't be read. Save it again from Word or Teams and retry.")
    if not text.strip():
        raise HTTPException(422, "That file has no text in it.")
    return {"text": text}
