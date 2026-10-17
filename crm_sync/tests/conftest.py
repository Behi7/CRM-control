import os
import sys
import socket
import pytest
import asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text, select

# Ensure environment variables are set before importing app modules
TEST_ENCRYPTION_KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
if not os.environ.get("TOKEN_ENCRYPTION_KEY"):
    os.environ["TOKEN_ENCRYPTION_KEY"] = TEST_ENCRYPTION_KEY_HEX

def get_test_db_host():
    try:
        socket.gethostbyname("postgres")
        return "postgres"
    except Exception:
        return "localhost"

TEST_DB_HOST = get_test_db_host()
TEST_DB_URL = f"postgresql+asyncpg://postgres:postgres@{TEST_DB_HOST}:5432/amocrm_analytics_test"
os.environ["DATABASE_URL"] = f"postgresql://postgres:postgres@{TEST_DB_HOST}:5432/amocrm_analytics_test"
os.environ["APP_ENV"] = "test"

# Import app modules
import app.config
app.config.settings.DATABASE_URL = os.environ["DATABASE_URL"]
if not app.config.settings.TOKEN_ENCRYPTION_KEY:
    app.config.settings.TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY_HEX

from app.models import Base, Account, Pipeline, Stage, AmoUser, Tag, Lead, QcSettings
import app.core.database as app_db
from app.core.security import encrypt_token

from sqlalchemy.pool import NullPool

# Configure test database engine with NullPool so connections are created in current event loop
test_async_engine = create_async_engine(
    TEST_DB_URL,
    poolclass=NullPool,
)

TestAsyncSessionLocal = async_sessionmaker(
    test_async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Override app database engine and session maker with test database
app_db.async_engine = test_async_engine
app_db.AsyncSessionLocal = TestAsyncSessionLocal

@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"

@pytest.fixture
async def clean_database():
    """Clean all tables in the test database."""
    async with test_async_engine.begin() as conn:
        await conn.execute(text("TRUNCATE TABLE accounts, notifications, custom_field_definitions CASCADE;"))
    yield
    async with test_async_engine.begin() as conn:
        await conn.execute(text("TRUNCATE TABLE accounts, notifications, custom_field_definitions CASCADE;"))

@pytest.fixture
async def db_session(clean_database):
    """Provide a clean AsyncSession for test execution."""
    async with TestAsyncSessionLocal() as session:
        yield session

@pytest.fixture
async def sample_account(db_session: AsyncSession):
    """Fixture providing a standard test account in DB."""
    enc_token = encrypt_token("test-valid-amocrm-token")
    acc = Account(
        subdomain="test-subdomain",
        base_domain="amocrm.ru",
        encrypted_token=enc_token,
        status="connected",
        sync_status="active",
        backfill_status="done",
        timezone="Europe/Moscow",
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(acc)
    await db_session.commit()
    await db_session.refresh(acc)
    return acc
