from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request

from app.auth import User, current_user
from app.db import new_id, now
from app.scoped import Scoped

PERMISSIONS = (
    "task.view", "task.create", "task.edit_any", "task.approve", "jira.view_all",
    "doc.edit", "doc.manage_folders", "settings.manage", "connections.manage", "roles.manage",
)

DEFAULT_ROLES = {
    "admin": {"name": "Admin", "permissions": list(PERMISSIONS)},
    "approver": {"name": "Approver", "permissions": ["task.view", "task.create", "task.approve", "jira.view_all", "doc.edit"]},
    "member": {"name": "Member", "permissions": ["task.view", "task.create", "doc.edit"]},
    "viewer": {"name": "Viewer", "permissions": ["task.view"]},
}


def resolve(workspace: dict, groups: list[str]) -> tuple[list[str], set[str]]:
    roles = workspace["roles"]
    matched = sorted({m["role"] for m in workspace["group_mappings"] if m["group"] in groups and m["role"] in roles})
    perms = {p for r in matched for p in roles[r]["permissions"]}
    return matched, perms


@dataclass
class Ctx:
    user: User
    workspace: dict
    roles: list[str]
    perms: set[str]
    scoped: Scoped

    def can(self, perm: str) -> bool:
        return perm in self.perms


async def workspace_ctx(workspace_id: str, request: Request, user: User = Depends(current_user)) -> Ctx:
    db = request.app.state.db
    ws = await db.workspaces.find_one({"_id": workspace_id, "archived": False})
    roles, perms = resolve(ws, user.groups) if ws else ([], set())
    if not perms:
        raise HTTPException(404, "Workspace not found.")
    return Ctx(user, ws, roles, perms, Scoped(db, workspace_id))


def require(perm: str):
    async def dep(ctx: Ctx = Depends(workspace_ctx)) -> Ctx:
        if not ctx.can(perm):
            raise HTTPException(403, "You don't have permission to do this. Ask a workspace admin.")
        return ctx
    return dep


async def create_workspace(db, name: str, slug: str, admin_group: str) -> dict:
    ws = {"_id": new_id(), "name": name, "slug": slug, "archived": False, "roles": DEFAULT_ROLES,
          "group_mappings": [{"group": admin_group, "role": "admin"}], "created_at": now()}
    await db.workspaces.insert_one(ws)
    return ws
