import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, AsyncSession
from app.core.database import async_engine, AsyncSessionLocal

def test_database_objects():
    assert isinstance(async_engine, AsyncEngine)
    assert isinstance(AsyncSessionLocal, async_sessionmaker)
    assert AsyncSessionLocal.class_ == AsyncSession
    assert AsyncSessionLocal.kw.get("expire_on_commit") is False
