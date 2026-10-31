from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from starlette.middleware.sessions import SessionMiddleware
from pymongo import AsyncMongoClient

from app import auth, workspaces
from app.config import APP_NAME, Settings
from app.db import ensure_indexes


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await ensure_indexes(app.state.db)
        yield
        await app.state.mongo.close()

    app = FastAPI(title=APP_NAME, lifespan=lifespan)
    app.state.settings = settings
    app.state.mongo = AsyncMongoClient(settings.mongo_uri, tz_aware=True)
    app.state.db = app.state.mongo[settings.mongo_db]
    app.add_middleware(SessionMiddleware, secret_key=settings.session_secret, max_age=settings.session_max_age,
                       https_only=settings.https_only_cookies, same_site="lax")
    app.include_router(auth.router)
    app.include_router(workspaces.router)

    @app.get("/api/health")
    async def health(request: Request):
        info = await request.app.state.db.command("buildInfo")
        return {"ok": True, "mongo": info["version"]}

    return app
