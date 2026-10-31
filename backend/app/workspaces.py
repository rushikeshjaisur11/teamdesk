from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, StringConstraints
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.access import DEFAULT_ROLES, PERMISSIONS, Ctx, require, resolve
from app.audit import record
from app.auth import User, current_user, is_platform_owner
from app.db import new_id, now
from app.rules import seed_rules
from app.scoped import Scoped
from app.templates import seed_templates


async def create_workspace(db, name: str, slug: str, admin_group: str) -> dict:
    ws = {"_id": new_id(), "name": name, "slug": slug, "archived": False, "roles": DEFAULT_ROLES,
          "group_mappings": [{"group": admin_group, "role": "admin"}], "created_at": now()}
    await db.workspaces.insert_one(ws)
    await seed_templates(Scoped(db, ws["_id"]))
    await seed_rules(Scoped(db, ws["_id"]))
    return ws


router = APIRouter()


async def platform_owner(request: Request, user: User = Depends(current_user)) -> User:
    if not is_platform_owner(user, request.app.state.settings):
        raise HTTPException(403, "Only platform owners can manage workspaces.")
    return user


class NewWorkspace(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: str = Field(pattern=r"^[a-z0-9-]{2,40}$")
    admin_group: str = Field(min_length=1, max_length=200)


def platform_view(ws: dict) -> dict:
    return {"id": ws["_id"], "name": ws["name"], "slug": ws["slug"], "archived": ws["archived"],
            "admin_groups": [m["group"] for m in ws["group_mappings"]
                             if "roles.manage" in ws["roles"].get(m["role"], {}).get("permissions", [])]}


@router.post("/api/platform/workspaces", status_code=201)
async def platform_create(body: NewWorkspace, request: Request, _: User = Depends(platform_owner)):
    try:
        ws = await create_workspace(request.app.state.db, body.name, body.slug, body.admin_group)
    except DuplicateKeyError:
        raise HTTPException(409, "That short name is taken.")
    return platform_view(ws)


@router.get("/api/platform/workspaces")
async def platform_list(request: Request, _: User = Depends(platform_owner)):
    return [platform_view(ws) async for ws in request.app.state.db.workspaces.find({}, sort=[("slug", 1)])]


@router.post("/api/platform/workspaces/{workspace_id}/archive", status_code=204)
async def platform_archive(workspace_id: str, request: Request, _: User = Depends(platform_owner)):
    r = await request.app.state.db.workspaces.update_one({"_id": workspace_id}, {"$set": {"archived": True}})
    if not r.matched_count:
        raise HTTPException(404, "Workspace not found.")
    return Response(status_code=204)


@router.get("/api/auth/me")
async def me(request: Request, user: User = Depends(current_user)):
    workspaces = []
    async for ws in request.app.state.db.workspaces.find({"archived": False}, sort=[("name", 1)]):
        roles, perms = resolve(ws, user.groups)
        if perms:
            workspaces.append({"id": ws["_id"], "name": ws["name"], "slug": ws["slug"],
                               "roles": roles, "permissions": sorted(perms)})
    return {"user": {"sub": user.sub, "name": user.name, "email": user.email,
                     "is_platform_owner": is_platform_owner(user, request.app.state.settings)},
            "workspaces": workspaces}


# ---- workspace settings (inside a workspace) ----
ws_router = APIRouter(prefix="/api/w/{workspace_id}")
LOCKOUT = "At least one group must map to a role that can manage roles, or nobody could fix access."


class Mapping(BaseModel):
    group: str = Field(min_length=1, max_length=200)
    role: str


class Role(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    permissions: list[str]


class SettingsPatch(BaseModel):
    name: str = Field(min_length=1, max_length=100)


RoleKey = Annotated[str, StringConstraints(pattern=r"^[a-z0-9_-]{2,30}$")]


def settings_view(ws: dict) -> dict:
    return {"name": ws["name"], "slug": ws["slug"], "group_mappings": ws["group_mappings"], "roles": ws["roles"]}


def check_lockout(mappings: list[dict], roles: dict) -> None:
    if not any("roles.manage" in roles.get(m["role"], {}).get("permissions", []) for m in mappings):
        raise HTTPException(422, LOCKOUT)


async def save(ctx: Ctx, fields: dict) -> dict:
    return await ctx.scoped.db.workspaces.find_one_and_update(
        {"_id": ctx.scoped.workspace_id}, {"$set": fields}, return_document=ReturnDocument.AFTER)


@ws_router.get("/settings")
async def get_settings(ctx: Ctx = Depends(require("settings.manage"))):
    return settings_view(ctx.workspace)


@ws_router.patch("/settings")
async def patch_settings(body: SettingsPatch, ctx: Ctx = Depends(require("settings.manage"))):
    ws = await save(ctx, {"name": body.name})
    await record(ctx, "settings.updated", "workspace", {"name": body.name})
    return settings_view(ws)


@ws_router.put("/group-mappings")
async def put_mappings(body: list[Mapping], ctx: Ctx = Depends(require("roles.manage"))):
    mappings = [m.model_dump() for m in body]
    for m in mappings:
        if m["role"] not in ctx.workspace["roles"]:
            raise HTTPException(422, f"Unknown role: {m['role']}.")
    check_lockout(mappings, ctx.workspace["roles"])
    ws = await save(ctx, {"group_mappings": mappings})
    await record(ctx, "group_mappings.updated", "workspace", {"group_mappings": mappings})
    return ws["group_mappings"]


@ws_router.put("/roles")
async def put_roles(body: dict[RoleKey, Role], ctx: Ctx = Depends(require("roles.manage"))):
    roles = {k: r.model_dump() for k, r in body.items()}
    for key, r in roles.items():
        bad = [p for p in r["permissions"] if p not in PERMISSIONS]
        if bad:
            raise HTTPException(422, f"Unknown permission in {key}: {', '.join(bad)}.")
    mappings = [m for m in ctx.workspace["group_mappings"] if m["role"] in roles]
    check_lockout(mappings, roles)
    ws = await save(ctx, {"roles": roles, "group_mappings": mappings})
    await record(ctx, "roles.updated", "workspace", {"roles": sorted(roles)})
    return settings_view(ws)


@ws_router.get("/members")
async def members(ctx: Ctx = Depends(require("task.view"))):
    result = []
    async for u in ctx.scoped.db.users.find({}, sort=[("name", 1)]):
        roles, _ = resolve(ctx.workspace, u["groups"])
        if roles:
            result.append({"sub": u["_id"], "name": u["name"], "email": u["email"], "roles": roles})
    return result
