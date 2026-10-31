async def test_health_reports_mongo_version(make_client):
    c = await make_client()
    r = await c.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["mongo"].startswith("8.0")
