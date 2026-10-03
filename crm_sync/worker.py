import asyncio
import logging
import signal
import sys
from datetime import datetime, timezone
from sqlalchemy import select
from database import AsyncSessionLocal
from models import Account
from pipeline_sync import sync_pipelines_and_stages
from delta_sync import run_delta_sync
from backfill_sync import run_backfill
from security import decrypt_token
from config import settings

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

async def get_active_accounts():
    async with AsyncSessionLocal() as session:
        stmt = select(Account).where(
            Account.status == "connected",
            Account.sync_status == "active",
        ).order_by(Account.id.asc())
        res = await session.execute(stmt)
        return res.scalars().all()

async def sync_loop():
    logger.info("🚀 AmoCRM Python Sync Worker initialized and started.")
    logger.info(f"Configuration: interval={settings.SYNC_INTERVAL_MINUTES}m, overlap={settings.SYNC_OVERLAP_MINUTES}m, rps={settings.AMO_CRM_RATE_LIMIT_RPS}")

    # Initial pipeline check on startup
    await run_pipelines_pass()

    last_pipeline_sync = datetime.now(timezone.utc)
    interval_sec = settings.SYNC_INTERVAL_MINUTES * 60

    while running:
        try:
            logger.info("Starting scheduled delta sync cycle across active accounts...")
            accounts = await get_active_accounts()
            logger.info(f"Found {len(accounts)} active connected accounts for sync.")

            for acc in accounts:
                if not running:
                    break

                async with AsyncSessionLocal() as session:
                    # Check backfill
                    if acc.backfill_status != "done":
                        logger.info(f"Account #{acc.id} ({acc.subdomain}) requires backfill. Starting...")
                        await run_backfill(session, acc.id)
                    else:
                        await run_delta_sync(session, acc.id)

            # Check if 60 minutes passed for pipeline sync
            now = datetime.now(timezone.utc)
            if (now - last_pipeline_sync).total_seconds() >= 3600:
                await run_pipelines_pass()
                last_pipeline_sync = now

        except Exception as e:
            logger.error(f"Unexpected error in sync loop: {e}", exc_info=True)

        # Sleep in small slices to respond quickly to shutdown signal
        for _ in range(interval_sec):
            if not running:
                break
            await asyncio.sleep(1)

    logger.info("Sync worker stopped cleanly.")


async def run_pipelines_pass():
    try:
        accounts = await get_active_accounts()
        logger.info(f"Running pipeline & user definitions sync for {len(accounts)} accounts...")
        for acc in accounts:
            if not running or not acc.encrypted_token:
                continue
            try:
                token = decrypt_token(acc.encrypted_token)
                async with AsyncSessionLocal() as session:
                    await sync_pipelines_and_stages(session, acc.id, acc.subdomain, acc.base_domain, token)
            except Exception as e:
                logger.error(f"Error syncing pipelines for account #{acc.id}: {e}")
    except Exception as e:
        logger.error(f"Error during run_pipelines_pass: {e}")


def main():
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)
    asyncio.run(sync_loop())

if __name__ == "__main__":
    main()
