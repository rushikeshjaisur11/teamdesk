from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from pymongo import AsyncMongoClient

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

    @app.get("/api/health")
    async def health(request: Request):
        info = await request.app.state.db.command("buildInfo")
        return {"ok": True, "mongo": info["version"]}

    return app
