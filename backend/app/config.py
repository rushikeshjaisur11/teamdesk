from pydantic import Field
from pydantic_settings import BaseSettings

APP_NAME = "TeamDesk"


class Settings(BaseSettings):
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "teamdesk"
    session_secret: str = Field(min_length=32)  # signs session cookies; a short or placeholder secret lets anyone forge one
    session_max_age: int = 28800
    https_only_cookies: bool = True
    dev_login_enabled: bool = False
    platform_owner_group: str = "teamdesk-platform-owners"
    # Interim identity until company login is connected: requests without a session act as this user.
    # Leave dev_user_sub empty in any shared environment.
    dev_user_sub: str = ""
    dev_user_name: str = ""
    dev_user_email: str = ""
    dev_user_groups: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "teamdesk@localhost"
    public_url: str = "http://localhost:5173"
    # AI (Vertex AI Gemini, API key). Off unless AI_ENABLED=true and VERTEX_API_KEY is set. Every call is in app/ai.py.
    ai_enabled: bool = False
    vertex_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    ai_base_url: str = "https://aiplatform.googleapis.com/v1"
    jira_sync_minutes: int = 10
