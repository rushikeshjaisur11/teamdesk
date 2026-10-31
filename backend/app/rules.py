from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.access import Ctx, require
from app.audit import record
from app.scoped import Scoped, out
from app.task_flow import rule_matches

DEFAULT_RULES = [
    {"name": "Developer tasks skip the queue", "enabled": True, "type_keys": [], "author_roles": ["member"], "labels_any": []},
    {"name": "Tech tasks skip the queue", "enabled": True, "type_keys": ["tech_debt"], "author_roles": [], "labels_any": []},
]


async def seed_rules(scoped: Scoped) -> None:
    for r in DEFAULT_RULES:
        await scoped.col("rules").insert(dict(r))


async def find_matching_rule(ctx: Ctx, task: dict) -> dict | None:
    for rule in await ctx.scoped.col("rules").find({"enabled": True}, sort=[("created_at", 1), ("_id", 1)]):
        if rule_matches(rule, task["type_key"], ctx.roles, task["labels"]):
            return rule
    return None


class RuleBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    enabled: bool = True
    type_keys: list[str] = Field([], max_length=50)
    author_roles: list[str] = Field([], max_length=50)
    labels_any: list[str] = Field([], max_length=50)

    def checked(self) -> dict:
        if not (self.type_keys or self.author_roles or self.labels_any):
            raise HTTPException(422, "A rule needs at least one condition.")
        return self.model_dump()


router = APIRouter(prefix="/api/w/{workspace_id}/rules")


def view(r: dict) -> dict:
    d = out(r)
    d.pop("created_at", None)
    return d


@router.get("")
async def list_rules(ctx: Ctx = Depends(require("settings.manage"))):
    return [view(r) for r in await ctx.scoped.col("rules").find({}, sort=[("created_at", 1), ("_id", 1)])]


@router.post("", status_code=201)
async def create_rule(body: RuleBody, ctx: Ctx = Depends(require("settings.manage"))):
    rule = await ctx.scoped.col("rules").insert(body.checked())
    await record(ctx, "rule.created", rule["_id"], {"name": body.name})
    return view(rule)


@router.put("/{rule_id}")
async def update_rule(rule_id: str, body: RuleBody, ctx: Ctx = Depends(require("settings.manage"))):
    rule = await ctx.scoped.col("rules").update({"_id": rule_id}, {"$set": body.checked()})
    if not rule:
        raise HTTPException(404, "Rule not found.")
    await record(ctx, "rule.updated", rule_id, body.model_dump())
    return view(rule)


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(rule_id: str, ctx: Ctx = Depends(require("settings.manage"))):
    if not await ctx.scoped.col("rules").delete({"_id": rule_id}):
        raise HTTPException(404, "Rule not found.")
    await record(ctx, "rule.deleted", rule_id)
    return Response(status_code=204)
