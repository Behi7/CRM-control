import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/amocrm_analytics")
    JWT_ACCESS_SECRET: str = os.getenv("JWT_ACCESS_SECRET", "super-secret-key-change-in-production")
    TOKEN_ENCRYPTION_KEY: str = os.getenv("TOKEN_ENCRYPTION_KEY", "")
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "admin@example.com")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "changeme123456")
    REFRESH_TOKEN_TTL_DAYS: int = int(os.getenv("REFRESH_TOKEN_TTL_DAYS", "30"))
    STALE_THRESHOLD_MINUTES: int = int(os.getenv("STALE_THRESHOLD_MINUTES", "30"))
    COOKIE_DOMAIN: str | None = os.getenv("COOKIE_DOMAIN", None)
    COOKIE_SECURE: bool = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379")

    @property
    def async_database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url

settings = Settings()
