import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

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
    """Синхронизирует недавние звонки из AmoCRM и сохраняет их в БД (для последующего анализа бэкендом)."""
    try:
        # 1. Проверяем настройки контроля качества для аккаунта
        qc_stmt = select(QcSettings).where(QcSettings.account_id == account_id)
        qc_res = await session.execute(qc_stmt)
        qc_settings = qc_res.scalar_one_or_none()

        if not qc_settings or not qc_settings.is_enabled:
            return False

        # 2. Проверяем сам аккаунт и наличие токенов
        acc_stmt = select(Account).where(Account.id == account_id)
        acc_res = await session.execute(acc_stmt)
        acc = acc_res.scalar_one_or_none()

        if not acc or not acc.encrypted_token or acc.status != "connected" or acc.sync_status == "stopped":
            return False

        amo_token = decrypt_token(acc.encrypted_token)

        # 3. Фиксируем временное окно
        job_started_at = datetime.now(timezone.utc)
        if not qc_settings.last_call_synced_at:
            qc_settings.last_call_synced_at = job_started_at
            await session.commit()
            logger.info(f"Account #{account_id}: QC activated. Baseline cursor initialized to {job_started_at.isoformat()}.")
            return True

        # Оверлап в 2 минуты для гарантии отсутствия потерь
        window_from = qc_settings.last_call_synced_at - timedelta(minutes=2)
        window_from_sec = int(window_from.timestamp())

        logger.info(f"Starting calls sync for account #{account_id} ({acc.subdomain}) from {window_from.isoformat()}...")

        # 4. Выкачиваем примечания-звонки из AmoCRM
        page = 1
        MAX_CALL_PAGES = 5
        total_found = 0
        total_pending = 0

        while page <= MAX_CALL_PAGES:
            status, data = await crm_client.request(
                subdomain=acc.subdomain,
                base_domain=acc.base_domain,
                token=amo_token,
                method="GET",
                path="/api/v4/leads/notes",
                params={
                    "filter[note_type]": "call_in,call_out",
                    "filter[updated_at][from]": window_from_sec,
                    "limit": 100,
                    "page": page,
                },
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

            for note in notes:
                total_found += 1
                note_id = str(note.get("id"))
                lead_ext_id = str(note.get("entity_id") or "")
                params = note.get("params") or {}
                duration = int(params.get("duration") or 0)
                link = params.get("link")
                phone = str(params.get("phone") or "")
                direction = "in" if note.get("note_type") == "call_in" else "out"
                call_created_ts = note.get("created_at") or int(job_started_at.timestamp())
                call_date = datetime.fromtimestamp(call_created_ts, tz=timezone.utc)
                responsible_user_ext_id = str(note.get("responsible_user_id") or "")

                # Дедупликация: проверяем, не сохранен ли уже этот звонок
                existing_eval = (await session.execute(
                    select(QcCallEvaluation.id).where(
                        QcCallEvaluation.account_id == account_id,
                        QcCallEvaluation.external_call_id == note_id,
                    )
                )).scalar_one_or_none()
                if existing_eval:
                    continue

                # Ищем сделку
                lead_row = None
                if lead_ext_id:
                    lead_row = (await session.execute(
                        select(Lead).where(
                            Lead.account_id == account_id,
                            Lead.external_id == lead_ext_id,
                        )
                    )).scalar_one_or_none()

                lead_id = lead_row.id if lead_row else None
                pipeline_id = lead_row.pipeline_id if lead_row else None

                # Ищем менеджера
                amo_user_row = None
                if responsible_user_ext_id:
                    amo_user_row = (await session.execute(
                        select(AmoUser).where(
                            AmoUser.account_id == account_id,
                            AmoUser.external_id == responsible_user_ext_id,
                        )
                    )).scalar_one_or_none()
                amo_user_id = amo_user_row.id if amo_user_row else (lead_row.responsible_user_id if lead_row else None)

                # Проверка статуса звонка в AmoCRM
                raw_call_status = params.get("call_status")
                call_status = None
                if raw_call_status is not None:
                    try:
                        call_status = int(raw_call_status)
                    except (ValueError, TypeError):
                        call_status = None

                if call_status is not None and call_status != 4:
                    reason_desc = CALL_STATUS_DESCRIPTIONS.get(call_status, f"код статуса {call_status}")
                    skip_eval = QcCallEvaluation(
                        account_id=account_id,
                        external_call_id=note_id,
                        lead_id=lead_id,
                        pipeline_id=pipeline_id,
                        amo_user_id=amo_user_id,
                        phone=phone,
                        call_direction=direction,
                        call_date=call_date,
                        duration_seconds=duration,
                        recording_url=link,
                        status="skipped_not_answered",
                        skip_reason=f"Разговор не состоялся ({reason_desc})",
                    )
                    session.add(skip_eval)
                    await session.commit()
                    continue

                # Проверка фильтров длительности
                if duration < qc_settings.min_duration_sec:
                    skip_eval = QcCallEvaluation(
                        account_id=account_id,
                        external_call_id=note_id,
                        lead_id=lead_id,
                        pipeline_id=pipeline_id,
                        amo_user_id=amo_user_id,
                        phone=phone,
                        call_direction=direction,
                        call_date=call_date,
                        duration_seconds=duration,
                        recording_url=link,
                        status="skipped_duration",
                        skip_reason=f"Слишком короткий звонок ({duration} сек < {qc_settings.min_duration_sec} сек)",
                    )
                    session.add(skip_eval)
                    await session.commit()
                    continue

                if duration > qc_settings.max_duration_sec:
                    skip_eval = QcCallEvaluation(
                        account_id=account_id,
                        external_call_id=note_id,
                        lead_id=lead_id,
                        pipeline_id=pipeline_id,
                        amo_user_id=amo_user_id,
                        phone=phone,
                        call_direction=direction,
                        call_date=call_date,
                        duration_seconds=duration,
                        recording_url=link,
                        status="skipped_duration",
                        skip_reason=f"Превышен лимит длительности ({duration} сек > {qc_settings.max_duration_sec} сек)",
                    )
                    session.add(skip_eval)
                    await session.commit()
                    continue

                if not link:
                    skip_eval = QcCallEvaluation(
                        account_id=account_id,
                        external_call_id=note_id,
                        lead_id=lead_id,
                        pipeline_id=pipeline_id,
                        amo_user_id=amo_user_id,
                        phone=phone,
                        call_direction=direction,
                        call_date=call_date,
                        duration_seconds=duration,
                        recording_url=None,
                        status="skipped_no_audio",
                        skip_reason="Нет ссылки на аудиозапись",
                    )
                    session.add(skip_eval)
                    await session.commit()
                    continue

                # Звонок валиден: регистрируем в статусе 'pending' для асинхронного анализа бэкендом
                pending_eval = QcCallEvaluation(
                    account_id=account_id,
                    external_call_id=note_id,
                    lead_id=lead_id,
                    pipeline_id=pipeline_id,
                    amo_user_id=amo_user_id,
                    phone=phone,
                    call_direction=direction,
                    call_date=call_date,
                    duration_seconds=duration,
                    recording_url=link,
                    status="pending",
                    skip_reason=None,
                    overall_score=None,
                    rules_breakdown=None,
                    errors_list=None,
                    bottleneck=None,
                    transcript=None,
                    summary=None,
                    recommendation=None,
                    anomaly_points=0,
                )
                session.add(pending_eval)
                await session.commit()
                total_pending += 1

            if len(notes) < 100:
                break
            page += 1

        # Обновляем курсор синхронизации
        qc_settings.last_call_synced_at = job_started_at
        await session.commit()
        logger.info(f"Completed calls sync for account #{account_id}: found={total_found}, pending_queued={total_pending}")
        return True

    except Exception as e:
        logger.error(f"Error in run_calls_sync for account #{account_id}: {e}", exc_info=True)
        return False
