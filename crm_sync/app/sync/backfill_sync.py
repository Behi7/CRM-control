import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from collections import defaultdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from app.models import Account, Lead
from app.core.database import AsyncSessionLocal
from app.core.security import decrypt_token
from app.core.crm_client import crm_client
from app.sync.pipeline_sync import sync_pipelines_and_stages
from app.sync.event_sync import (
    build_sync_context, upsert_lead, process_status_changed,
    process_lead_deleted, process_lead_restored, create_fallback_interval
)

logger = logging.getLogger("BackfillSync")

async def run_backfill(session: AsyncSession, account_id: int) -> bool:
    acc = (await session.execute(select(Account).where(Account.id == account_id))).scalar_one_or_none()
    if not acc or not acc.encrypted_token or acc.status != "connected" or acc.sync_status == "stopped":
        return False

    try:
        token = decrypt_token(acc.encrypted_token)
    except Exception as e:
        logger.error(f"Cannot decrypt token for account {account_id}: {e}")
        return False

    logger.info(f"Starting initial historical backfill for account {account_id} ({acc.subdomain})...")
    await session.execute(
        update(Account)
        .where(Account.id == account_id)
        .values(backfill_status="in_progress", backfill_error=None, backfill_error_at=None)
    )
    await session.commit()

    try:
        # 1. Fetch account info
        acc_status, acc_data = await crm_client.request(
            subdomain=acc.subdomain,
            base_domain=acc.base_domain,
            token=token,
            method="GET",
            path="/api/v4/account",
        )
        if acc_status == 401:
            logger.warning(f"Account {account_id} token expired (401) during account fetch")
            await session.execute(
                update(Account).where(Account.id == account_id).values(
                    token_status="expired",
                    backfill_status="error",
                    backfill_error="Token expired (401)",
                    backfill_error_at=datetime.now(timezone.utc),
                )
            )
            await session.commit()
            return False

        if acc_status == 200 and acc_data:
            tz = acc_data.get("timezone", "UTC")
            ext_id = str(acc_data.get("id", ""))
            await session.execute(
                update(Account).where(Account.id == account_id).values(timezone=tz, external_account_id=ext_id)
            )
            await session.commit()

        # 2. Sync pipelines, stages, managers, fields
        pipe_sync_ok = await sync_pipelines_and_stages(session, account_id, acc.subdomain, acc.base_domain, token)
        if not pipe_sync_ok:
            acc_check = (await session.execute(select(Account.token_status).where(Account.id == account_id))).scalar_one_or_none()
            error_msg = "Token expired (401)" if acc_check == "expired" else "Pipeline and stage structure sync failed"
            await session.execute(
                update(Account).where(Account.id == account_id).values(
                    backfill_status="error",
                    backfill_error=error_msg,
                    backfill_error_at=datetime.now(timezone.utc),
                )
            )
            await session.commit()
            return False

        # 3. Fetch all historical leads
        cursor = acc.backfill_cursor or {}
        current_stage = cursor.get("stage", "leads")
        ctx = await build_sync_context(session, account_id)
        total_leads = cursor.get("total_leads", 0)

        if current_stage == "leads":
            MAX_LEADS_PAGES = 2000  # safety cap: 2000 * 250 = 500,000 leads
            page = cursor.get("page", 1)
            last_leads_first_id = cursor.get("last_leads_first_id")
            if page > 1:
                logger.info(f"Resuming backfill leads from page {page} for account {account_id} ({total_leads} leads already fetched)")

            while page <= MAX_LEADS_PAGES:
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
                if status == 401:
                    logger.warning(f"Account {account_id} token expired (401) during backfill leads")
                    await session.execute(
                        update(Account).where(Account.id == account_id).values(
                            token_status="expired",
                            backfill_status="error",
                            backfill_error="Token expired (401)",
                            backfill_error_at=datetime.now(timezone.utc),
                        )
                    )
                    await session.commit()
                    return False

                if status == 204 or not data:
                    break
                if status != 200:
                    logger.error(f"Error fetching backfill leads for account {account_id}: status={status}")
                    await session.execute(
                        update(Account).where(Account.id == account_id).values(
                            backfill_status="error",
                            backfill_error=f"Leads fetch failed: status={status}",
                            backfill_error_at=datetime.now(timezone.utc),
                        )
                    )
                    await session.commit()
                    return False

                embedded = (data.get("_embedded") or {}) if isinstance(data, dict) else {}
                items = embedded.get("leads") or []
                if not items:
                    break

                # Loop detection
                current_first_id = items[0].get("id") if items else None
                if current_first_id and current_first_id == last_leads_first_id:
                    logger.warning(f"Backfill: detected pagination loop on page {page} for account {account_id}. Breaking.")
                    break
                last_leads_first_id = current_first_id

                for amo_lead in items:
                    await upsert_lead(session, account_id, amo_lead, ctx)
                    total_leads += 1

                # Persist progress in backfill_cursor
                next_cursor = {
                    "stage": "leads",
                    "page": page + 1,
                    "total_leads": total_leads,
                    "last_leads_first_id": current_first_id,
                }
                await session.execute(
                    update(Account).where(Account.id == account_id).values(backfill_cursor=next_cursor)
                )
                await session.commit()
                if len(items) < 250:
                    break
                page += 1

            if page > MAX_LEADS_PAGES:
                logger.warning(f"Backfill hit max leads pages limit ({MAX_LEADS_PAGES}) for account {account_id}")

            logger.info(f"Backfill: downloaded {total_leads} historical leads for account {account_id}")

            # Switch cursor to events stage
            cursor_events = {
                "stage": "events",
                "window_from": None,
                "total_leads": total_leads,
                "total_events": 0,
            }
            await session.execute(
                update(Account).where(Account.id == account_id).values(backfill_cursor=cursor_events)
            )
            await session.commit()

        # 4. Fetch historical events in 30-day slices
        min_lead_time_res = await session.execute(
            select(func.min(Lead.crm_created_at)).where(Lead.account_id == account_id)
        )
        min_created = min_lead_time_res.scalar()
        now_utc = datetime.now(timezone.utc)

        start_time = min_created - timedelta(days=1) if min_created else now_utc - timedelta(days=365)
        window_from = int(start_time.timestamp())
        if cursor.get("stage") == "events" and cursor.get("window_from"):
            window_from = max(window_from, int(cursor["window_from"]))
            logger.info(f"Resuming backfill events from window timestamp {window_from} for account {account_id}")

        now_sec = int(now_utc.timestamp())
        slice_sec = 30 * 86400
        MAX_EVENTS_PAGES = 500  # safety cap: 500 * 100 = 50,000 events per 30-day window

        total_events = cursor.get("total_events", 0) if cursor.get("stage") == "events" else 0
        while window_from < now_sec:
            window_to = min(window_from + slice_sec, now_sec)
            page = 1
            event_groups = defaultdict(list)
            last_events_first_id = None

            while page <= MAX_EVENTS_PAGES:
                status, data = await crm_client.request(
                    subdomain=acc.subdomain,
                    base_domain=acc.base_domain,
                    token=token,
                    method="GET",
                    path="/api/v4/events",
                    params={
                        "filter[type]": "lead_status_changed,lead_deleted,lead_restored",
                        "filter[created_at][from]": window_from,
                        "filter[created_at][to]": window_to,
                        "page": page,
                        "limit": 100,
                    },
                )
                if status == 401:
                    logger.warning(f"Account {account_id} token expired (401) during backfill events")
                    await session.execute(
                        update(Account).where(Account.id == account_id).values(
                            token_status="expired",
                            backfill_status="error",
                            backfill_error="Token expired (401)",
                            backfill_error_at=datetime.now(timezone.utc),
                        )
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
                    logger.warning(f"Backfill events: detected pagination loop on page {page} for account {account_id}. Breaking.")
                    break
                last_events_first_id = current_first_id

                for ev in items:
                    event_groups[ev["entity_id"]].append(ev)
                    total_events += 1

                links = data.get("_links", {})
                if len(items) < 100 or not links.get("next", {}).get("href"):
                    break
                page += 1

            if page > MAX_EVENTS_PAGES:
                logger.warning(
                    f"Backfill events hit max pages limit ({MAX_EVENTS_PAGES}) "
                    f"in window {window_from}-{window_to} for account {account_id}"
                )

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

                # Fallback interval check
                lead_row = (await session.execute(
                    select(Lead).where(Lead.account_id == account_id, Lead.external_id == str(lead_id))
                )).scalar_one_or_none()
                if lead_row:
                    await create_fallback_interval(session, lead_row.id)

                # Commit per lead to release savepoints and prevent subtrans SLRU exhaustion
                await session.commit()

            window_from = window_to
            next_cursor = {
                "stage": "events",
                "window_from": window_from,
                "total_leads": total_leads,
                "total_events": total_events,
            }
            await session.execute(
                update(Account).where(Account.id == account_id).values(backfill_cursor=next_cursor)
            )
            await session.commit()

        # 5. Mark backfill complete
        await session.execute(
            update(Account)
            .where(Account.id == account_id)
            .values(
                backfill_status="done",
                backfill_error=None,
                backfill_error_at=None,
                backfill_cursor=None,
                last_synced_at=now_utc,
            )
        )
        await session.commit()
        logger.info(f"Historical backfill successfully finished for account {account_id}! Processed {total_leads} leads, {total_events} events.")
        return True

    except Exception as e:
        logger.error(f"Error during backfill for account {account_id}: {e}", exc_info=True)
        try:
            await session.rollback()
        except Exception:
            pass  # Original connection might be broken or already closed

        try:
            async with AsyncSessionLocal() as err_session:
                await err_session.execute(
                    update(Account)
                    .where(Account.id == account_id)
                    .values(
                        backfill_status="error",
                        backfill_error=str(e),
                        backfill_error_at=datetime.now(timezone.utc),
                    )
                )
                await err_session.commit()
        except Exception as err_e:
            logger.error(f"Failed to record backfill error status for account {account_id}: {err_e}")
        return False
