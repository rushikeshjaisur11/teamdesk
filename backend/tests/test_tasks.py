from tests.conftest import STORY, make_workspace


async def create(c, wid, who="dev", **over):
    r = await c[who].post(f"/api/w/{wid}/tasks", json={**STORY, **over})
    assert r.status_code == 201, r.text
    return r.json()


async def test_create_draft_then_submit(ws_with_dev):
    wid, c = ws_with_dev
    t = await create(c, wid)
    assert (t["status"], t["number"], t["author"]["sub"]) == ("draft", 1, "dev")
    assert "search_text" not in t and "workspace_id" not in t
    t = (await c["dev"].post(f"/api/w/{wid}/tasks/{t['id']}/submit")).json()
    assert t["status"] == "pending_approval" and t["submitted_at"]
    kinds = [a["kind"] for a in (await c["dev"].get(f"/api/w/{wid}/tasks/{t['id']}/activity")).json()]
    assert kinds == ["created", "submitted"]


async def test_submit_with_missing_required_field_lists_fields(ws_with_dev):
    wid, c = ws_with_dev
    r = await c["dev"].post(f"/api/w/{wid}/tasks", json={**STORY, "fields": {"context": "x"}, "submit": True})
    assert r.status_code == 422
    assert r.json()["detail"] == {"message": "Some required fields are empty.",
                                  "fields": {"scope": "Scope is required.", "acceptance": "Acceptance criteria is required."}}


async def test_draft_may_be_incomplete(ws_with_dev):
    wid, c = ws_with_dev
    t = await create(c, wid, fields={})
    assert t["status"] == "draft"


async def test_viewer_cannot_create(ws_with_dev):
    wid, c = ws_with_dev
    assert (await c["view"].post(f"/api/w/{wid}/tasks", json=STORY)).status_code == 403


async def test_unknown_type_and_field_key_are_422(ws_with_dev):
    wid, c = ws_with_dev
    assert (await c["dev"].post(f"/api/w/{wid}/tasks", json={**STORY, "type_key": "nope"})).status_code == 422
    bad = {**STORY, "fields": {**STORY["fields"], "colour": "blue"}}
    assert (await c["dev"].post(f"/api/w/{wid}/tasks", json=bad)).status_code == 422


async def test_list_filters(ws_with_dev):
    wid, c = ws_with_dev
    a = await create(c, wid, title="Mine draft")
    await create(c, wid, who="appr", title="Theirs", submit=True)
    titles = lambda r: [t["title"] for t in r.json()]
    assert titles(await c["dev"].get(f"/api/w/{wid}/tasks", params={"mine": "true"})) == ["Mine draft"]
    assert titles(await c["dev"].get(f"/api/w/{wid}/tasks", params={"status": "pending_approval"})) == ["Theirs"]
    assert titles(await c["dev"].get(f"/api/w/{wid}/tasks")) == ["Theirs", "Mine draft"]
    assert (await c["dev"].get(f"/api/w/{wid}/tasks/{a['id']}")).json()["title"] == "Mine draft"


async def test_search_and_similar(ws_with_dev):
    wid, c = ws_with_dev
    await create(c, wid)
    await create(c, wid, title="Dashboard colours", fields={"context": "ui", "scope": "css", "acceptance": "ok"})
    hits = (await c["dev"].get(f"/api/w/{wid}/tasks", params={"q": "retry"})).json()
    assert [h["title"] for h in hits] == ["Add retry to loader"]
    sim = (await c["dev"].get(f"/api/w/{wid}/tasks/similar", params={"text": "loader retry logic"})).json()
    assert [s["title"] for s in sim] == ["Add retry to loader"] and set(sim[0]) == {"id", "number", "title", "status"}
    assert (await c["dev"].get(f"/api/w/{wid}/tasks/similar", params={"text": " "})).json() == []


async def test_task_in_other_workspace_is_404(ws_with_dev, make_client):
    wid, c = ws_with_dev
    t = await create(c, wid)
    other = await make_workspace(make_client, slug="other", admin_group="g-dev")
    r = await c["dev"].get(f"/api/w/{other}/tasks/{t['id']}")
    assert r.status_code == 404 and r.json()["detail"] == "Task not found."
    assert (await c["dev"].get(f"/api/w/{other}/tasks", params={"q": "retry"})).json() == []


async def test_only_author_or_edit_any_can_edit(ws_with_dev):
    wid, c = ws_with_dev
    t = await create(c, wid)
    assert (await c["appr"].patch(f"/api/w/{wid}/tasks/{t['id']}", json={"title": "x"})).status_code == 403
    r = await c["adm"].patch(f"/api/w/{wid}/tasks/{t['id']}", json={"title": "Retry with backoff"})
    assert r.status_code == 200 and r.json()["title"] == "Retry with backoff"
    edits = [a for a in (await c["dev"].get(f"/api/w/{wid}/tasks/{t['id']}/activity")).json() if a["kind"] == "edited"]
    assert edits[0]["data"] == {"changed": ["title"]}
    hits = (await c["dev"].get(f"/api/w/{wid}/tasks", params={"q": "backoff"})).json()
    assert len(hits) == 1


async def test_decided_task_is_not_editable_but_commentable(ws_with_dev, db):
    wid, c = ws_with_dev
    t = await create(c, wid)
    await db.tasks.update_one({"_id": t["id"]}, {"$set": {"status": "approved"}})
    r = await c["dev"].patch(f"/api/w/{wid}/tasks/{t['id']}", json={"title": "x"})
    assert r.status_code == 409 and "Add a comment instead" in r.json()["detail"]
    r = await c["dev"].post(f"/api/w/{wid}/tasks/{t['id']}/comments", json={"text": "fyi"})
    assert r.status_code == 201 and r.json()["data"] == {"text": "fyi"}


async def test_over_limit_text_is_422(ws_with_dev):
    wid, c = ws_with_dev
    assert (await c["dev"].post(f"/api/w/{wid}/tasks", json={**STORY, "title": "x" * 201})).status_code == 422
    big = {**STORY, "fields": {**STORY["fields"], "context": "x" * 20001}}
    assert (await c["dev"].post(f"/api/w/{wid}/tasks", json=big)).status_code == 422
    t = await create(c, wid)
    assert (await c["dev"].post(f"/api/w/{wid}/tasks/{t['id']}/comments", json={"text": "x" * 10001})).status_code == 422


async def test_numbers_are_sequential_per_workspace(ws_with_dev):
    wid, c = ws_with_dev
    assert [(await create(c, wid))["number"] for _ in range(3)] == [1, 2, 3]


async def test_labels_default_from_template(ws_with_dev):
    wid, c = ws_with_dev
    await c["adm"].put(f"/api/w/{wid}/templates/story", json={
        "name": "Story", "jira_issue_type": "Story", "default_labels": ["feature"],
        "sections": [{"key": "context", "label": "Context", "required": True, "hint": ""},
                     {"key": "scope", "label": "Scope", "required": True, "hint": ""},
                     {"key": "acceptance", "label": "Acceptance criteria", "required": True, "hint": ""}]})
    assert (await create(c, wid))["labels"] == ["feature"]
    assert (await create(c, wid, labels=["x"]))["labels"] == ["x"]
