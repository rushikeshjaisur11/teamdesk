import os

import httpx
import pytest
from httpx import ASGITransport

from app.config import Settings
from app.db import ensure_indexes
from app.main import create_app


@pytest.fixture
def settings():
    return Settings(
        mongo_uri=os.environ.get("TEST_MONGO_URI", "mongodb://localhost:27018"),
        mongo_db="teamdesk_test",
        session_secret="test",
        https_only_cookies=False,
        dev_login_enabled=True,
    )


@pytest.fixture
async def app(settings):
    app = create_app(settings)
    await app.state.mongo.drop_database(settings.mongo_db)
    await ensure_indexes(app.state.db)
    yield app
    await app.state.mongo.close()


@pytest.fixture
def db(app):
    return app.state.db


@pytest.fixture
async def make_client(app):
    clients = []

    async def make():
        c = httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t")
        clients.append(c)
        return c

    yield make
    for c in clients:
        await c.aclose()


async def login(client, sub: str, groups: list[str], name: str | None = None):
    r = await client.post("/api/auth/dev-login", json={
        "sub": sub, "name": name or sub.title(), "email": f"{sub}@example.com", "groups": groups})
    assert r.status_code == 204, r.text


OWNER = ["teamdesk-platform-owners"]


async def make_workspace(make_client, slug: str = "team", admin_group: str = "g-admin") -> str:
    c = await make_client()
    await login(c, "platform-owner", OWNER)
    r = await c.post("/api/platform/workspaces", json={"name": slug.title(), "slug": slug, "admin_group": admin_group})
    assert r.status_code == 201, r.text
    return r.json()["id"]


STORY = {"type_key": "story", "title": "Add retry to loader",
         "fields": {"context": "flaky", "scope": "loader", "acceptance": "retries 3x"}}
ROLE_GROUPS = {"adm": "g-admin", "appr": "g-appr", "dev": "g-dev", "view": "g-view"}


@pytest.fixture
async def ws_with_dev(make_client):
    wid = await make_workspace(make_client)
    clients = {}
    for sub, group in ROLE_GROUPS.items():
        clients[sub] = await make_client()
        await login(clients[sub], sub, [group])
    r = await clients["adm"].put(f"/api/w/{wid}/group-mappings", json=[
        {"group": "g-admin", "role": "admin"}, {"group": "g-appr", "role": "approver"},
        {"group": "g-dev", "role": "member"}, {"group": "g-view", "role": "viewer"}])
    assert r.status_code == 200, r.text
    return wid, clients
