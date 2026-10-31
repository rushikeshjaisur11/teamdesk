from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.access import Ctx, require
from app.scoped import out


class NewIdea(BaseModel):
    text: str = Field(min_length=1, max_length=2000)

    def model_post_init(self, _):
        self.text = self.text.strip()


router = APIRouter(prefix="/api/w/{workspace_id}/ideas")


@router.get("")
async def list_ideas(ctx: Ctx = Depends(require("task.create"))):
    found = await ctx.scoped.col("ideas").find({"owner_sub": ctx.user.sub, "promoted_task_id": None},
                                               sort=[("created_at", -1), ("_id", -1)])
    return [out(i) for i in found]


@router.post("", status_code=201)
async def create_idea(body: NewIdea, ctx: Ctx = Depends(require("task.create"))):
    if not body.text:
        raise HTTPException(422, "Write something first.")
    idea = await ctx.scoped.col("ideas").insert({"owner_sub": ctx.user.sub, "text": body.text, "promoted_task_id": None})
    return out(idea)


@router.delete("/{idea_id}", status_code=204)
async def delete_idea(idea_id: str, ctx: Ctx = Depends(require("task.create"))):
    if not await ctx.scoped.col("ideas").delete({"_id": idea_id, "owner_sub": ctx.user.sub}):
        raise HTTPException(404, "Idea not found.")
    return Response(status_code=204)
