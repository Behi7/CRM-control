import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from collections import defaultdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models import Account, Lead
from app.core.security import decrypt_token
from app.core.crm_client import crm_client
from app.config import settings
from app.sync.event_sync import (
    build_sync_context, upsert_lead, process_status_changed,
    process_lead_deleted, create_fallback_interval
)

logger = logging.getLogger("DeltaSync")

async def run_delta_sync(session: AsyncSession, account_id: int) -> bool:
    acc = (await session.execute(select(Account).where(Account.id == account_id))).scalar_one_or_none()
    if not acc or not acc.encrypted_token or acc.status != "connected" or acc.sync_status == "stopped":
        return False

    try:
        token = decrypt_token(acc.encrypted_token)
    except Exception as e:
        logger.error(f"Failed to decrypt token for account {account_id}: {e}")
        return False

    job_started_at = datetime.now(timezone.utc)
    window_from = acc.last_synced_at
    if not window_from:
        window_from = job_started_at - timedelta(days=3)

    window_from_sec = int(window_from.timestamp())
    ctx = await build_sync_context(session, account_id)

    logger.info(f"Starting delta sync for account {account_id} ({acc.subdomain}) from {window_from.isoformat()}...")

    # 1. Fetch updated leads
    page = 1
    leads_count = 0
    while True:
        status, data = await crm_client.request(
            subdomain=acc.subdomain,
            base_domain=acc.base_domain,
            token=token,
            method="GET",
            path="/api/v4/leads",
            params={
                "filter[updated_at][from]": window_from_sec,
                "page": page,
                "limit": 250,
                "with": "tags,contacts,loss_reason,source_id,source",
            },
        )

        if status == 401:
            logger.warning(f"Account {account_id} token expired (401)")
            await session.execute(
                update(Account).where(Account.id == account_id).values(token_status="expired")
            )
            await session.commit()
            return False

        if status == 204 or not data:
            break
        if status != 200:
            logger.error(f"Error fetching delta leads for account {account_id}: status={status}")
            break

        items = data.get("_embedded", {}).get("leads", [])
        if not items:
            break

        for amo_lead in items:
            await upsert_lead(session, account_id, amo_lead, ctx)
            leads_count += 1

        if len(items) < 250:
            break
        page += 1

    await session.commit()
    logger.info(f"Upserted {leads_count} updated leads for account {account_id}")

    # 2. Fetch status change events
    page = 1
    event_groups = defaultdict(list)
    events_count = 0

    while True:
        status, data = await crm_client.request(
            subdomain=acc.subdomain,
            base_domain=acc.base_domain,
            token=token,
            method="GET",
            path="/api/v4/events",
            params={
                "filter[type]": "lead_status_changed,lead_deleted,lead_restored",
                "filter[created_at][from]": window_from_sec,
                "page": page,
                "limit": 100,
            },
        )

        if status == 204 or not data or status != 200:
            break

        items = data.get("_embedded", {}).get("events", [])
        if not items:
            break

        for ev in items:
            event_groups[ev["entity_id"]].append(ev)
            events_count += 1

        links = data.get("_links", {})
        if len(items) < 100 or not links.get("next", {}).get("href"):
            break
        page += 1

    # Process events per lead in chronological order
    for lead_id, ev_list in event_groups.items():
        ev_list.sort(key=lambda x: (x.get("created_at", 0), str(x.get("id", ""))))
        for ev in ev_list:
            ev_type = ev.get("type")
            if ev_type == "lead_status_changed":
                await process_status_changed(session, account_id, acc.subdomain, acc.base_domain, token, ev, ctx)
            elif ev_type == "lead_deleted":
                await process_lead_deleted(session, account_id, ev)

        # Check fallback interval
        lead_row = (await session.execute(
            select(Lead).where(Lead.account_id == account_id, Lead.external_id == str(lead_id))
        )).scalar_one_or_none()
        if lead_row:
            await create_fallback_interval(session, lead_row.id)

        await session.commit()

    # 3. Advance last_synced_at
    overlap_min = settings.SYNC_OVERLAP_MINUTES
    new_sync_time = job_started_at - timedelta(minutes=overlap_min)

    await session.execute(
        update(Account).where(Account.id == account_id).values(last_synced_at=new_sync_time)
    )
    await session.commit()
    logger.info(f"Completed delta sync for account {account_id}. Synced {leads_count} leads, {events_count} events.")
    return True


async def run_enrich_account(session: AsyncSession, account_id: int) -> bool:
    """Полный проход обогащения кастомными полями, контактами и UTM для всех сделок аккаунта."""
    acc = (await session.execute(select(Account).where(Account.id == account_id))).scalar_one_or_none()
    if not acc or not acc.encrypted_token or acc.status != "connected" or acc.sync_status == "stopped":
        return False

    try:
        token = decrypt_token(acc.encrypted_token)
    except Exception as e:
        logger.error(f"Failed to decrypt token: {e}")
        return False

    ctx = await build_sync_context(session, account_id)
    page = 1
    total = 0
    logger.info(f"Starting full BI enrichment pass for account {account_id} ({acc.subdomain})...")

    while True:
        status, data = await crm_client.request(
            subdomain=acc.subdomain,
            base_domain=acc.base_domain,
            token=token,
            method="GET",
            path="/api/v4/leads",
            params={
                "page": page,
                "limit": 250,
                "with": "tags,contacts,loss_reason,source_id,source",
            },
        )
        if status != 200 or not data:
            break

        items = data.get("_embedded", {}).get("leads", [])
        if not items:
            break

        for amo_lead in items:
            await upsert_lead(session, account_id, amo_lead, ctx)
            total += 1

        await session.commit()
        if len(items) < 250:
            break
        page += 1

    logger.info(f"Finished full BI enrichment for account {account_id}: processed {total} leads.")
    return True
