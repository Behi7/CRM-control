import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres@postgres:5432/amocrm_analytics"
    TOKEN_ENCRYPTION_KEY: str = ""
    SYNC_INTERVAL_MINUTES: int = 10
    SYNC_OVERLAP_MINUTES: int = 2
    AMO_CRM_RATE_LIMIT_RPS: int = 5
    STALE_THRESHOLD_MINUTES: int = 30
    APP_ENV: str = "production"

    @property
    def async_database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url

    @property
    def sync_database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgresql+asyncpg://"):
            return url.replace("postgresql+asyncpg://", "postgresql://", 1)
        return url

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
