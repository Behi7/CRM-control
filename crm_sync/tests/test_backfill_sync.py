import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock
from sqlalchemy import select
from app.models import Account, Pipeline, Stage, Lead
from app.sync.backfill_sync import run_backfill

async def test_run_backfill_success(db_session, sample_account):
    now = datetime.now(timezone.utc)
    sample_account.backfill_status = "pending"
    await db_session.commit()

    api_account = {"timezone": "Europe/Samara", "id": 123456}
    api_pipelines = {
        "_embedded": {
            "pipelines": [
                {
                    "id": 100,
                    "name": "Основная",
                    "_embedded": {
                        "statuses": [
                            {"id": 1001, "name": "Этап 1", "sort": 10},
                            {"id": 1002, "name": "Этап 2", "sort": 20},
                        ]
                    },
                }
            ]
        }
    }
    api_leads = {
        "_embedded": {
            "leads": [
                {
                    "id": 3001,
                    "name": "Исторический лид",
                    "pipeline_id": "100",
                    "status_id": "1001",
                    "price": 50000,
                    "created_at": int((now - timedelta(days=10)).timestamp()),
                }
            ]
        }
    }
    api_events = {
        "_embedded": {
            "events": [
                {
                    "id": "ev_hist_1",
                    "type": "lead_status_changed",
                    "entity_id": 3001,
                    "created_at": int((now - timedelta(days=5)).timestamp()),
                    "value_after": [{"lead_status": {"id": 1002, "pipeline_id": 100}}],
                }
            ]
        }
    }

    async def mock_request(*args, **kwargs):
        path = kwargs.get("path", "")
        if path == "/api/v4/account":
            return 200, api_account
        elif "/api/v4/leads/pipelines" in path:
            return 200, api_pipelines
        elif "/api/v4/leads" in path:
            return 200, api_leads
        elif "/api/v4/events" in path:
            return 200, api_events
        return 204, None

    with patch("app.sync.backfill_sync.crm_client.request", side_effect=mock_request), \
         patch("app.sync.pipeline_sync.crm_client.request", side_effect=mock_request):

        ok = await run_backfill(db_session, sample_account.id)
        assert ok is True

        await db_session.refresh(sample_account)
        assert sample_account.backfill_status == "done"
        assert sample_account.timezone == "Europe/Samara"
        assert sample_account.external_account_id == "123456"
        assert sample_account.backfill_cursor is None
        assert sample_account.last_synced_at is not None

        # Lead should be upserted and moved to stage 1002
        lead = (await db_session.execute(
            select(Lead).where(Lead.account_id == sample_account.id, Lead.external_id == "3001")
        )).scalar_one()
        assert lead.name == "Исторический лид"

async def test_run_backfill_skip_if_not_connected(db_session, sample_account):
    sample_account.status = "disconnected"
    await db_session.commit()

    ok = await run_backfill(db_session, sample_account.id)
    assert ok is False

async def test_run_backfill_skip_if_stopped(db_session, sample_account):
    sample_account.sync_status = "stopped"
    await db_session.commit()

    ok = await run_backfill(db_session, sample_account.id)
    assert ok is False

async def test_run_backfill_bad_token(db_session, sample_account):
    sample_account.encrypted_token = "invalid-token"
    await db_session.commit()

    ok = await run_backfill(db_session, sample_account.id)
    assert ok is False

async def test_run_backfill_401_on_account(db_session, sample_account):
    with patch("app.sync.backfill_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (401, None)

        ok = await run_backfill(db_session, sample_account.id)
        assert ok is False

        await db_session.refresh(sample_account)
        assert sample_account.token_status == "expired"
        assert sample_account.backfill_status == "error"

async def test_run_backfill_pipeline_sync_failure(db_session, sample_account):
    async def mock_request(*args, **kwargs):
        path = kwargs.get("path", "")
        if path == "/api/v4/account":
            return 200, {"timezone": "UTC"}
        elif "/api/v4/leads/pipelines" in path:
            return 500, None
        return 204, None

    with patch("app.sync.backfill_sync.crm_client.request", side_effect=mock_request), \
         patch("app.sync.pipeline_sync.crm_client.request", side_effect=mock_request):

        ok = await run_backfill(db_session, sample_account.id)
        assert ok is False

        await db_session.refresh(sample_account)
        assert sample_account.backfill_status == "error"

async def test_run_backfill_leads_error(db_session, sample_account):
    async def mock_request(*args, **kwargs):
        path = kwargs.get("path", "")
        if path == "/api/v4/account":
            return 200, {"timezone": "UTC"}
        elif "/api/v4/leads/pipelines" in path:
            return 200, {"_embedded": {"pipelines": []}}
        elif "/api/v4/leads" in path:
            return 500, {"error": "Server error"}
        return 204, None

    with patch("app.sync.backfill_sync.crm_client.request", side_effect=mock_request), \
         patch("app.sync.pipeline_sync.crm_client.request", side_effect=mock_request):

        ok = await run_backfill(db_session, sample_account.id)
        assert ok is False

        await db_session.refresh(sample_account)
        assert sample_account.backfill_status == "error"

async def test_run_backfill_resume_from_cursor(db_session, sample_account):
    now = datetime.now(timezone.utc)
    sample_account.backfill_cursor = {
        "stage": "events",
        "window_from": int((now - timedelta(days=2)).timestamp()),
        "total_leads": 100,
        "total_events": 50,
    }
    await db_session.commit()

    async def mock_request(*args, **kwargs):
        path = kwargs.get("path", "")
        if path == "/api/v4/account":
            return 200, {"timezone": "UTC"}
        elif "/api/v4/leads/pipelines" in path:
            return 200, {"_embedded": {"pipelines": []}}
        elif "/api/v4/events" in path:
            return 204, None
        return 204, None

    with patch("app.sync.backfill_sync.crm_client.request", side_effect=mock_request), \
         patch("app.sync.pipeline_sync.crm_client.request", side_effect=mock_request):

        ok = await run_backfill(db_session, sample_account.id)
        assert ok is True

        await db_session.refresh(sample_account)
        assert sample_account.backfill_status == "done"
