from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, StringConstraints, field_validator
from pymongo.errors import DuplicateKeyError

from app.access import Ctx, require
from app.audit import record
from app.scoped import Scoped, out


def _s(key, label, required, hint):
    return {"key": key, "label": label, "required": required, "hint": hint}


DEFAULT_TEMPLATES = [
    {"key": "story", "name": "Story", "jira_issue_type": "Story", "default_labels": [], "sections": [
        _s("context", "Context", True, "Why this work exists, in one to three lines."),
        _s("scope", "Scope", True, "What changes. One bullet per change."),
        _s("acceptance", "Acceptance criteria", True, "Testable statements that prove it's done."),
        _s("out_of_scope", "Out of scope", False, "What this task deliberately does not cover.")]},
    {"key": "bug", "name": "Bug", "jira_issue_type": "Bug", "default_labels": [], "sections": [
        _s("steps", "Steps to reproduce", True, "Numbered steps someone else can follow."),
        _s("expected", "Expected", True, "What should happen."),
        _s("actual", "Actual", True, "What happens instead, with error text if any."),
        _s("context", "Context", False, "Environment, version, links to logs.")]},
    {"key": "spike", "name": "Spike", "jira_issue_type": "Task", "default_labels": [], "sections": [
        _s("question", "Question to answer", True, "The one question this spike answers."),
        _s("timebox", "Timebox", True, "How long before we stop, e.g. 2 days."),
        _s("output", "Expected output", True, "What you'll hand back: doc, prototype, recommendation.")]},
    {"key": "tech_debt", "name": "Tech debt", "jira_issue_type": "Task", "default_labels": [], "sections": [
        _s("context", "Context", True, "What the debt is and what it costs us today."),
        _s("scope", "Scope", True, "What changes. One bullet per change."),
        _s("acceptance", "Acceptance criteria", True, "Testable statements that prove it's done.")]},
]


async def seed_templates(scoped: Scoped) -> None:
    for t in DEFAULT_TEMPLATES:
        await scoped.col("templates").insert({**t, "archived": False})


class Section(BaseModel):
    key: Annotated[str, StringConstraints(pattern=r"^[a-z0-9_]{1,30}$")]
    label: str = Field(min_length=1, max_length=80)
    required: bool = False
    hint: str = Field("", max_length=300)
    jira_field: str = Field("", pattern=r"^([a-z]+|customfield_\d+)?$", max_length=40)  # empty: goes into the description


class TemplateBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    jira_issue_type: str = Field(min_length=1, max_length=80)
    sections: list[Section] = Field(min_length=1, max_length=20)
    default_labels: list[Annotated[str, StringConstraints(pattern=r"^\S{1,50}$")]] = []
    jira_project_key: str = Field("", pattern=r"^([A-Z][A-Z0-9_]{1,19})?$")  # empty: the connection's project
    jira_extra_fields: dict[str, Any] = Field(default_factory=dict, max_length=30)  # merged into the Jira "fields", e.g. components

    @field_validator("sections")
    @classmethod
    def unique_keys(cls, v):
        if len({s.key for s in v}) != len(v):
            raise ValueError("Section keys must be unique.")
        return v


class NewTemplate(TemplateBody):
    key: Annotated[str, StringConstraints(pattern=r"^[a-z0-9_]{2,30}$")]


async def get_template(ctx: Ctx, key: str) -> dict:
    t = await ctx.scoped.col("templates").find_one({"key": key, "archived": False})
    if not t:
        raise HTTPException(422, f"Unknown task type: {key}.")
    return t


router = APIRouter(prefix="/api/w/{workspace_id}/templates")


def view(t: dict) -> dict:
    d = out(t)
    d.pop("created_at", None)
    return d


@router.get("")
async def list_templates(ctx: Ctx = Depends(require("task.view"))):
    return [view(t) for t in await ctx.scoped.col("templates").find({"archived": False}, sort=[("created_at", 1), ("_id", 1)])]


@router.post("", status_code=201)
async def create_template(body: NewTemplate, ctx: Ctx = Depends(require("settings.manage"))):
    try:
        t = await ctx.scoped.col("templates").insert({**body.model_dump(), "archived": False})
    except DuplicateKeyError:
        raise HTTPException(409, "A task type with that key already exists.")
    await record(ctx, "template.created", body.key)
    return view(t)


@router.put("/{key}")
async def update_template(key: str, body: TemplateBody, ctx: Ctx = Depends(require("settings.manage"))):
    t = await ctx.scoped.col("templates").update({"key": key, "archived": False}, {"$set": body.model_dump()})
    if not t:
        raise HTTPException(404, "Task type not found.")
    await record(ctx, "template.updated", key)
    return view(t)


@router.delete("/{key}", status_code=204)
async def archive_template(key: str, ctx: Ctx = Depends(require("settings.manage"))):
    if not await ctx.scoped.col("templates").update({"key": key, "archived": False}, {"$set": {"archived": True}}):
        raise HTTPException(404, "Task type not found.")
    await record(ctx, "template.archived", key)
    return Response(status_code=204)
