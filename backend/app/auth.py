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


def default_user(settings: Settings) -> User | None:
    if not settings.dev_user_sub:
        return None
    return User(sub=settings.dev_user_sub, name=settings.dev_user_name or settings.dev_user_sub,
                email=settings.dev_user_email, groups=[g for g in settings.dev_user_groups.replace(",", " ").split() if g])


async def current_user(request: Request) -> User:
    data = request.session.get("user")
    if data:
        return User(**data)
    user = default_user(request.app.state.settings)
    if not user:
        raise HTTPException(401, "Please sign in.")
    return user


async def remember_user(db, user: User) -> None:
    await db.users.update_one(
        {"_id": user.sub},
        {"$set": {"name": user.name, "email": user.email, "groups": user.groups, "last_login": now()}},
        upsert=True)


async def sign_in(request: Request, user: User) -> None:
    """The one entry point for every sign-in method (interim form today, company login later)."""
    request.session["user"] = user.model_dump()
    await remember_user(request.app.state.db, user)


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
