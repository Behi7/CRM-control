import asyncio
import signal
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock, MagicMock
import pytest
from app.models import Account
import app.worker as worker_module
from app.worker import handle_shutdown, get_active_accounts, run_pipelines_pass, sync_loop, main

def test_handle_shutdown():
    worker_module.running = True
    handle_shutdown(signal.SIGTERM, None)
    assert worker_module.running is False
    # Reset running flag
    worker_module.running = True

async def test_get_active_accounts(db_session, sample_account):
    # Active account
    acc1 = sample_account

    # Inactive account (status != connected)
    acc2 = Account(
        subdomain="inactive-sub",
        status="disconnected",
        sync_status="active",
    )
    # Stopped account (sync_status != active)
    acc3 = Account(
        subdomain="stopped-sub",
        status="connected",
        sync_status="stopped",
    )
    db_session.add_all([acc2, acc3])
    await db_session.commit()

    accounts = await get_active_accounts()
    assert len(accounts) == 1
    assert accounts[0]["id"] == acc1.id
    assert accounts[0]["subdomain"] == acc1.subdomain
    assert accounts[0]["base_domain"] == acc1.base_domain
    assert accounts[0]["backfill_status"] == acc1.backfill_status

async def test_run_pipelines_pass(db_session, sample_account):
    with patch("app.worker.sync_pipelines_and_stages", new_callable=AsyncMock) as mock_pipe_sync:
        mock_pipe_sync.return_value = True

        await run_pipelines_pass()
        assert mock_pipe_sync.called
        assert mock_pipe_sync.call_args.args[1] == sample_account.id

async def test_sync_loop_single_pass_done_account(db_session, sample_account):
    sample_account.backfill_status = "done"
    await db_session.commit()

    with patch("app.worker.run_pipelines_pass", new_callable=AsyncMock) as mock_pipes, \
         patch("app.worker.cleanup_old_events", new_callable=AsyncMock) as mock_cleanup, \
         patch("app.worker.run_delta_sync", new_callable=AsyncMock) as mock_delta, \
         patch("app.worker.run_calls_sync", new_callable=AsyncMock) as mock_calls, \
         patch("app.worker.run_tasks_sync", new_callable=AsyncMock) as mock_tasks, \
         patch("app.worker.crm_client.close", new_callable=AsyncMock) as mock_close, \
         patch("app.worker.settings.SYNC_INTERVAL_MINUTES", 0):

        # Terminate after one iteration
        async def stop_after_first_loop(*args, **kwargs):
            worker_module.running = False
            return True

        mock_delta.side_effect = stop_after_first_loop
        worker_module.running = True

        await sync_loop()

        assert mock_pipes.called
        assert mock_cleanup.called
        assert mock_delta.called
        assert mock_calls.called
        assert mock_tasks.called
        assert mock_close.called

        worker_module.running = True  # reset

async def test_sync_loop_backfill_pending_account(db_session, sample_account):
    sample_account.backfill_status = "pending"
    await db_session.commit()

    with patch("app.worker.run_pipelines_pass", new_callable=AsyncMock), \
         patch("app.worker.cleanup_old_events", new_callable=AsyncMock), \
         patch("app.worker.run_backfill", new_callable=AsyncMock) as mock_backfill, \
         patch("app.worker.crm_client.close", new_callable=AsyncMock), \
         patch("app.worker.settings.SYNC_INTERVAL_MINUTES", 0):

        async def stop_after_backfill(*args, **kwargs):
            worker_module.running = False
            return True

        mock_backfill.side_effect = stop_after_backfill
        worker_module.running = True

        await sync_loop()

        assert mock_backfill.called
        worker_module.running = True

async def test_sync_loop_backfill_retry_cooldown(db_session, sample_account):
    # Error occurred 45 minutes ago (cooldown is 30 mins)
    now = datetime.now(timezone.utc)
    sample_account.backfill_status = "error"
    sample_account.backfill_error_at = now - timedelta(minutes=45)
    await db_session.commit()

    with patch("app.worker.run_pipelines_pass", new_callable=AsyncMock), \
         patch("app.worker.cleanup_old_events", new_callable=AsyncMock), \
         patch("app.worker.run_backfill", new_callable=AsyncMock) as mock_backfill, \
         patch("app.worker.crm_client.close", new_callable=AsyncMock), \
         patch("app.worker.settings.STALE_THRESHOLD_MINUTES", 30), \
         patch("app.worker.settings.SYNC_INTERVAL_MINUTES", 0):

        async def stop_after_backfill(*args, **kwargs):
            worker_module.running = False
            return True

        mock_backfill.side_effect = stop_after_backfill
        worker_module.running = True

        await sync_loop()

        assert mock_backfill.called
        worker_module.running = True

def test_main_entrypoint():
    with patch("signal.signal") as mock_signal, \
         patch("app.worker.sync_loop", new_callable=AsyncMock) as mock_sync_loop, \
         patch("asyncio.run") as mock_asyncio_run:
        main()
        assert mock_signal.call_count == 2
        assert mock_asyncio_run.called

def test_top_level_worker_import():
    import worker
    assert hasattr(worker, "main")

async def test_worker_periodic_timers_and_inactive_account(db_session, sample_account):
    sample_account.status = "disconnected"
    await db_session.commit()

    async def get_accs_and_stop():
        worker_module.running = False
        return [{"id": sample_account.id, "subdomain": "test", "base_domain": "amocrm.ru", "backfill_status": "done"}]

    with patch("app.worker.run_pipelines_pass", new_callable=AsyncMock) as mock_pipes, \
         patch("app.worker.cleanup_old_events", new_callable=AsyncMock) as mock_cleanup, \
         patch("app.worker.get_active_accounts", new=get_accs_and_stop), \
         patch("app.worker.crm_client.close", new_callable=AsyncMock):

        worker_module.running = True
        await sync_loop()
        worker_module.running = True

        assert mock_pipes.called
        assert mock_cleanup.called

async def test_worker_backfill_retry_when_err_time_is_none(db_session, sample_account):
    sample_account.backfill_status = "error"
    sample_account.backfill_error_at = None
    await db_session.commit()

    with patch("app.worker.run_pipelines_pass", new_callable=AsyncMock), \
         patch("app.worker.cleanup_old_events", new_callable=AsyncMock), \
         patch("app.worker.run_backfill", new_callable=AsyncMock) as mock_backfill, \
         patch("app.worker.crm_client.close", new_callable=AsyncMock), \
         patch("app.worker.settings.SYNC_INTERVAL_MINUTES", 0):

        async def stop_after_backfill(*args, **kwargs):
            worker_module.running = False
            return True

        mock_backfill.side_effect = stop_after_backfill
        worker_module.running = True
        await sync_loop()
        assert mock_backfill.called
        worker_module.running = True

async def test_worker_pipeline_pass_exceptions_handled(db_session, sample_account):
    sample_account.encrypted_token = None
    await db_session.commit()

    with patch("app.worker.sync_pipelines_and_stages", side_effect=RuntimeError("Sync fail")):
        # Should complete without raising
        await run_pipelines_pass()
