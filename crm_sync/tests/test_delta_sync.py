import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock
from sqlalchemy import select
from app.models import Account, Pipeline, Stage, Lead, ProcessedCrmEvent
from app.sync.delta_sync import run_delta_sync, run_enrich_account
from app.core.security import encrypt_token

async def test_run_delta_sync_success(db_session, sample_account):
    now = datetime.now(timezone.utc)
    pipe = Pipeline(account_id=sample_account.id, external_id="10", name="Main")
    db_session.add(pipe)
    await db_session.commit()
    await db_session.refresh(pipe)

    st1 = Stage(pipeline_id=pipe.id, external_id="101", name="Stage 1", sort_order=1)
    st2 = Stage(pipeline_id=pipe.id, external_id="102", name="Stage 2", sort_order=2)
    db_session.add_all([st1, st2])
    await db_session.commit()
    await db_session.refresh(st1)
    await db_session.refresh(st2)

    api_leads = {
        "_embedded": {
            "leads": [
                {
                    "id": 555,
                    "name": "Лид из Дельта-синхронизации",
                    "pipeline_id": "10",
                    "status_id": "101",
                    "price": 150000,
                    "created_at": int((now - timedelta(days=1)).timestamp()),
                    "updated_at": int(now.timestamp()),
                }
            ]
        }
    }
    api_events = {
        "_embedded": {
            "events": [
                {
                    "id": "ev_delta_1",
                    "type": "lead_status_changed",
                    "entity_id": 555,
                    "created_at": int(now.timestamp()),
                    "value_after": [{"lead_status": {"id": 102, "pipeline_id": 10}}],
                }
            ]
        }
    }

    async def mock_request(*args, **kwargs):
        path = kwargs.get("path", "")
        if "/api/v4/leads" in path:
            return 200, api_leads
        elif "/api/v4/events" in path:
            return 200, api_events
        return 404, None

    with patch("app.sync.delta_sync.crm_client.request", side_effect=mock_request):
        ok = await run_delta_sync(db_session, sample_account.id)
        assert ok is True

        # Check lead was created and moved to stage 102
        lead = (await db_session.execute(
            select(Lead).where(Lead.account_id == sample_account.id, Lead.external_id == "555")
        )).scalar_one()
        assert lead.name == "Лид из Дельта-синхронизации"
        assert lead.current_stage_id == st2.id

        # Check account last_synced_at was updated
        await db_session.refresh(sample_account)
        assert sample_account.last_synced_at is not None

async def test_run_delta_sync_skip_if_not_connected(db_session, sample_account):
    sample_account.status = "disconnected"
    await db_session.commit()

    ok = await run_delta_sync(db_session, sample_account.id)
    assert ok is False

async def test_run_delta_sync_skip_if_sync_stopped(db_session, sample_account):
    sample_account.sync_status = "stopped"
    await db_session.commit()

    ok = await run_delta_sync(db_session, sample_account.id)
    assert ok is False

async def test_run_delta_sync_invalid_encrypted_token(db_session, sample_account):
    sample_account.encrypted_token = "corrupted-token-payload"
    await db_session.commit()

    ok = await run_delta_sync(db_session, sample_account.id)
    assert ok is False

