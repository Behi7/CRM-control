import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm.attributes import flag_modified

from app.models import (
    Account, Lead, AmoUser, LeadTask
)
from app.core.security import decrypt_token
from app.core.crm_client import crm_client

logger = logging.getLogger("TasksSync")

async def run_tasks_sync(session: AsyncSession, account_id: int) -> bool:
    """Синхронизирует задачи по сделкам из AmoCRM и сохраняет их в таблицу lead_tasks."""
    try:
        acc_stmt = select(Account).where(Account.id == account_id)
        acc_res = await session.execute(acc_stmt)
        acc = acc_res.scalar_one_or_none()

        if not acc or not acc.encrypted_token or acc.status != "connected" or acc.sync_status == "stopped":
            return False

        amo_token = decrypt_token(acc.encrypted_token)
        if not amo_token:
            return False

        anomaly_cfg = dict(acc.anomaly_settings or {})
        last_synced_str = anomaly_cfg.get("last_tasks_synced_at")

        now_utc = datetime.now(timezone.utc)
        filter_params: Dict[str, Any] = {
            "filter[entity_type]": "leads",
            "limit": 250,
        }

        if last_synced_str:
            try:
                last_dt = datetime.fromisoformat(last_synced_str)
                # 5 минут оверлап для надежности
                from_ts = int((last_dt - timedelta(minutes=5)).timestamp())
                filter_params["filter[updated_at][from]"] = max(0, from_ts)
            except Exception as e:
                logger.warning(f"Account #{account_id}: Invalid last_tasks_synced_at '{last_synced_str}': {e}")

        logger.info(f"Starting tasks sync for account #{account_id} ({acc.subdomain})...")

        page = 1
        total_synced = 0
        leads_cache: Dict[str, Optional[int]] = {}
        users_cache: Dict[str, Optional[int]] = {}

        while True:
            filter_params["page"] = page
            status_code, data = await crm_client.request(
                subdomain=acc.subdomain,
                base_domain=acc.base_domain,
                token=amo_token,
                method="GET",
                path="/api/v4/tasks",
                params=filter_params,
            )

            if status_code == 204 or not data:
                break
            if status_code != 200:
                logger.warning(f"Tasks sync failed for #{account_id} with status {status_code}: {data}")
                break

            tasks_list = data.get("_embedded", {}).get("tasks", [])
            if not tasks_list:
                break

            for t in tasks_list:
                task_id = str(t.get("id"))
                entity_id = t.get("entity_id")
                if not task_id or not entity_id:
                    continue

                lead_ext_id = str(entity_id)
                if lead_ext_id not in leads_cache:
                    lead_row = (await session.execute(
                        select(Lead.id).where(
                            Lead.account_id == account_id,
                            Lead.external_id == lead_ext_id,
                        )
                    )).scalar_one_or_none()
                    leads_cache[lead_ext_id] = lead_row
                lead_id = leads_cache[lead_ext_id]

                resp_user_ext = str(t.get("responsible_user_id") or "")
                if resp_user_ext and resp_user_ext not in users_cache:
                    u_row = (await session.execute(
                        select(AmoUser.id).where(
                            AmoUser.account_id == account_id,
                            AmoUser.external_id == resp_user_ext,
                        )
                    )).scalar_one_or_none()
                    users_cache[resp_user_ext] = u_row
                responsible_user_id = users_cache.get(resp_user_ext)

                created_ts = t.get("created_at")
                task_created_at = datetime.fromtimestamp(created_ts, tz=timezone.utc) if created_ts else now_utc

                complete_till_ts = t.get("complete_till")
                complete_till = datetime.fromtimestamp(complete_till_ts, tz=timezone.utc) if complete_till_ts else None

                is_completed = bool(t.get("is_completed"))
                updated_ts = t.get("updated_at")
                task_closed_at = datetime.fromtimestamp(updated_ts, tz=timezone.utc) if (is_completed and updated_ts) else None

                stmt = insert(LeadTask).values(
                    account_id=account_id,
                    external_task_id=task_id,
                    lead_id=lead_id,
                    lead_external_id=lead_ext_id,
                    responsible_user_id=responsible_user_id,
                    task_type_id=t.get("task_type_id"),
                    text=t.get("text"),
                    is_completed=is_completed,
                    task_created_at=task_created_at,
                    complete_till=complete_till,
                    task_closed_at=task_closed_at,
                    created_at=now_utc,
                    updated_at=now_utc,
                ).on_conflict_do_update(
                    index_elements=["account_id", "external_task_id"],
                    set_={
                        "lead_id": lead_id,
                        "lead_external_id": lead_ext_id,
                        "responsible_user_id": responsible_user_id,
                        "task_type_id": t.get("task_type_id"),
                        "text": t.get("text"),
                        "is_completed": is_completed,
                        "complete_till": complete_till,
                        "task_closed_at": task_closed_at,
                        "updated_at": now_utc,
                    }
                )
                await session.execute(stmt)
                total_synced += 1

            await session.commit()

            if len(tasks_list) < 250:
                break
            page += 1

        # Обновляем курсор синхронизации задач
        anomaly_cfg["last_tasks_synced_at"] = now_utc.isoformat()
        acc.anomaly_settings = anomaly_cfg
        flag_modified(acc, "anomaly_settings")
        await session.commit()

        logger.info(f"Account #{account_id}: Tasks sync completed. Synced {total_synced} tasks.")
        return True

    except Exception as e:
        logger.error(f"Error syncing tasks for account #{account_id}: {e}", exc_info=True)
        return False

