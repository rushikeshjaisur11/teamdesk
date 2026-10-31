import httpx
from httpx import ASGITransport

from app.main import create_app
from tests.conftest import APP_HEADER, login


async def test_dev_login_then_session_user(make_client, db):
    c = await make_client()
    await login(c, "asha", ["g1"])
    r = await c.get("/api/auth/me")
    assert r.status_code == 200 and r.json()["user"]["sub"] == "asha"
    assert (await db.users.find_one({"_id": "asha"}))["groups"] == ["g1"]


async def test_me_requires_login(make_client):
    r = await (await make_client()).get("/api/auth/me")
    assert r.status_code == 401 and r.json()["detail"] == "Please sign in."


async def test_dev_login_disabled_returns_404(settings):
    settings.dev_login_enabled = False
    c = httpx.AsyncClient(transport=ASGITransport(app=create_app(settings)), base_url="http://t", headers=APP_HEADER)
    r = await c.post("/api/auth/dev-login", json={"sub": "x", "name": "x", "email": "", "groups": []})
    assert r.status_code == 404


async def test_logout_clears_session(make_client):
    c = await make_client()
    await login(c, "asha", [])
    await c.post("/api/auth/logout")
    assert (await c.get("/api/auth/me")).status_code == 401


async def test_platform_owner_flag(make_client):
    c = await make_client()
    await login(c, "own", ["teamdesk-platform-owners"])
    assert (await c.get("/api/auth/me")).json()["user"]["is_platform_owner"] is True


async def test_dev_login_rejects_blank_sub(make_client):
    c = await make_client()
    r = await c.post("/api/auth/dev-login", json={"sub": "", "name": "x", "email": "", "groups": []})
    assert r.status_code == 422


async def test_default_user_from_env_when_no_session(settings, db):
    settings.dev_user_sub = "asha@corp.test"
    settings.dev_user_name = "Asha Rao"
    settings.dev_user_groups = "grp-a, grp-b"
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        c = httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://t", headers=APP_HEADER)
        me = (await c.get("/api/auth/me")).json()["user"]
        assert (me["sub"], me["name"]) == ("asha@corp.test", "Asha Rao")
        assert (await db.users.find_one({"_id": "asha@corp.test"}))["groups"] == ["grp-a", "grp-b"]


async def test_session_user_wins_over_default(settings, make_client, app):
    app.state.settings.dev_user_sub = "asha@corp.test"
    c = await make_client()
    await login(c, "dev", [])
    assert (await c.get("/api/auth/me")).json()["user"]["sub"] == "dev"
