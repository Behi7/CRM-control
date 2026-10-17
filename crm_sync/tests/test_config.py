import pytest
from app.config import Settings

def test_settings_default_values():
    s = Settings(TOKEN_ENCRYPTION_KEY="testkey123456789012345678901234", APP_ENV="production")
    assert s.SYNC_INTERVAL_MINUTES == 10
    assert s.SYNC_OVERLAP_MINUTES == 2
    assert s.AMO_CRM_RATE_LIMIT_RPS == 5
    assert s.STALE_THRESHOLD_MINUTES == 30
    assert s.APP_ENV == "production"

def test_settings_env_override(monkeypatch):
    monkeypatch.setenv("SYNC_INTERVAL_MINUTES", "15")
    monkeypatch.setenv("APP_ENV", "staging")
    s = Settings(TOKEN_ENCRYPTION_KEY="testkey123456789012345678901234")
    assert s.SYNC_INTERVAL_MINUTES == 15
    assert s.APP_ENV == "staging"

def test_async_database_url_postgresql_scheme():
    s = Settings(
        DATABASE_URL="postgresql://user:pass@localhost:5432/dbname",
        TOKEN_ENCRYPTION_KEY="testkey123456789012345678901234"
    )
    assert s.async_database_url == "postgresql+asyncpg://user:pass@localhost:5432/dbname"

def test_async_database_url_postgres_scheme():
    s = Settings(
        DATABASE_URL="postgres://user:pass@localhost:5432/dbname",
        TOKEN_ENCRYPTION_KEY="testkey123456789012345678901234"
    )
    assert s.async_database_url == "postgresql+asyncpg://user:pass@localhost:5432/dbname"

def test_async_database_url_already_async():
    s = Settings(
        DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/dbname",
        TOKEN_ENCRYPTION_KEY="testkey123456789012345678901234"
    )
    assert s.async_database_url == "postgresql+asyncpg://user:pass@localhost:5432/dbname"

def test_async_database_url_other_scheme():
    s = Settings(
        DATABASE_URL="sqlite+aiosqlite:///test.db",
        TOKEN_ENCRYPTION_KEY="testkey123456789012345678901234"
    )
    assert s.async_database_url == "sqlite+aiosqlite:///test.db"

def test_sync_database_url_asyncpg_scheme():
    s = Settings(
        DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/dbname",
        TOKEN_ENCRYPTION_KEY="testkey123456789012345678901234"
    )
    assert s.sync_database_url == "postgresql://user:pass@localhost:5432/dbname"

def test_sync_database_url_already_sync():
    s = Settings(
        DATABASE_URL="postgresql://user:pass@localhost:5432/dbname",
        TOKEN_ENCRYPTION_KEY="testkey123456789012345678901234"
    )
    assert s.sync_database_url == "postgresql://user:pass@localhost:5432/dbname"
