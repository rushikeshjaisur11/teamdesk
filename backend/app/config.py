from pydantic_settings import BaseSettings

APP_NAME = "TeamDesk"


class Settings(BaseSettings):
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "teamdesk"
    session_secret: str
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
