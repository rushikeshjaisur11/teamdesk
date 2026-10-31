import pytest

from app.scoped import Scoped, out


async def test_reads_never_cross_workspaces(db):
    a, b = Scoped(db, "wa").col("tasks"), Scoped(db, "wb").col("tasks")
    doc = await a.insert({"title": "secret"})
    assert await b.find({}) == []
    assert await b.find_one({"_id": doc["_id"]}) is None
    assert await b.find({"workspace_id": "wa"}) == []


async def test_writes_never_cross_workspaces(db):
    a, b = Scoped(db, "wa").col("tasks"), Scoped(db, "wb").col("tasks")
    doc = await a.insert({"title": "x"})
    assert await b.update({"_id": doc["_id"]}, {"$set": {"title": "y"}}) is None
    assert await b.delete({"_id": doc["_id"]}) == 0
    assert (await a.find_one({"_id": doc["_id"]}))["title"] == "x"


async def test_cannot_move_doc_to_other_workspace(db):
    a = Scoped(db, "wa").col("tasks")
    doc = await a.insert({"title": "x"})
    with pytest.raises(ValueError):
        await a.update({"_id": doc["_id"]}, {"$set": {"workspace_id": "wb"}})


async def test_next_seq_is_per_workspace_and_increments(db):
    assert [await Scoped(db, "wa").next_seq("tasks") for _ in range(3)] == [1, 2, 3]
    assert await Scoped(db, "wb").next_seq("tasks") == 1


async def test_count_and_sorted_find(db):
    a = Scoped(db, "wa").col("things")
    for n in (2, 1, 3):
        await a.insert({"n": n})
    assert await a.count({}) == 3
    assert [d["n"] for d in await a.find({}, sort=[("n", 1)], limit=2)] == [1, 2]


def test_out_renames_id_and_hides_workspace():
    assert out({"_id": "1", "workspace_id": "w", "t": 1}) == {"id": "1", "t": 1}


async def test_update_many_stays_in_workspace(db):
    a, b = Scoped(db, "wa").col("things"), Scoped(db, "wb").col("things")
    await a.insert({"read": False}); await b.insert({"read": False})
    assert await a.update_many({"read": False}, {"$set": {"read": True}}) == 1
    assert (await b.find({}))[0]["read"] is False
