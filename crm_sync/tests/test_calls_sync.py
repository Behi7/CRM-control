import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock
from sqlalchemy import select
from app.models import Account, Pipeline, Stage, Lead, AmoUser, QcSettings, QcCallEvaluation
from app.sync.calls_sync import run_calls_sync

async def test_run_calls_sync_disabled_qc(db_session, sample_account):
    now = datetime.now(timezone.utc)
    qc = QcSettings(account_id=sample_account.id, is_enabled=False, last_call_synced_at=now - timedelta(minutes=10))
    sample_account.anomaly_settings = {"calls_backfill_done": True}
    db_session.add(qc)
    await db_session.commit()

    notes_data = {
        "_embedded": {
            "notes": [
                {
                    "id": 9901,
                    "note_type": "call_in",
                    "created_at": int(now.timestamp()),
                    "params": {"duration": 65, "link": "https://rec.mp3", "call_status": 4},
                }
            ]
        }
    }

    with patch("app.sync.calls_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (200, notes_data)
        ok = await run_calls_sync(db_session, sample_account.id)
        assert ok is True

        call = (await db_session.execute(
            select(QcCallEvaluation).where(
                QcCallEvaluation.account_id == sample_account.id,
                QcCallEvaluation.external_call_id == "9901",
            )
        )).scalar_one()
        # crm_sync is purely transport; saves calls as raw without business logic
        assert call.status == "raw"
        assert call.call_status == 4

async def test_run_calls_sync_missing_qc_settings(db_session, sample_account):
    sample_account.anomaly_settings = {"calls_backfill_done": True}
    await db_session.commit()

    with patch("app.sync.calls_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (204, None)
        ok = await run_calls_sync(db_session, sample_account.id)
        assert ok is True

        qc = (await db_session.execute(
            select(QcSettings).where(QcSettings.account_id == sample_account.id)
        )).scalar_one_or_none()
        assert qc is not None

async def test_run_calls_sync_baseline_initialization(db_session, sample_account):
    qc = QcSettings(account_id=sample_account.id, is_enabled=True, last_call_synced_at=None)
    db_session.add(qc)
    await db_session.commit()

    with patch("app.sync.calls_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (204, None)
        ok = await run_calls_sync(db_session, sample_account.id)
        assert ok is True

        await db_session.refresh(qc)
        assert qc.last_call_synced_at is not None

async def test_run_calls_sync_success_pending_call(db_session, sample_account):
    now = datetime.now(timezone.utc)
    qc = QcSettings(
        account_id=sample_account.id,
        is_enabled=True,
        min_duration_sec=20,
        max_duration_sec=600,
        last_call_synced_at=now - timedelta(minutes=10),
    )
    pipe = Pipeline(account_id=sample_account.id, external_id="10", name="Sales")
    sample_account.anomaly_settings = {"calls_backfill_done": True}
    db_session.add_all([qc, pipe])
    await db_session.commit()
    await db_session.refresh(pipe)

    lead = Lead(
        account_id=sample_account.id,
        external_id="lead_call_1",
        pipeline_id=pipe.id,
        crm_created_at=now,
    )
    user = AmoUser(account_id=sample_account.id, external_id="user_call_1", name="Manager")
    db_session.add_all([lead, user])
    await db_session.commit()

    notes_data = {
        "_embedded": {
            "notes": [
                {
                    "id": 9901,
                    "entity_id": "lead_call_1",
                    "note_type": "call_in",
                    "responsible_user_id": "user_call_1",
                    "created_at": int(now.timestamp()),
                    "params": {
                        "duration": 65,
                        "phone": "+79991112233",
                        "link": "https://storage.example.com/records/9901.mp3",
                        "call_status": 4,  # answered
                    },
                }
            ]
        }
    }

    with patch("app.sync.calls_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (200, notes_data)

        ok = await run_calls_sync(db_session, sample_account.id)
        assert ok is True

        call = (await db_session.execute(
            select(QcCallEvaluation).where(
                QcCallEvaluation.account_id == sample_account.id,
                QcCallEvaluation.external_call_id == "9901",
            )
        )).scalar_one()
        assert call.status == "raw"
        assert call.call_status == 4
        assert call.duration_seconds == 65
        assert call.phone == "+79991112233"
        assert call.recording_url == "https://storage.example.com/records/9901.mp3"
        assert call.lead_id == lead.id
        assert call.pipeline_id == pipe.id
        assert call.amo_user_id == user.id

async def test_run_calls_sync_filter_reasons(db_session, sample_account):
    now = datetime.now(timezone.utc)
    pipe_disabled = Pipeline(account_id=sample_account.id, external_id="999", name="Disabled Pipe")
    sample_account.anomaly_settings = {"calls_backfill_done": True}
    db_session.add(pipe_disabled)
    await db_session.commit()
    await db_session.refresh(pipe_disabled)

    qc = QcSettings(
        account_id=sample_account.id,
        is_enabled=True,
        min_duration_sec=20,
        max_duration_sec=300,
        disabled_pipeline_ids=[pipe_disabled.id],
        last_call_synced_at=now - timedelta(minutes=10),
    )
    db_session.add(qc)
    await db_session.commit()

    lead_disabled = Lead(
        account_id=sample_account.id,
        external_id="lead_dis",
        pipeline_id=pipe_disabled.id,
        crm_created_at=now,
    )
    db_session.add(lead_disabled)
    await db_session.commit()

    notes_data = {
        "_embedded": {
            "notes": [
                # 1. Disabled pipeline
                {
                    "id": 1001,
                    "entity_id": "lead_dis",
                    "note_type": "call_in",
                    "created_at": int(now.timestamp()),
                    "params": {"duration": 60, "link": "https://rec.mp3", "call_status": 4},
                },
                # 2. Not answered (call_status = 6)
                {
                    "id": 1002,
                    "note_type": "call_out",
                    "created_at": int(now.timestamp()),
                    "params": {"duration": 0, "link": "https://rec.mp3", "call_status": 6},
                },
                # 3. Too short duration (10s < 20s)
                {
                    "id": 1003,
                    "note_type": "call_in",
                    "created_at": int(now.timestamp()),
                    "params": {"duration": 10, "link": "https://rec.mp3", "call_status": 4},
                },
                # 4. Too long duration (400s > 300s)
                {
                    "id": 1004,
                    "note_type": "call_in",
                    "created_at": int(now.timestamp()),
                    "params": {"duration": 400, "link": "https://rec.mp3", "call_status": 4},
                },
                # 5. Missing audio link
                {
                    "id": 1005,
                    "note_type": "call_in",
                    "created_at": int(now.timestamp()),
                    "params": {"duration": 50, "link": None, "call_status": 4},
                },
            ]
        }
    }

    with patch("app.sync.calls_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (200, notes_data)

        ok = await run_calls_sync(db_session, sample_account.id)
        assert ok is True

        c1 = (await db_session.execute(select(QcCallEvaluation).where(QcCallEvaluation.external_call_id == "1001"))).scalar_one()
        assert c1.status == "raw"
        assert c1.call_status == 4

        c2 = (await db_session.execute(select(QcCallEvaluation).where(QcCallEvaluation.external_call_id == "1002"))).scalar_one()
        assert c2.status == "raw"
        assert c2.call_status == 6

        c3 = (await db_session.execute(select(QcCallEvaluation).where(QcCallEvaluation.external_call_id == "1003"))).scalar_one()
        assert c3.status == "raw"
        assert c3.call_status == 4

        c4 = (await db_session.execute(select(QcCallEvaluation).where(QcCallEvaluation.external_call_id == "1004"))).scalar_one()
        assert c4.status == "raw"
        assert c4.call_status == 4

        c5 = (await db_session.execute(select(QcCallEvaluation).where(QcCallEvaluation.external_call_id == "1005"))).scalar_one()
        assert c5.status == "raw"
        assert c5.recording_url is None

async def test_run_calls_sync_deduplication(db_session, sample_account):
    now = datetime.now(timezone.utc)
    qc = QcSettings(account_id=sample_account.id, is_enabled=True, last_call_synced_at=now - timedelta(minutes=5))
    sample_account.anomaly_settings = {"calls_backfill_done": True}
    existing_call = QcCallEvaluation(
        account_id=sample_account.id,
        external_call_id="call_dup_1",
        call_direction="in",
        call_date=now,
        duration_seconds=50,
        status="pending",
    )
    db_session.add_all([qc, existing_call])
    await db_session.commit()

    notes_data = {
        "_embedded": {
            "notes": [
                {
                    "id": "call_dup_1",
                    "note_type": "call_in",
                    "created_at": int(now.timestamp()),
                    "params": {"duration": 50, "link": "https://rec.mp3", "call_status": 4},
                }
            ]
        }
    }

    with patch("app.sync.calls_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (200, notes_data)
        ok = await run_calls_sync(db_session, sample_account.id)
        assert ok is True

        all_calls = (await db_session.execute(
            select(QcCallEvaluation).where(QcCallEvaluation.external_call_id == "call_dup_1")
        )).scalars().all()
        assert len(all_calls) == 1

async def test_run_calls_sync_skip_non_call_and_old_call_and_bad_call_status(db_session, sample_account):
    now = datetime.now(timezone.utc)
    qc = QcSettings(account_id=sample_account.id, is_enabled=True, last_call_synced_at=now - timedelta(minutes=5))
    sample_account.anomaly_settings = {"calls_backfill_done": True}
    db_session.add(qc)
    await db_session.commit()

    notes_data = {
        "_embedded": {
            "notes": [
                # 1. non call
                {"id": 5001, "note_type": "common", "created_at": int(now.timestamp())},
                # 2. old call prior to window (saved as skipped_historical)
                {
                    "id": 5002,
                    "note_type": "call_in",
                    "created_at": int((now - timedelta(days=5)).timestamp()),
                    "params": {"duration": 60, "link": "https://rec.mp3", "call_status": 4},
                },
                # 3. invalid call status string (e.g. "not-an-int")
                {
                    "id": 5003,
                    "note_type": "call_in",
                    "created_at": int(now.timestamp()),
                    "params": {"duration": 60, "link": "https://rec.mp3", "call_status": "abc"},
                },
            ]
        }
    }

    with patch("app.sync.calls_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (200, notes_data)
        ok = await run_calls_sync(db_session, sample_account.id)
        assert ok is True

        c5002 = (await db_session.execute(
            select(QcCallEvaluation).where(QcCallEvaluation.external_call_id == "5002")
        )).scalar_one()
        assert c5002.status == "skipped_historical"

        c5003 = (await db_session.execute(
            select(QcCallEvaluation).where(QcCallEvaluation.external_call_id == "5003")
        )).scalar_one()
        assert c5003.status == "pending"

async def test_run_calls_sync_notes_api_non_200(db_session, sample_account):
    now = datetime.now(timezone.utc)
    qc = QcSettings(account_id=sample_account.id, is_enabled=True, last_call_synced_at=now - timedelta(minutes=5))
    sample_account.anomaly_settings = {"calls_backfill_done": True}
    db_session.add(qc)
    await db_session.commit()

    with patch("app.sync.calls_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (500, {"error": "API error"})
        ok = await run_calls_sync(db_session, sample_account.id)
        assert ok is True

async def test_run_calls_sync_general_exception(db_session, sample_account):
    qc = QcSettings(account_id=sample_account.id, is_enabled=True, last_call_synced_at=datetime.now(timezone.utc))
    db_session.add(qc)
    await db_session.commit()

    with patch("app.sync.calls_sync.decrypt_token", side_effect=RuntimeError("Token error")):
        ok = await run_calls_sync(db_session, sample_account.id)
        assert ok is False
