from dataclasses import dataclass

from fastapi import BackgroundTasks, Depends, HTTPException, Request

from app.auth import User, current_user, is_platform_owner
from app.config import Settings
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


def resolve_user(workspace: dict, user: User, settings: Settings) -> tuple[list[str], set[str]]:
    """Platform owners create and archive workspaces, so they can also open and fix any of them."""
    roles, perms = resolve(workspace, user.groups)
    if is_platform_owner(user, settings):
        return roles or ["admin"], set(PERMISSIONS)
    return roles, perms


@dataclass
class Ctx:
    user: User
    workspace: dict
    roles: list[str]
    perms: set[str]
    scoped: Scoped
    settings: Settings
    background: BackgroundTasks

    def can(self, perm: str) -> bool:
        return perm in self.perms


async def workspace_ctx(workspace_id: str, request: Request, background: BackgroundTasks,
                        user: User = Depends(current_user)) -> Ctx:
    db = request.app.state.db
    ws = await db.workspaces.find_one({"_id": workspace_id, "archived": False})
    roles, perms = resolve_user(ws, user, request.app.state.settings) if ws else ([], set())
    if not perms:
        raise HTTPException(404, "Workspace not found.")
    return Ctx(user, ws, roles, perms, Scoped(db, workspace_id), request.app.state.settings, background)


def require(perm: str):
    async def dep(ctx: Ctx = Depends(workspace_ctx)) -> Ctx:
        if not ctx.can(perm):
            raise HTTPException(403, "You don't have permission to do this. Ask a workspace admin.")
        return ctx
    return dep
