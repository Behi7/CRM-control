import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm.attributes import flag_modified

from app.models import (
    Account, Lead, Pipeline, AmoUser,
    QcSettings, QcCallEvaluation
)
from app.core.security import decrypt_token
from app.core.crm_client import crm_client

logger = logging.getLogger("CallsSync")

CALL_STATUS_DESCRIPTIONS = {
    1: "Оставлено сообщение на автоответчик",
    2: "Перезвонить позже",
    3: "Нет на месте",
    5: "Неверный номер",
    6: "Не дозвонился / абонент не ответил",
    7: "Номер занят",
}

async def run_calls_sync(session: AsyncSession, account_id: int) -> bool:
    """
    Синхронизирует все звонки из AmoCRM и сохраняет их в БД (таблицу qc_call_evaluations).
    Все звонки сохраняются в БД для модуля аномалий и аналитики.
    Контроль качества (статус 'pending' для анализа нейросетью) активируется только
    для свежих целевых звонков и только при включенном тумблере КК (is_enabled == True).
    """
    try:
        # 1. Проверяем сам аккаунт и наличие токенов
        acc_stmt = select(Account).where(Account.id == account_id)
        acc_res = await session.execute(acc_stmt)
        acc = acc_res.scalar_one_or_none()

        if not acc or not acc.encrypted_token or acc.status != "connected" or acc.sync_status == "stopped":
            return False

        try:
            amo_token = decrypt_token(acc.encrypted_token)
        except Exception as e:
            logger.error(f"Cannot decrypt token for account #{account_id}: {e}")
            return False

        if not amo_token:
            return False

        # 2. Получаем или создаем настройки контроля качества (для порогов длительности и курсора)
        qc_stmt = select(QcSettings).where(QcSettings.account_id == account_id)
        qc_res = await session.execute(qc_stmt)
        qc_settings = qc_res.scalar_one_or_none()
        if not qc_settings:
            qc_settings = QcSettings(account_id=account_id, is_enabled=False)
            session.add(qc_settings)
            await session.commit()
            await session.refresh(qc_settings)

        # 3. Фиксируем временное окно и параметры синхронизации
        job_started_at = datetime.now(timezone.utc)
        anomaly_cfg = dict(acc.anomaly_settings or {})
        calls_backfill_done = anomaly_cfg.get("calls_backfill_done", False)

        filter_params: Dict[str, Any] = {
            "filter[note_type]": "call_in,call_out",
            "limit": 250,
        }

        # Если бэкфилл уже выполнен и есть курсор — берем инкрементальную дельту
        is_backfill = not calls_backfill_done
        if not is_backfill and qc_settings.last_call_synced_at:
            window_from = qc_settings.last_call_synced_at - timedelta(minutes=5)
            filter_params["filter[updated_at][from]"] = max(0, int(window_from.timestamp()))
            logger.info(f"Starting incremental calls sync for account #{account_id} ({acc.subdomain}) from {window_from.isoformat()}...")
        else:
            logger.info(f"Starting full historical calls backfill for account #{account_id} ({acc.subdomain})...")

        # 4. Постраничная выгрузка
        page = 1
        MAX_CALL_PAGES = 500 if is_backfill else 50
        total_found = 0
        total_saved = 0
        total_pending = 0

        leads_cache: Dict[str, Optional[tuple]] = {}  # ext_id -> (id, pipeline_id, resp_user_id)
        users_cache: Dict[str, Optional[int]] = {}

        while page <= MAX_CALL_PAGES:
            filter_params["page"] = page
            status, data = await crm_client.request(
                subdomain=acc.subdomain,
                base_domain=acc.base_domain,
                token=amo_token,
                method="GET",
                path="/api/v4/leads/notes",
                params=filter_params,
            )

            if status == 204 or (status == 200 and not data):
                break
            if status != 200:
                logger.warning(f"Account #{account_id}: fetch leads/notes returned status {status}")
                break

            embedded = data.get("_embedded", {}) if isinstance(data, dict) else {}
            notes = embedded.get("notes", [])
            if not notes:
                break

            call_notes = [n for n in notes if n.get("note_type") in ("call_in", "call_out")]
            if not call_notes:
                if len(notes) < 250:
                    break
                page += 1
                continue

            note_ids = [str(n.get("id")) for n in call_notes if n.get("id")]
            existing_ids_stmt = select(QcCallEvaluation.external_call_id).where(
                QcCallEvaluation.account_id == account_id,
                QcCallEvaluation.external_call_id.in_(note_ids)
            )
            existing_ids = set((await session.execute(existing_ids_stmt)).scalars().all())

            batch_evals = []

            for note in call_notes:
                total_found += 1
                note_id = str(note.get("id"))
                if note_id in existing_ids:
                    continue

                lead_ext_id = str(note.get("entity_id") or "")
                params = note.get("params") or {}
                duration = int(params.get("duration") or 0)

                raw_link = params.get("link")
                link = raw_link.strip() if isinstance(raw_link, str) and raw_link.strip().startswith("http") else None

                phone = str(params.get("phone") or "")
                direction = "in" if note.get("note_type") == "call_in" else "out"
                call_created_ts = note.get("created_at") or int(job_started_at.timestamp())
                call_date = datetime.fromtimestamp(call_created_ts, tz=timezone.utc)

                # Кешированный поиск сделки
                lead_id = None
                pipeline_id = None
                lead_resp_id = None
                if lead_ext_id:
                    if lead_ext_id not in leads_cache:
                        l_row = (await session.execute(
                            select(Lead.id, Lead.pipeline_id, Lead.responsible_user_id).where(
                                Lead.account_id == account_id,
                                Lead.external_id == lead_ext_id,
                            )
                        )).first()
                        leads_cache[lead_ext_id] = (l_row[0], l_row[1], l_row[2]) if l_row else None
                    if leads_cache[lead_ext_id]:
                        lead_id, pipeline_id, lead_resp_id = leads_cache[lead_ext_id]

                # Кешированный поиск менеджера
                responsible_user_ext_id = str(note.get("responsible_user_id") or "")
                amo_user_id = None
                if responsible_user_ext_id:
                    if responsible_user_ext_id not in users_cache:
                        u_row = (await session.execute(
                            select(AmoUser.id).where(
                                AmoUser.account_id == account_id,
                                AmoUser.external_id == responsible_user_ext_id,
                            )
                        )).scalar_one_or_none()
                        users_cache[responsible_user_ext_id] = u_row
                    amo_user_id = users_cache[responsible_user_ext_id]
                if not amo_user_id:
                    amo_user_id = lead_resp_id

                # Разметка статуса звонка:
                raw_call_status = params.get("call_status")
                call_status = None
                if raw_call_status is not None:
                    try:
                        call_status = int(raw_call_status)
                    except (ValueError, TypeError):
                        call_status = None

                status_val = "pending"
                skip_reason = None

                if call_status is not None and call_status != 4:
                    status_val = "skipped_not_answered"
                    skip_reason = CALL_STATUS_DESCRIPTIONS.get(call_status, f"код статуса {call_status}")
                elif not link:
                    status_val = "skipped_no_audio"
                    skip_reason = "Нет ссылки на аудиозапись"
                elif is_backfill or (call_date < job_started_at - timedelta(days=2)):
                    status_val = "skipped_historical"
                    skip_reason = "Архивный звонок (до активации КК)"
                else:
                    status_val = "pending"
                    skip_reason = None
                    total_pending += 1

                batch_evals.append({
                    "account_id": account_id,
                    "external_call_id": note_id,
                    "lead_id": lead_id,
                    "pipeline_id": pipeline_id,
                    "amo_user_id": amo_user_id,
                    "phone": phone,
                    "call_direction": direction,
                    "call_date": call_date,
                    "duration_seconds": duration,
                    "recording_url": link,
                    "status": status_val,
                    "skip_reason": skip_reason,
                    "created_at": datetime.now(timezone.utc),
                })

            if batch_evals:
                insert_stmt = insert(QcCallEvaluation).values(batch_evals).on_conflict_do_nothing(
                    index_elements=["account_id", "external_call_id"]
                )
                await session.execute(insert_stmt)
                await session.commit()
                total_saved += len(batch_evals)

            if len(notes) < 250:
                break
            page += 1

        # Обновляем курсор и флаг завершения бэкфилла
        qc_settings.last_call_synced_at = job_started_at
        if is_backfill:
            anomaly_cfg["calls_backfill_done"] = True
            acc.anomaly_settings = anomaly_cfg
            flag_modified(acc, "anomaly_settings")
        await session.commit()

        logger.info(
            f"Completed calls sync for account #{account_id}: "
            f"found={total_found}, saved={total_saved}, pending_queued={total_pending}, is_backfill={is_backfill}"
        )
        return True

    except Exception as e:
        logger.error(f"Error in run_calls_sync for account #{account_id}: {e}", exc_info=True)
        return False
