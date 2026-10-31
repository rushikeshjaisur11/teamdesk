from fastapi import APIRouter, Depends, Query

from app.access import Ctx, require
from app.db import now
from app.scoped import out


async def record(ctx: Ctx, action: str, target: str, data: dict | None = None) -> None:
    await ctx.scoped.col("audit").insert({"at": now(), "actor": {"sub": ctx.user.sub, "name": ctx.user.name},
                                          "action": action, "target": target, "data": data or {}})


router = APIRouter(prefix="/api/w/{workspace_id}")


@router.get("/audit")
async def audit_list(limit: int = Query(100, ge=1, le=500), ctx: Ctx = Depends(require("settings.manage"))):
    return [out(d) for d in await ctx.scoped.col("audit").find({}, sort=[("at", -1), ("_id", -1)], limit=limit)]
