"""Docs space per workspace: nested folders, Markdown docs, keyword search and version history.

Saving sends the version you opened; if someone saved after that you get a 409 and can choose to overwrite."""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.access import Ctx, require
from app.audit import record
from app.db import now
from app.scoped import out

router = APIRouter(prefix="/api/w/{workspace_id}/docs")
TEXT_SCORE = [("score", {"$meta": "textScore"})]


class FolderBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    parent_id: str | None = None


class DocBody(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field("", max_length=200_000)
    folder_id: str | None = None


class DocSave(DocBody):
    base_version: int  # the version the editor opened
    force: bool = False  # overwrite someone else's newer save


def who(ctx: Ctx) -> dict:
    return {"sub": ctx.user.sub, "name": ctx.user.name}


def summary(d: dict) -> dict:
    v = out(d)
    v.pop("body", None)
    v.pop("score", None)
    return v


async def check_folder(ctx: Ctx, folder_id: str | None) -> None:
    if folder_id and not await ctx.scoped.col("doc_folders").find_one({"_id": folder_id}):
        raise HTTPException(422, "That folder doesn't exist.")


# ---- folders ----

@router.get("/folders")
async def list_folders(ctx: Ctx = Depends(require("task.view"))):
    return [out(f) for f in await ctx.scoped.col("doc_folders").find({}, sort=[("name", 1)])]


@router.post("/folders", status_code=201)
async def create_folder(body: FolderBody, ctx: Ctx = Depends(require("doc.manage_folders"))):
    await check_folder(ctx, body.parent_id)
    f = await ctx.scoped.col("doc_folders").insert({"name": body.name.strip(), "parent_id": body.parent_id})
    await record(ctx, "doc_folder.created", f["_id"], {"name": f["name"]})
    return out(f)


@router.patch("/folders/{folder_id}")
async def rename_folder(folder_id: str, body: FolderBody, ctx: Ctx = Depends(require("doc.manage_folders"))):
    if body.parent_id == folder_id:
        raise HTTPException(422, "A folder can't be inside itself.")
    await check_folder(ctx, body.parent_id)
    f = await ctx.scoped.col("doc_folders").update({"_id": folder_id}, {"$set": {"name": body.name.strip(), "parent_id": body.parent_id}})
    if not f:
        raise HTTPException(404, "Folder not found.")
    return out(f)


@router.delete("/folders/{folder_id}", status_code=204)
async def delete_folder(folder_id: str, ctx: Ctx = Depends(require("doc.manage_folders"))):
    if await ctx.scoped.col("doc_folders").count({"parent_id": folder_id}) or await ctx.scoped.col("docs").count({"folder_id": folder_id}):
        raise HTTPException(409, "Move or delete what's inside this folder first.")
    if not await ctx.scoped.col("doc_folders").delete({"_id": folder_id}):
        raise HTTPException(404, "Folder not found.")
    await record(ctx, "doc_folder.deleted", folder_id)
    return Response(status_code=204)


# ---- docs ----

@router.get("")
async def list_docs(q: str = "", limit: int = Query(500, ge=1, le=1000), ctx: Ctx = Depends(require("task.view"))):
    """Without q: every doc's title and folder (for the tree). With q: best keyword matches with a snippet."""
    if not q.strip():
        return [summary(d) for d in await ctx.scoped.col("docs").find({}, sort=[("title", 1)], limit=limit)]
    hits = await ctx.scoped.col("docs").find({"$text": {"$search": q}}, sort=TEXT_SCORE, limit=min(limit, 20))
    return [summary(d) | {"snippet": snippet(d["body"], q)} for d in hits]


def snippet(body: str, q: str) -> str:
    low, words = body.lower(), [w for w in q.lower().split() if w]
    at = min([i for w in words if (i := low.find(w)) >= 0], default=0)
    start = max(0, at - 60)
    return ("…" if start else "") + " ".join(body[start:start + 200].split()) + ("…" if start + 200 < len(body) else "")


@router.post("", status_code=201)
async def create_doc(body: DocBody, ctx: Ctx = Depends(require("doc.edit"))):
    await check_folder(ctx, body.folder_id)
    t = now()
    d = await ctx.scoped.col("docs").insert({**body.model_dump(), "version": 1, "updated_at": t, "updated_by": who(ctx), "created_by": who(ctx)})
    await record(ctx, "doc.created", d["_id"], {"title": d["title"]})
    return out(d)


async def load(ctx: Ctx, doc_id: str) -> dict:
    d = await ctx.scoped.col("docs").find_one({"_id": doc_id})
    if not d:
        raise HTTPException(404, "Doc not found.")
    return d


@router.get("/{doc_id}")
async def get_doc(doc_id: str, ctx: Ctx = Depends(require("task.view"))):
    return out(await load(ctx, doc_id))


@router.put("/{doc_id}")
async def save_doc(doc_id: str, body: DocSave, ctx: Ctx = Depends(require("doc.edit"))):
    await check_folder(ctx, body.folder_id)
    old = await load(ctx, doc_id)
    if old["version"] != body.base_version and not body.force:
        raise HTTPException(409, f"{old['updated_by']['name']} saved this doc after you opened it. Copy your changes, reload, or save anyway to overwrite.")
    # Keep the previous text before replacing it; the version check makes concurrent saves fail instead of silently interleaving.
    await ctx.scoped.col("doc_versions").insert({"doc_id": doc_id, "version": old["version"], "title": old["title"], "body": old["body"],
                                                 "saved_at": old["updated_at"], "saved_by": old["updated_by"]})
    d = await ctx.scoped.col("docs").update({"_id": doc_id, "version": old["version"]}, {
        "$set": {"title": body.title, "body": body.body, "folder_id": body.folder_id, "updated_at": now(), "updated_by": who(ctx)},
        "$inc": {"version": 1}})
    if not d:
        raise HTTPException(409, "Someone saved this doc at the same moment. Reload and try again.")
    return out(d)


@router.delete("/{doc_id}", status_code=204)
async def delete_doc(doc_id: str, ctx: Ctx = Depends(require("doc.edit"))):
    d = await load(ctx, doc_id)
    await ctx.scoped.col("docs").delete({"_id": doc_id})
    await record(ctx, "doc.deleted", doc_id, {"title": d["title"]})
    return Response(status_code=204)


@router.get("/{doc_id}/versions")
async def versions(doc_id: str, ctx: Ctx = Depends(require("task.view"))):
    await load(ctx, doc_id)
    return [out(v) for v in await ctx.scoped.col("doc_versions").find({"doc_id": doc_id}, sort=[("version", -1)], limit=50)]
