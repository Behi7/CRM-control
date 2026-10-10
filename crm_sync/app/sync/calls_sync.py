import base64
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
import httpx

from app.models import (
    Account, Lead, Pipeline, AmoUser,
    QcSettings, QcRule, QcCallEvaluation, QcLeadRiskScore
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
    """Синхронизирует недавние звонки из AmoCRM и анализирует их через Gemini по настроенным правилам."""
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

        if not acc.ai_encrypted_token:
            logger.info(f"Account #{account_id}: QC is enabled, but no Gemini API token configured.")
            return False

        amo_token = decrypt_token(acc.encrypted_token)
        gemini_key = decrypt_token(acc.ai_encrypted_token)

        # 3. Фиксируем временное окно
        job_started_at = datetime.now(timezone.utc)
        if not qc_settings.last_call_synced_at:
            # Первый запуск модуля для аккаунта: берем точку старта СЕЙЧАС, чтобы не жечь токены на архивные звонки
            qc_settings.last_call_synced_at = job_started_at
            await session.commit()
            logger.info(f"Account #{account_id}: QC activated. Baseline cursor initialized to {job_started_at.isoformat()}.")
            return True

        # Небольшой оверлап в 2 минуты для гарантии отсутствия потерь
        window_from = qc_settings.last_call_synced_at - timedelta(minutes=2)
        window_from_sec = int(window_from.timestamp())

        logger.info(f"Starting calls sync for account #{account_id} ({acc.subdomain}) from {window_from.isoformat()}...")

        # 4. Выкачиваем примечания-звонки из AmoCRM
        page = 1
        MAX_CALL_PAGES = 5  # максимум 500 звонков за один 10-минутный такт
        total_found = 0
        total_analyzed = 0

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

                # Дедупликация: проверяем, не обработан ли уже этот звонок
                existing_eval = (await session.execute(
                    select(QcCallEvaluation.id).where(
                        QcCallEvaluation.account_id == account_id,
                        QcCallEvaluation.external_call_id == note_id,
                    )
                )).scalar_one_or_none()
                if existing_eval:
                    continue

                # Ищем соответствующую сделку в БД
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

                # Проверка статуса звонка в AmoCRM: если передан статус несостоявшегося звонка (не 4 - разговор состоялся)
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

                # Звонок подходит под критерии анализа!
                logger.info(f"Account #{account_id}: Evaluating call #{note_id} (duration={duration}s, link={link})...")

                # Получаем активные правила проверки
                rules = await get_active_rules(session, account_id, pipeline_id)

                # Скачиваем аудио во временную память
                audio_bytes, mime_type = await fetch_audio_bytes(link)
                if not audio_bytes:
                    fail_eval = QcCallEvaluation(
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
                        status="error",
                        skip_reason="Не удалось скачать аудиозапись по ссылке телефонии",
                    )
                    session.add(fail_eval)
                    await session.commit()
                    continue

                # Анализируем аудио через Gemini
                analysis = await evaluate_call_with_gemini(
                    audio_bytes=audio_bytes,
                    mime_type=mime_type,
                    rules=rules,
                    api_key=gemini_key,
                    model_name=qc_settings.ai_model,
                )

                if not analysis:
                    fail_eval = QcCallEvaluation(
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
                        status="error",
                        skip_reason="Ошибка ответа нейросети при анализе",
                    )
                    session.add(fail_eval)
                    await session.commit()
                    continue

                # Подсчет штрафных баллов аномалии
                anomaly_points = 0
                for r in analysis.get("rules_evaluation", []):
                    if not r.get("passed"):
                        anomaly_points += int(r.get("penalty") or 10)

                score = int(analysis.get("overall_score") or 0)
                if score < 50:
                    anomaly_points += 25

                # Сохраняем карточку анализа
                eval_row = QcCallEvaluation(
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
                    status="completed",
                    overall_score=score,
                    rules_breakdown=analysis.get("rules_evaluation"),
                    errors_list=analysis.get("errors_summary"),
                    bottleneck=analysis.get("bottleneck"),
                    transcript=analysis.get("transcript"),
                    summary=analysis.get("brief_summary"),
                    recommendation=analysis.get("recommendation"),
                    anomaly_points=anomaly_points,
                )
                session.add(eval_row)
                await session.commit()
                total_analyzed += 1

                # Обновляем скоринг аномалий сделки
                if lead_id:
                    await update_lead_risk_score(
                        session=session,
                        account_id=account_id,
                        lead_row=lead_row,
                        added_call_anomaly=anomaly_points,
                        rescue_threshold=qc_settings.rescue_threshold_score,
                    )

            if len(notes) < 100:
                break
            page += 1

        # Обновляем курсор синхронизации
        qc_settings.last_call_synced_at = job_started_at
        await session.commit()
        logger.info(f"Completed calls sync for account #{account_id}: found={total_found}, analyzed={total_analyzed}")
        return True

    except Exception as e:
        logger.error(f"Error in run_calls_sync for account #{account_id}: {e}", exc_info=True)
        try:
            await session.rollback()
        except Exception:
            pass
        return False


async def get_active_rules(session: AsyncSession, account_id: int, pipeline_id: Optional[int]) -> List[Dict[str, Any]]:
    """Возвращает актуальный список правил для воронки или общие правила аккаунта."""
    # 1. Проверяем правила конкретной воронки
    if pipeline_id:
        p_stmt = (
            select(QcRule)
            .where(QcRule.account_id == account_id, QcRule.pipeline_id == pipeline_id, QcRule.is_active == True)
            .order_by(QcRule.sort_order.asc())
        )
        p_res = await session.execute(p_stmt)
        pipe_rules = p_res.scalars().all()
        if pipe_rules:
            return [{"id": r.id, "title": r.title, "description": r.description, "penalty": r.penalty_points} for r in pipe_rules]

    # 2. Если для воронки нет своих правил, берем общие правила аккаунта (pipeline_id is None)
    g_stmt = (
        select(QcRule)
        .where(QcRule.account_id == account_id, QcRule.pipeline_id.is_(None), QcRule.is_active == True)
        .order_by(QcRule.sort_order.asc())
    )
    g_res = await session.execute(g_stmt)
    global_rules = g_res.scalars().all()
    if global_rules:
        return [{"id": r.id, "title": r.title, "description": r.description, "penalty": r.penalty_points} for r in global_rules]

    # Дефолтный fallback
    return [
        {"id": None, "title": "Поздоровался и представился", "description": "Назвал имя и компанию", "penalty": 10},
        {"id": None, "title": "Выявил потребность", "description": "Задал уточняющие вопросы", "penalty": 15},
        {"id": None, "title": "Озвучил стоимость", "description": "Четко ответил по цене", "penalty": 20},
        {"id": None, "title": "Не перебивал клиента", "description": "Слушал внимательно", "penalty": 15},
        {"id": None, "title": "Назначил следующий шаг", "description": "Зафиксировал дедлайн или договоренность", "penalty": 25},
    ]


async def fetch_audio_bytes(url: str) -> tuple[Optional[bytes], str]:
    """Скачивает аудиопоток во временную память RAM без сохранения на диск."""
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code == 200 and resp.content:
                ct = resp.headers.get("content-type", "").lower()
                mime = "audio/wav"
                if "mp3" in ct or url.endswith(".mp3"):
                    mime = "audio/mp3"
                elif "ogg" in ct or url.endswith(".ogg"):
                    mime = "audio/ogg"
                elif "m4a" in ct or url.endswith(".m4a"):
                    mime = "audio/m4a"
                elif "wav" in ct or url.endswith(".wav"):
                    mime = "audio/wav"
                return resp.content, mime
            return None, "audio/wav"
    except Exception as e:
        logger.warning(f"Failed to fetch audio from {url}: {e}")
        return None, "audio/wav"


async def evaluate_call_with_gemini(
    audio_bytes: bytes,
    mime_type: str,
    rules: List[Dict[str, Any]],
    api_key: str,
    model_name: str,
) -> Optional[Dict[str, Any]]:
    """Отправляет аудио в Gemini API и получает структурированный JSON с оценкой и ошибками."""
    try:
        b64_data = base64.b64encode(audio_bytes).decode("utf-8")
        clean_model = (model_name or "gemini-2.5-flash").strip().removeprefix("models/")

        rules_formatted = "\n".join([
            f"- Закон {i+1}: \"{r['title']}\" (штраф: {r['penalty']} баллов). Инструкция: {r.get('description') or 'проверить соблюдение'}."
            for i, r in enumerate(rules)
        ])

        system_instruction = f"""
Ты — объективный и внимательный эксперт службы контроля качества звонков отдела продаж.
Твоя задача — внимательно прослушать аудиозапись разговора менеджера с клиентом, составить точную транскрипцию и оценить диалог строго по законам регламента.

Законы регламента для проверки:
{rules_formatted}

Критерии оценки:
- Базовый счет: 100 баллов. За каждое нарушенное правило вычитается штраф этого правила.
- Если диалог идеален, оценка 90-100.
- Будь строгим, но справедливым. Замечай перебивания, уход от прямых ответов по ценам, пассивность.
- Обязательно найди узкое место (bottleneck) — момент, где клиент потерял интерес или засомневался.
- Составь полную транскрипцию с разделением ролей (Менеджер: ... / Клиент: ...).

Верни ответ СТРОГО в формате JSON по следующей схеме:
{{
  "overall_score": 85,
  "rules_evaluation": [
    {{
      "rule_id": 1,
      "rule_title": "Поздоровался и представился",
      "passed": true,
      "penalty": 10,
      "details": "Менеджер поздоровался и назвал компанию"
    }}
  ],
  "errors_summary": [
    "Краткое описание ошибки 1",
    "Краткое описание ошибки 2"
  ],
  "bottleneck": "На 2:15 клиент спросил про скидку, менеджер замялся и не назвал точную цену...",
  "transcript": "Менеджер: Добрый день... Клиент: Здравствуйте...",
  "brief_summary": "Клиент интересовался продуктом, договорились о повторном звонке во вторник.",
  "recommendation": "Менеджеру стоит увереннее называть вилку цен и не бояться возражений."
}}
"""

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={api_key}"
        payload = {
            "systemInstruction": {"parts": [{"text": system_instruction}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "inlineData": {
                                "mimeType": mime_type,
                                "data": b64_data,
                            }
                        },
                        {
                            "text": "Прослушай данный звонок и выполни аудит по указанным законам регламента. Ответ выдай строго в JSON."
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
            }
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                logger.error(f"Gemini API error: {resp.status_code} {resp.text}")
                return None

            data = resp.json()
            candidates = data.get("candidates", [])
            if not candidates:
                return None

            raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            return json.loads(raw_text)

    except Exception as e:
        logger.error(f"Exception during Gemini audio call evaluation: {e}", exc_info=True)
        return None


async def update_lead_risk_score(
    session: AsyncSession,
    account_id: int,
    lead_row: Lead,
    added_call_anomaly: int,
    rescue_threshold: int,
):
    """Обновляет суммарный балл риска сделки и определяет статус кандидата на спасение."""
    try:
        # Ищем существующий скоринг по сделке
        risk_stmt = select(QcLeadRiskScore).where(
            QcLeadRiskScore.account_id == account_id,
            QcLeadRiskScore.lead_id == lead_row.id,
        )
        risk_res = await session.execute(risk_stmt)
        risk_obj = risk_res.scalar_one_or_none()

        if not risk_obj:
            risk_obj = QcLeadRiskScore(
                account_id=account_id,
                lead_id=lead_row.id,
                total_risk_score=added_call_anomaly,
                risk_breakdown={"call_anomalies": added_call_anomaly},
            )
            session.add(risk_obj)
        else:
            risk_obj.total_risk_score += added_call_anomaly
            breakdown = risk_obj.risk_breakdown or {}
            breakdown["call_anomalies"] = breakdown.get("call_anomalies", 0) + added_call_anomaly
            risk_obj.risk_breakdown = breakdown

        # Проверяем, закрыта ли сделка в «Нереализовано»
        # В AmoCRM статус нереализовано обычно: status="closed_lost" или loss_reason_id не пустой
        is_lost = (lead_row.status in ("closed_lost", "lost") or bool(lead_row.loss_reason_id))

        if is_lost and risk_obj.total_risk_score >= rescue_threshold:
            risk_obj.is_rescue_candidate = True
            risk_obj.rescue_reason = (
                f"Сделка закрыта с высоким баллом нарушений ({risk_obj.total_risk_score} очков >= порога {rescue_threshold}). "
                f"Клиент был потерян из-за грубых ошибок ведения диалога или несоблюдения регламента."
            )
            risk_obj.ai_rescue_script = (
                "Рекомендация РОПу: сменить менеджера и совершить звонок контроля качества: "
                "«Добрый день! Руководитель отдела контроля качества компании. Заметили, что наша консультация была неполной...»"
            )

        await session.commit()

    except Exception as e:
        logger.error(f"Error updating lead risk score for lead #{lead_row.id}: {e}")

