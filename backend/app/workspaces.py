from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from app.access import create_workspace, resolve
from app.auth import User, current_user, is_platform_owner

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
