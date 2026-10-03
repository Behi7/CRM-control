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
    process_lead_deleted, process_lead_restored, create_fallback_interval
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

    try:
        job_started_at = datetime.now(timezone.utc)
        window_from = acc.last_synced_at
        if not window_from:
            window_from = job_started_at - timedelta(days=3)

        window_from_sec = int(window_from.timestamp())
        ctx = await build_sync_context(session, account_id)

        logger.info(f"Starting delta sync for account {account_id} ({acc.subdomain}) from {window_from.isoformat()}...")

        # 1. Fetch updated leads
        MAX_DELTA_LEADS_PAGES = 100  # safety cap: 100 * 250 = 25,000 leads per delta window
        page = 1
        leads_count = 0
        last_leads_first_id = None

        while page <= MAX_DELTA_LEADS_PAGES:
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

            embedded = (data.get("_embedded") or {}) if isinstance(data, dict) else {}
            items = embedded.get("leads") or []
            if not items:
                break

            # Loop detection
            current_first_id = items[0].get("id") if items else None
            if current_first_id and current_first_id == last_leads_first_id:
                logger.warning(f"Delta sync: detected pagination loop on page {page} for account {account_id}. Breaking.")
                break
            last_leads_first_id = current_first_id

            for amo_lead in items:
                await upsert_lead(session, account_id, amo_lead, ctx)
                leads_count += 1

            if len(items) < 250:
                break
            page += 1

        if page > MAX_DELTA_LEADS_PAGES:
            logger.warning(f"Delta sync hit max leads pages limit ({MAX_DELTA_LEADS_PAGES}) for account {account_id}")

        await session.commit()
        logger.info(f"Upserted {leads_count} updated leads for account {account_id}")

        # 2. Fetch status change events
        MAX_DELTA_EVENTS_PAGES = 200  # safety cap: 200 * 100 = 20,000 events per delta window
        page = 1
        event_groups = defaultdict(list)
        events_count = 0
        last_events_first_id = None

        while page <= MAX_DELTA_EVENTS_PAGES:
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

            if status == 401:
                logger.warning(f"Account {account_id} token expired (401) during delta events fetch")
                await session.execute(
                    update(Account).where(Account.id == account_id).values(token_status="expired")
                )
                await session.commit()
                return False

            if status == 204 or not data or status != 200:
                break

            embedded = (data.get("_embedded") or {}) if isinstance(data, dict) else {}
            items = embedded.get("events") or []
            if not items:
                break

            # Loop detection
            current_first_id = items[0].get("id") if items else None
            if current_first_id and current_first_id == last_events_first_id:
                logger.warning(f"Delta sync events: detected pagination loop on page {page} for account {account_id}. Breaking.")
                break
            last_events_first_id = current_first_id

            for ev in items:
                event_groups[ev["entity_id"]].append(ev)
                events_count += 1

            links = data.get("_links", {})
            if len(items) < 100 or not links.get("next", {}).get("href"):
                break
            page += 1

        if page > MAX_DELTA_EVENTS_PAGES:
            logger.warning(f"Delta sync events hit max pages limit ({MAX_DELTA_EVENTS_PAGES}) for account {account_id}")

        # Process events per lead in chronological order
        for lead_id, ev_list in event_groups.items():
            ev_list.sort(key=lambda x: (x.get("created_at", 0), str(x.get("id", ""))))
            for ev in ev_list:
                ev_type = ev.get("type")
                if ev_type == "lead_status_changed":
                    await process_status_changed(session, account_id, acc.subdomain, acc.base_domain, token, ev, ctx)
                elif ev_type == "lead_deleted":
                    await process_lead_deleted(session, account_id, ev)
                elif ev_type == "lead_restored":
                    await process_lead_restored(session, account_id, ev)

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

    except Exception as e:
        logger.error(f"Error during delta sync for account {account_id}: {e}", exc_info=True)
        try:
            await session.rollback()
        except Exception:
            pass
        return False


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

    try:
        ctx = await build_sync_context(session, account_id)
        MAX_ENRICH_PAGES = 2000  # safety cap: 2000 * 250 = 500,000 leads
        page = 1
        total = 0
        last_enrich_first_id = None
        logger.info(f"Starting full BI enrichment pass for account {account_id} ({acc.subdomain})...")

        while page <= MAX_ENRICH_PAGES:
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

            # Loop detection
            current_first_id = items[0].get("id") if items else None
            if current_first_id and current_first_id == last_enrich_first_id:
                logger.warning(f"Enrich pass: detected pagination loop on page {page} for account {account_id}. Breaking.")
                break
            last_enrich_first_id = current_first_id

            for amo_lead in items:
                await upsert_lead(session, account_id, amo_lead, ctx)
                total += 1

            await session.commit()
            if len(items) < 250:
                break
            page += 1

        if page > MAX_ENRICH_PAGES:
            logger.warning(f"Enrich pass hit max pages limit ({MAX_ENRICH_PAGES}) for account {account_id}")

        logger.info(f"Finished full BI enrichment for account {account_id}: processed {total} leads.")
        return True

    except Exception as e:
        logger.error(f"Error during enrichment for account {account_id}: {e}", exc_info=True)
        try:
            await session.rollback()
        except Exception:
            pass
        return False
