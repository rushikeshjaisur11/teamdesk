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
