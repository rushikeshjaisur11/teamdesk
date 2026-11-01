"""Every AI call in TeamDesk goes through this file (Vertex AI Gemini, generateContent).

Configured only by environment: AI_ENABLED, VERTEX_API_KEY, GEMINI_MODEL, AI_BASE_URL.
To route through a company proxy, change `generate` here; nothing else calls the model."""
import logging

import httpx

from app.config import Settings

log = logging.getLogger(__name__)
TRANSPORT: httpx.AsyncBaseTransport | None = None  # tests swap in httpx.MockTransport


def enabled(settings: Settings) -> bool:
    return settings.ai_enabled and bool(settings.vertex_api_key)


async def generate(settings: Settings, prompt: str) -> str:
    url = f"{settings.ai_base_url.rstrip('/')}/publishers/google/models/{settings.gemini_model}:generateContent"
    body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.2}}
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
