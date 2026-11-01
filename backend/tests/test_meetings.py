import base64
import io
import json
import zipfile

import httpx

from app import ai

VTT = """WEBVTT

1
00:00:01.000 --> 00:00:04.000
<v Priya Shah>I can add retries to the loader</v>

2
00:00:04.000 --> 00:00:06.000
<v Priya Shah>by Friday.</v>

3
00:00:06.500 --> 00:00:08.000
<v Sam>Let's drop the old cron job.</v>
"""


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def docx(paragraphs: list[str]) -> bytes:
    w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    body = "".join(f"<w:p><w:r><w:t>{p}</w:t></w:r></w:p>" for p in paragraphs)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", f'<w:document xmlns:w="{w}"><w:body>{body}</w:body></w:document>')
    return buf.getvalue()


async def test_upload_vtt_and_docx_transcripts(ws_with_dev):
    wid, c = ws_with_dev
    parse = f"/api/w/{wid}/meetings/parse"
    r = await c["dev"].post(parse, json={"filename": "Standup.vtt", "data": b64(VTT.encode())})
    assert r.json()["text"] == "Priya Shah: I can add retries to the loader by Friday.\nSam: Let's drop the old cron job."
    r = await c["dev"].post(parse, json={"filename": "notes.docx", "data": b64(docx(["Sam: ship it", "", "Priya: ok"]))})
    assert r.json()["text"] == "Sam: ship it\nPriya: ok"
    assert (await c["dev"].post(parse, json={"filename": "x.pdf", "data": b64(b"%PDF")})).status_code == 415
    assert (await c["dev"].post(parse, json={"filename": "x.docx", "data": b64(b"not a zip")})).status_code == 422
    assert (await c["view"].post(parse, json={"filename": "a.txt", "data": b64(b"hello")})).status_code == 403


async def test_meetings_grouped_and_ai_summary_saved(ws_with_dev, settings, monkeypatch):
    wid, c = ws_with_dev
    base = f"/api/w/{wid}/meetings"
    body = {"title": "Standup 3 Nov", "series": "Daily standup", "date": "2026-11-03",
            "notes": "Priya will add retries to the loader by Friday. We decided to drop the old cron job."}
    m = (await c["dev"].post(base, json=body)).json()
    await c["dev"].post(base, json={**body, "title": "Planning", "series": "Sprint planning", "date": "2026-11-02"})
    listed = (await c["view"].get(base)).json()
    assert [(x["title"], x["series"]) for x in listed] == [("Standup 3 Nov", "Daily standup"), ("Planning", "Sprint planning")]
    assert "notes" not in listed[0]

    off = await c["dev"].post(f"{base}/{m['id']}/extract")
    assert off.status_code == 503 and "AI is turned off" in off.json()["detail"]
    answer = {"summary": "## Decisions\n- Drop the old cron job", "tasks": [
        {"title": "Add retries to the loader", "details": "Agreed for Friday.", "type_key": "story", "owner": "Priya"},
        {"title": "Remove old cron", "details": "", "type_key": "nonsense", "owner": ""}, {"title": "  "}]}
    sent = []
    monkeypatch.setattr(ai, "TRANSPORT", httpx.MockTransport(lambda req: sent.append(json.loads(req.content)) or httpx.Response(
        200, json={"candidates": [{"content": {"parts": [{"text": json.dumps(answer)}]}}]})))
    settings.ai_enabled, settings.vertex_api_key = True, "k"
    assert (await c["view"].post(f"{base}/{m['id']}/extract")).status_code == 403
    r = (await c["dev"].post(f"{base}/{m['id']}/extract")).json()
    assert r["summary"].startswith("## Decisions")
    assert [(t["title"], t["type_key"], t["owner"]) for t in r["proposed"]] == [
        ("Add retries to the loader", "story", "Priya"), ("Remove old cron", "story", "")]  # unknown type falls back; blank dropped
    assert sent[0]["generationConfig"]["responseMimeType"] == "application/json"
    assert (await c["dev"].get(f"{base}/{m['id']}")).json()["proposed"][0]["owner"] == "Priya"  # stored
    assert (await c["dev"].get("/api/auth/me")).json()["ai_enabled"] is True
