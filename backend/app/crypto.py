"""Encrypts connection secrets (Jira tokens, Teams webhook links) before they reach MongoDB."""
import base64
import hashlib

from cryptography.fernet import Fernet

from app.config import Settings


# ponytail: key derived from SESSION_SECRET, so rotating that secret means re-entering saved tokens.
# Add a separate CONNECTIONS_KEY setting if you need to rotate them independently.
def _box(settings: Settings) -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(b"teamdesk-connections:" + settings.session_secret.encode()).digest()))


def seal(settings: Settings, text: str) -> str:
    return _box(settings).encrypt(text.encode()).decode()


def unseal(settings: Settings, token: str) -> str:
    return _box(settings).decrypt(token.encode()).decode()
