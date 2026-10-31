from typing import Annotated

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field, StringConstraints

from app.config import Settings
from app.db import now

Group = Annotated[str, StringConstraints(min_length=1, max_length=200)]


class User(BaseModel):
    sub: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(max_length=200)
    groups: list[Group] = Field(max_length=200)


def is_platform_owner(user: User, settings: Settings) -> bool:
    return settings.platform_owner_group in user.groups


async def current_user(request: Request) -> User:
    data = request.session.get("user")
    if not data:
        raise HTTPException(401, "Please sign in.")
    return User(**data)


async def sign_in(request: Request, user: User) -> None:
    """The one entry point for every sign-in method (interim form today, company login later)."""
    request.session["user"] = user.model_dump()
    await request.app.state.db.users.update_one(
        {"_id": user.sub},
        {"$set": {"name": user.name, "email": user.email, "groups": user.groups, "last_login": now()}},
        upsert=True)


router = APIRouter(prefix="/api/auth")


@router.post("/dev-login", status_code=204)
async def dev_login(request: Request, user: User):
    if not request.app.state.settings.dev_login_enabled:
        raise HTTPException(404, "Not found")
    await sign_in(request, user)
    return Response(status_code=204)


@router.post("/logout", status_code=204)
async def logout(request: Request):
    request.session.clear()
    return Response(status_code=204)
