import asyncio
import logging
import signal
import sys
from datetime import datetime, timezone
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models import Account
from app.sync.pipeline_sync import sync_pipelines_and_stages
from app.sync.delta_sync import run_delta_sync
from app.sync.backfill_sync import run_backfill
from app.sync.calls_sync import run_calls_sync
from app.sync.tasks_sync import run_tasks_sync
from app.sync.event_sync import cleanup_old_events
from app.core.crm_client import crm_client
from app.core.security import decrypt_token
from app.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("CrmSyncWorker")

running = True

def handle_shutdown(sig, frame):
    global running
    logger.info(f"Received signal {sig}, initiating graceful shutdown...")
    running = False

async def get_active_accounts() -> list[dict]:
    """Возвращает скалярные DTO активных аккаунтов во избежание проблем с detached ORM объектами."""
    async with AsyncSessionLocal() as session:
        stmt = select(
            Account.id,
            Account.subdomain,
            Account.base_domain,
            Account.backfill_status,
        ).where(
            Account.status == "connected",
            Account.sync_status == "active",
        ).order_by(Account.id.asc())
        res = await session.execute(stmt)
        return [
            {
                "id": row.id,
                "subdomain": row.subdomain,
                "base_domain": row.base_domain,
                "backfill_status": row.backfill_status,
            }
            for row in res.all()
        ]

async def sync_loop():
    logger.info("🚀 AmoCRM Python Sync Worker initialized and started.")
    logger.info(f"Configuration: interval={settings.SYNC_INTERVAL_MINUTES}m, overlap={settings.SYNC_OVERLAP_MINUTES}m, rps={settings.AMO_CRM_RATE_LIMIT_RPS}")

    # Initial pipeline check and event cleanup on startup
    await run_pipelines_pass()
    try:
        async with AsyncSessionLocal() as session:
            await cleanup_old_events(session, retention_days=30)
    except Exception as e:
        logger.error(f"Initial cleanup of old events failed: {e}")

    last_pipeline_sync = datetime.now(timezone.utc)
    last_cleanup = datetime.now(timezone.utc)
    interval_sec = settings.SYNC_INTERVAL_MINUTES * 60

    while running:
        try:
            logger.info("Starting scheduled delta sync cycle across active accounts...")
            accounts = await get_active_accounts()
            logger.info(f"Found {len(accounts)} active connected accounts for sync.")

            for acc_info in accounts:
                if not running:
                    break

                acc_id = acc_info["id"]
                subdomain = acc_info["subdomain"]

                async with AsyncSessionLocal() as session:
                    # Fetch fresh account state within active session to avoid stale data / race conditions
                    acc_fresh = (
                        await session.execute(select(Account).where(Account.id == acc_id))
                    ).scalar_one_or_none()

                    if not acc_fresh or acc_fresh.status != "connected" or acc_fresh.sync_status != "active":
                        logger.info(f"Account #{acc_id} ({subdomain}) is no longer active, skipping.")
                        continue

                    # Check fresh backfill status with cooldown retry
                    should_retry_backfill = False
                    if acc_fresh.backfill_status == "error":
                        err_time = acc_fresh.backfill_error_at
                        if err_time:
                            if err_time.tzinfo is None:
                                err_time = err_time.replace(tzinfo=timezone.utc)
                            elapsed = (datetime.now(timezone.utc) - err_time).total_seconds()
                            if elapsed >= settings.STALE_THRESHOLD_MINUTES * 60:
                                should_retry_backfill = True
                                logger.info(
                                    f"Retrying backfill for Account #{acc_id} ({subdomain}) after cooldown "
                                    f"({int(elapsed // 60)}m >= {settings.STALE_THRESHOLD_MINUTES}m)..."
                                )
                        else:
                            should_retry_backfill = True

                    if acc_fresh.backfill_status in ("pending", "in_progress") or should_retry_backfill:
                        logger.info(f"Account #{acc_id} ({subdomain}) starting backfill (status={acc_fresh.backfill_status})...")
                        await run_backfill(session, acc_id)
                    elif acc_fresh.backfill_status == "done":
                        await run_delta_sync(session, acc_id)
                        await run_calls_sync(session, acc_id)
                        await run_tasks_sync(session, acc_id)
                    else:
                        logger.warning(
                            f"Account #{acc_id} ({subdomain}) backfill status is '{acc_fresh.backfill_status}' "
                            f"(error={acc_fresh.backfill_error}). Waiting for cooldown before retry."
                        )

            # Check if 60 minutes passed for pipeline sync
            now = datetime.now(timezone.utc)
            if (now - last_pipeline_sync).total_seconds() >= 3600:
                await run_pipelines_pass()
                last_pipeline_sync = now

            # Check if 24 hours passed for cleanup of processed events
            if (now - last_cleanup).total_seconds() >= 86400:
                try:
                    async with AsyncSessionLocal() as session:
                        await cleanup_old_events(session, retention_days=30)
                    last_cleanup = now
                except Exception as e:
                    logger.error(f"Error during scheduled cleanup of old events: {e}")

        except Exception as e:
            logger.error(f"Unexpected error in sync loop: {e}", exc_info=True)

        # Sleep in small slices to respond quickly to shutdown signal
        for _ in range(interval_sec):
            if not running:
                break
            await asyncio.sleep(1)

    try:
        await crm_client.close()
    except Exception:
        pass
    logger.info("Sync worker stopped cleanly.")


async def run_pipelines_pass():
    try:
        accounts = await get_active_accounts()
        logger.info(f"Running pipeline & user definitions sync for {len(accounts)} accounts...")
        for acc_info in accounts:
            if not running:
                break
            acc_id = acc_info["id"]
            try:
                async with AsyncSessionLocal() as session:
                    acc_fresh = (
                        await session.execute(select(Account).where(Account.id == acc_id))
                    ).scalar_one_or_none()

                    if not acc_fresh or not acc_fresh.encrypted_token or acc_fresh.status != "connected":
                        continue

                    token = decrypt_token(acc_fresh.encrypted_token)
                    await sync_pipelines_and_stages(
                        session,
                        acc_fresh.id,
                        acc_fresh.subdomain,
                        acc_fresh.base_domain,
                        token,
                    )
            except Exception as e:
                logger.error(f"Error syncing pipelines for account #{acc_id}: {e}")
    except Exception as e:
        logger.error(f"Error during run_pipelines_pass: {e}")


def main():
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)
    asyncio.run(sync_loop())

if __name__ == "__main__":
    main()