async def test_run_delta_sync_401_on_leads_fetch(db_session, sample_account):
    with patch("app.sync.delta_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (401, {"error": "Token expired"})

        ok = await run_delta_sync(db_session, sample_account.id)
        assert ok is False

        await db_session.refresh(sample_account)
        assert sample_account.token_status == "expired"

async def test_run_delta_sync_401_on_events_fetch(db_session, sample_account):
    async def mock_request(*args, **kwargs):
        path = kwargs.get("path", "")
        if "/api/v4/leads" in path:
            return 204, None
        elif "/api/v4/events" in path:
            return 401, None
        return 404, None

    with patch("app.sync.delta_sync.crm_client.request", side_effect=mock_request):
        ok = await run_delta_sync(db_session, sample_account.id)
        assert ok is False

        await db_session.refresh(sample_account)
        assert sample_account.token_status == "expired"

async def test_run_delta_sync_leads_fetch_server_error(db_session, sample_account):
    with patch("app.sync.delta_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (500, {"error": "Internal Error"})

        ok = await run_delta_sync(db_session, sample_account.id)
        assert ok is False

async def test_run_enrich_account_success(db_session, sample_account):
    api_leads = {
        "_embedded": {
            "leads": [
                {
                    "id": 777,
                    "name": "Обогащенная сделка",
                    "price": 500000,
                    "created_at": 1690000000,
                    "_embedded": {
                        "tags": [{"id": 99, "name": "Обогащено"}],
                    },
                }
            ]
        }
    }

    with patch("app.sync.delta_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (200, api_leads)

        ok = await run_enrich_account(db_session, sample_account.id)
        assert ok is True

        lead = (await db_session.execute(
            select(Lead).where(Lead.account_id == sample_account.id, Lead.external_id == "777")
        )).scalar_one()
        assert lead.name == "Обогащенная сделка"
        assert float(lead.price) == 500000.0

async def test_run_enrich_account_stopped_account(db_session, sample_account):
    sample_account.sync_status = "stopped"
    await db_session.commit()

    ok = await run_enrich_account(db_session, sample_account.id)
    assert ok is False

async def test_run_delta_sync_pagination_loops_and_delete_restore(db_session, sample_account):
    now = datetime.now(timezone.utc)
    pipe = Pipeline(account_id=sample_account.id, external_id="10", name="Main")
    db_session.add(pipe)
    await db_session.commit()
    await db_session.refresh(pipe)

    st = Stage(pipeline_id=pipe.id, external_id="101", name="Stage 1", sort_order=1)
    db_session.add(st)
    await db_session.commit()
    await db_session.refresh(st)

    lead = Lead(
        account_id=sample_account.id,
        external_id="lead_dr",
        pipeline_id=pipe.id,
        current_stage_id=st.id,
        crm_created_at=now,
    )
    db_session.add(lead)
    await db_session.commit()

    # Repeated first ID in leads to trigger pagination loop
    leads_page = {"_embedded": {"leads": [{"id": 100, "name": "L1", "status_id": "101", "created_at": 1000}]}}
    events_page = {
        "_embedded": {
            "events": [
                {"id": "ev_d1", "type": "lead_deleted", "entity_id": "lead_dr", "created_at": int(now.timestamp())},
                {"id": "ev_r1", "type": "lead_restored", "entity_id": "lead_dr", "created_at": int((now + timedelta(seconds=10)).timestamp())},
            ]
        }
    }

    call_counts = {"leads": 0, "events": 0}

    async def mock_request(*args, **kwargs):
        path = kwargs.get("path", "")
        if "/api/v4/leads" in path:
            call_counts["leads"] += 1
            # Return same item twice to trigger loop detection
            return 200, leads_page
        elif "/api/v4/events" in path:
            call_counts["events"] += 1
            if call_counts["events"] == 1:
                return 200, events_page
            return 200, events_page  # triggers event loop detection
        return 204, None

    with patch("app.sync.delta_sync.crm_client.request", side_effect=mock_request):
        ok = await run_delta_sync(db_session, sample_account.id)
        assert ok is True

async def test_run_delta_sync_general_exception(db_session, sample_account):
    with patch("app.sync.delta_sync.build_sync_context", side_effect=RuntimeError("DB explosion")):
        ok = await run_delta_sync(db_session, sample_account.id)
        assert ok is False

async def test_run_enrich_account_pagination_loop_and_exception(db_session, sample_account):
    # Test loop detection
    leads_page = {"_embedded": {"leads": [{"id": 200, "name": "Loop Lead"}]}}

    async def mock_request(*args, **kwargs):
        return 200, leads_page

    with patch("app.sync.delta_sync.crm_client.request", side_effect=mock_request):
        ok = await run_enrich_account(db_session, sample_account.id)
        assert ok is True

    # Test exception
    with patch("app.sync.delta_sync.build_sync_context", side_effect=RuntimeError("Enrich error")):
        ok = await run_enrich_account(db_session, sample_account.id)
        assert ok is False
