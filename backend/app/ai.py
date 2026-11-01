"""Every AI call in TeamDesk goes through this file (Vertex AI Gemini, generateContent).

Configured only by environment: AI_ENABLED, VERTEX_API_KEY, GEMINI_MODEL, AI_BASE_URL.
To route through a company proxy, change `generate` here; nothing else calls the model."""
import json
import logging

import httpx

from app.config import Settings

log = logging.getLogger(__name__)
TRANSPORT: httpx.AsyncBaseTransport | None = None  # tests swap in httpx.MockTransport


def enabled(settings: Settings) -> bool:
    return settings.ai_enabled and bool(settings.vertex_api_key)


async def generate(settings: Settings, prompt: str, json_out: bool = False) -> str:
    url = f"{settings.ai_base_url.rstrip('/')}/publishers/google/models/{settings.gemini_model}:generateContent"
    config = {"temperature": 0.2, **({"responseMimeType": "application/json"} if json_out else {})}
    body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": config}
    async with httpx.AsyncClient(timeout=30, transport=TRANSPORT) as c:
        r = await c.post(url, json=body, headers={"x-goog-api-key": settings.vertex_api_key})
    r.raise_for_status()
    return "".join(p.get("text", "") for p in r.json()["candidates"][0]["content"]["parts"]).strip()


COMMENT_PROMPT = """Rewrite this comment from a team task tracker so it reads well as a Jira comment.
Keep every fact, name, number, link and code snippet exactly. Do not add new information, greetings or sign-offs.
Fix grammar and make it clear and concise. Use Jira wiki markup only where it helps (bullets with "* ", {{code}} for code).
Reply with the comment text only.

Jira issue: {title}
Comment:
{text}"""


async def jira_comment(settings: Settings, text: str, title: str) -> str:
    """The comment, tidied for Jira. Falls back to the original words if AI is off or fails, so nothing is lost."""
    if not enabled(settings):
        return text
    try:
        return await generate(settings, COMMENT_PROMPT.format(title=title, text=text)) or text
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        log.exception("AI comment rewrite failed; sending the original text")
        return text


MEETING_PROMPT = """You read meeting notes or a transcript for a software team and pull out what matters.
Reply with JSON only, in this shape:
{{"summary": "markdown", "tasks": [{{"title": "...", "details": "...", "type_key": "...", "owner": "..."}}]}}

summary: Markdown with "## Decisions", "## Action items" and "## Open questions" sections, short bullets, facts only.
tasks: one per concrete piece of work someone agreed to do. title: imperative, under 100 characters.
details: what and why in 1-4 sentences, using only what the notes say. type_key: one of {types}.
owner: the person's name exactly as written in the notes, or "" if nobody was named. No tasks for vague ideas.

Notes:
{text}"""


async def meeting_notes(settings: Settings, text: str, types: dict[str, str]) -> dict:
    """{"summary": str, "tasks": [{"title", "details", "type_key", "owner"}]}. Raises on AI failure; nothing is saved by this."""
    listed = ", ".join(f'"{k}" ({v})' for k, v in types.items())
    raw = json.loads(await generate(settings, MEETING_PROMPT.format(types=listed, text=text), json_out=True))
    first = next(iter(types))
    tasks = [{"title": str(t.get("title", "")).strip()[:200], "details": str(t.get("details", "")).strip(),
              "type_key": t.get("type_key") if t.get("type_key") in types else first, "owner": str(t.get("owner", "")).strip()}
             for t in raw.get("tasks", []) if str(t.get("title", "")).strip()]
    return {"summary": str(raw.get("summary", "")).strip(), "tasks": tasks[:30]}
