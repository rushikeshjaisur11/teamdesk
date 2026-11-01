from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware
from pymongo import AsyncMongoClient

from app import approvals, audit, calendar_feed, auth, docs, jira, me, meetings, notifications, rules, tasks, teams, templates, workspaces
from app.config import APP_NAME, Settings
from app.db import ensure_indexes


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await ensure_indexes(app.state.db)
        if user := auth.default_user(settings):
            await auth.remember_user(app.state.db, user)
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
    app.include_router(workspaces.ws_router)
    app.include_router(audit.router)
    app.include_router(templates.router)
    app.include_router(tasks.router)
    app.include_router(jira.router)
    app.include_router(docs.router)
    app.include_router(meetings.router)
    app.include_router(me.router)
    app.include_router(teams.router)
    app.include_router(teams.ws_router)
    app.include_router(calendar_feed.me_router)
    app.include_router(calendar_feed.public_router)
    app.include_router(approvals.router)
    app.include_router(rules.router)
    app.include_router(notifications.router)

    @app.middleware("http")
    async def require_app_header(request: Request, call_next):
        # Blocks cross-site form posts: browsers can't add this header to a cross-origin request
        # without a CORS preflight, which this API never grants. Matters most with the env default user.
        if request.method not in ("GET", "HEAD", "OPTIONS") and request.url.path.startswith("/api/")                 and request.headers.get("x-requested-with") != APP_NAME:
            return JSONResponse({"detail": "Missing the TeamDesk request header."}, status_code=403)
        return await call_next(request)

    @app.get("/api/health")
    async def health(request: Request):
        info = await request.app.state.db.command("buildInfo")
        return {"ok": True, "mongo": info["version"]}

    return app
