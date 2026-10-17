import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock
from sqlalchemy import select
from app.models import Account, Lead, AmoUser, LeadTask
from app.sync.tasks_sync import run_tasks_sync

async def test_run_tasks_sync_success(db_session, sample_account):
    now = datetime.now(timezone.utc)
    lead = Lead(
        account_id=sample_account.id,
        external_id="lead_task_1",
        name="Сделка с задачей",
        crm_created_at=now,
    )
    user = AmoUser(account_id=sample_account.id, external_id="u_task_1", name="Ответственный")
    db_session.add_all([lead, user])
    await db_session.commit()
    await db_session.refresh(lead)
    await db_session.refresh(user)

    tasks_data = {
        "_embedded": {
            "tasks": [
                {
                    "id": 88001,
                    "entity_id": "lead_task_1",
                    "responsible_user_id": "u_task_1",
                    "task_type_id": 1,
                    "text": "Перезвонить клиенту в 15:00",
                    "is_completed": True,
                    "created_at": int((now - timedelta(hours=2)).timestamp()),
                    "complete_till": int((now + timedelta(hours=1)).timestamp()),
                    "updated_at": int(now.timestamp()),
                }
            ]
        }
    }

    with patch("app.sync.tasks_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (200, tasks_data)

        ok = await run_tasks_sync(db_session, sample_account.id)
        assert ok is True

        task = (await db_session.execute(
            select(LeadTask).where(
                LeadTask.account_id == sample_account.id,
                LeadTask.external_task_id == "88001",
            )
        )).scalar_one()

        assert task.lead_id == lead.id
        assert task.responsible_user_id == user.id
        assert task.text == "Перезвонить клиенту в 15:00"
        assert task.is_completed is True
        assert task.complete_till is not None
        assert task.task_closed_at is not None

        # Check cursor updated in anomaly_settings
        await db_session.refresh(sample_account)
        assert sample_account.anomaly_settings.get("last_tasks_synced_at") is not None

async def test_run_tasks_sync_with_existing_cursor(db_session, sample_account):
    now = datetime.now(timezone.utc)
    sample_account.anomaly_settings = {
        "last_tasks_synced_at": (now - timedelta(hours=1)).isoformat()
    }
    await db_session.commit()

    with patch("app.sync.tasks_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (204, None)

        ok = await run_tasks_sync(db_session, sample_account.id)
        assert ok is True
        # Check that filter[updated_at][from] was passed
        params = mock_req.call_args.kwargs["params"]
        assert "filter[updated_at][from]" in params

async def test_run_tasks_sync_invalid_cursor_handled_gracefully(db_session, sample_account):
    sample_account.anomaly_settings = {
        "last_tasks_synced_at": "not-a-valid-iso-date"
    }
    await db_session.commit()

    with patch("app.sync.tasks_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (204, None)
        ok = await run_tasks_sync(db_session, sample_account.id)
        assert ok is True

async def test_run_tasks_sync_skip_if_not_connected(db_session, sample_account):
    sample_account.status = "disconnected"
    await db_session.commit()

    ok = await run_tasks_sync(db_session, sample_account.id)
    assert ok is False

async def test_run_tasks_sync_skip_if_stopped(db_session, sample_account):
    sample_account.sync_status = "stopped"
    await db_session.commit()

    ok = await run_tasks_sync(db_session, sample_account.id)
    assert ok is False

async def test_run_tasks_sync_bad_token(db_session, sample_account):
    sample_account.encrypted_token = "invalid-token"
    await db_session.commit()

    ok = await run_tasks_sync(db_session, sample_account.id)
    assert ok is False

async def test_run_tasks_sync_api_failure(db_session, sample_account):
    with patch("app.sync.tasks_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (500, {"error": "Server error"})
        ok = await run_tasks_sync(db_session, sample_account.id)
        # Should gracefully finish and return True (cursor saved)
        assert ok is True
