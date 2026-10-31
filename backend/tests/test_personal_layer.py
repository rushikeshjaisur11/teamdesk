import pytest

from app.scoped import Personal, out


async def test_personal_reads_and_writes_never_cross_users(db):
    a, b = Personal(db, "asha").col("personal_items"), Personal(db, "dan").col("personal_items")
    doc = await a.insert({"title": "secret"})
    assert await b.find({}) == [] and await b.find_one({"_id": doc["_id"]}) is None
    assert await b.find({"owner_sub": "asha"}) == []
    assert await b.update({"_id": doc["_id"]}, {"$set": {"title": "x"}}) is None
    assert await b.delete({"_id": doc["_id"]}) == 0
    assert (await a.find_one({"_id": doc["_id"]}))["title"] == "secret"


async def test_personal_owner_cannot_be_changed(db):
    a = Personal(db, "asha").col("personal_items")
    doc = await a.insert({"title": "x"})
    with pytest.raises(ValueError):
        await a.update({"_id": doc["_id"]}, {"$set": {"owner_sub": "dan"}})
    with pytest.raises(ValueError):
        await a.update_many({}, {"$unset": {"owner_sub": ""}})


def test_out_hides_owner():
    assert out({"_id": "1", "owner_sub": "asha", "t": 1}) == {"id": "1", "t": 1}
