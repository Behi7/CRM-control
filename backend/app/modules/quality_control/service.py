import asyncio
import base64
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
import httpx

from app.core.database import AsyncSessionLocal
from app.models import (
    Account, Lead, Pipeline, AmoUser,
    QcSettings, QcRule, QcCallEvaluation
)
from app.core.security import decrypt_token

logger = logging.getLogger("QCService")

CALL_STATUS_DESCRIPTIONS = {
    1: "Оставлено сообщение на автоответчик",
    2: "Перезвонить позже",
    3: "Нет на месте",
    5: "Неверный номер",
    6: "Не дозвонился / абонент не ответил",
    7: "Номер занят",
}

async def get_active_rules(session: AsyncSession, account_id: int, pipeline_id: Optional[int]) -> List[Dict[str, Any]]:
    """Возвращает активные правила регламента (приоритет: воронка -> общие правила аккаунта -> fallback)."""
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

    g_stmt = (
        select(QcRule)
        .where(QcRule.account_id == account_id, QcRule.pipeline_id.is_(None), QcRule.is_active == True)
        .order_by(QcRule.sort_order.asc())
    )
    g_res = await session.execute(g_stmt)
    global_rules = g_res.scalars().all()
    if global_rules:
        return [{"id": r.id, "title": r.title, "description": r.description, "penalty": r.penalty_points} for r in global_rules]

    return [
        {"id": None, "title": "Mijoz bilan salomlashish va tanishish", "description": "Menejer o'z ismini va kompaniya nomini aytdimi", "penalty": 10},
        {"id": None, "title": "Mijoz ehtiyojini aniqlash", "description": "Mijoz ehtiyoji va og'riqli nuqtalarini aniqlash uchun savollar berdimi", "penalty": 15},
        {"id": None, "title": "Narx yoki narxlar oralig'ini aytish", "description": "Mijoz narx so'raganda aniq narx yoki vilkani aytdimi", "penalty": 20},
        {"id": None, "title": "Mijoz so'zini bo'lmaslik", "description": "Mijoz fikrini oxirigacha diqqat bilan eshitdimi", "penalty": 15},
        {"id": None, "title": "Keyingi qadamni belgilash", "description": "Keyingi muloqot vaqti yoki aniq kelishuvni qayd etdimi", "penalty": 25},
    ]


async def fetch_audio_bytes(url: str) -> Tuple[Optional[bytes], str]:
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
    custom_prompt: Optional[str] = None,
    company_context: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Отправляет аудио в Gemini API. Модель возвращает ТОЛЬКО факты и булевы флаги passed, без вычисления баллов."""
    try:
        b64_data = base64.b64encode(audio_bytes).decode("utf-8")
        clean_model = (model_name or "gemini-2.5-flash").strip().removeprefix("models/")
        if clean_model.startswith("gemin-"):
            clean_model = "gemini-" + clean_model[6:]

        rules_formatted = "\n".join([
            f"- Law #{r.get('id') or (i+1)}: \"{r['title']}\"\n"
            f"  Verification criteria: {r.get('description') or 'Verify compliance with the rule: ' + r['title']}."
            for i, r in enumerate(rules)
        ])

        base_instruction = (
            custom_prompt.strip()
            if (custom_prompt and custom_prompt.strip())
            else """You are a fast, objective Quality Control checklist evaluator for sales calls.
Your mission is to listen to the call audio and evaluate compliance for each provided law strictly against its verification criteria.

EVALUATION INSTRUCTIONS:
For each law in the provided list:
- passed: true if the manager complied with the criteria, false if violated.
- timestamp: exact "MM:SS" of the occurrence (or null).
- details: a short factual quote or note from the dialogue explaining the result.

LANGUAGE REQUIREMENT:
Output all text values ("summary", "details") strictly in Uzbek using the Latin alphabet (O'zbek tili lotin alifbosida)."""
        )

        company_section = ""
        if company_context and company_context.strip():
            company_section = f"\nCompany Context & Business Specifics:\n{company_context.strip()}\n"

        system_instruction = f"""
{base_instruction}
{company_section}
Laws to verify:
{rules_formatted}

Return response STRICTLY in JSON format following this schema:
{{
  "summary": "Suhbatning qisqacha mazmuni (1 jumla)",
  "rules_evaluation": [
    {{
      "rule_id": 1,
      "passed": true,
      "timestamp": "00:04",
      "details": "Menejer salomlashdi: «...»"
    }},
    {{
      "rule_id": 2,
      "passed": false,
      "timestamp": "01:20",
      "details": "Mijoz narx so'raganda menejer javob bermadi"
    }}
  ]
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
                            "text": "Listen to this call recording and evaluate it strictly against the provided laws. Return response strictly in JSON."
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


def calculate_score_and_anomalies(
    rules_evaluation: List[Dict[str, Any]],
    active_rules: List[Dict[str, Any]]
) -> Tuple[int, int]:
    """
    Математически честный расчёт оценки (0-100%):
    Score = round((Набранные баллы / Общая сумма весов всех правил) * 100)
    Аномалии = сумма штрафов за невыполненные правила + 25 если балл < 50.
    """
    # Собираем словарь весов правил по ID и по заголовку
    weights_by_id = {}
    weights_by_title = {}
    for r in active_rules:
        p = int(r.get("penalty") or 10)
        if r.get("id") is not None:
            weights_by_id[r["id"]] = p
        if r.get("title"):
            weights_by_title[r["title"].strip().lower()] = p

    total_weight = sum(int(r.get("penalty") or 10) for r in active_rules)
    if total_weight <= 0:
        total_weight = sum(int(r.get("penalty") or 10) for r in rules_evaluation) or 100

    earned_weight = 0
    anomaly_points = 0

    for r in rules_evaluation:
        r_id = r.get("rule_id")
        r_title = (r.get("rule_title") or "").strip().lower()

        # Определяем вес правила
        weight = weights_by_id.get(r_id) or weights_by_title.get(r_title) or int(r.get("penalty") or 10)
        # Обогащаем запись правила его реальным штрафом для фронтенда
        r["penalty"] = weight

        if r.get("passed"):
            earned_weight += weight
        else:
            anomaly_points += weight

    if total_weight > 0:
        score = int(round((earned_weight / total_weight) * 100))
    else:
        score = 100

    score = max(0, min(100, score))

    if score < 50:
        anomaly_points += 25

    return score, anomaly_points


async def process_call_evaluation(session: AsyncSession, eval_id: int, force: bool = False) -> bool:
    """Обрабатывает один звонок (скачивает аудио, запускает Gemini, рассчитывает математический балл)."""
    stmt = select(QcCallEvaluation).where(QcCallEvaluation.id == eval_id)
    res = await session.execute(stmt)
    call_eval = res.scalar_one_or_none()
    if not call_eval or not call_eval.recording_url:
        return False

    account_id = call_eval.account_id
    acc_stmt = select(Account).where(Account.id == account_id)
    acc = (await session.execute(acc_stmt)).scalar_one_or_none()
    if not acc or not acc.ai_encrypted_token:
        logger.warning(f"Account #{account_id}: no Gemini token, skipping evaluation of call #{eval_id}")
        return False

    qc_stmt = select(QcSettings).where(QcSettings.account_id == account_id)
    qc_settings = (await session.execute(qc_stmt)).scalar_one_or_none()
    if not qc_settings or not qc_settings.is_enabled:
        return False

    if not force:
        # Проверяем, не был ли звонок совершен до активации КК (защита от сжигания токенов)
        if qc_settings.activated_at and call_eval.call_date:
            if call_eval.call_date < qc_settings.activated_at:
                call_eval.status = "skipped_qc_disabled"
                call_eval.skip_reason = "Звонок совершен до активации контроля качества"
                await session.commit()
                return True

        disabled_pipelines = set(qc_settings.disabled_pipeline_ids or [])
        if call_eval.pipeline_id and call_eval.pipeline_id in disabled_pipelines:
            call_eval.status = "skipped_pipeline"
            call_eval.skip_reason = "Анализ отключён для данной воронки"
            await session.commit()
            return True

        min_dur = qc_settings.min_duration_sec or 20
        max_dur = qc_settings.max_duration_sec or 600
        dur = call_eval.duration_seconds or 0
        if dur < min_dur or dur > max_dur:
            call_eval.status = "skipped_duration"
            call_eval.skip_reason = f"Длительность {dur} сек вне диапазона ({min_dur}-{max_dur} сек)"
            await session.commit()
            return True

    gemini_key = decrypt_token(acc.ai_encrypted_token)

    # 1. Получаем активные правила
    rules = await get_active_rules(session, account_id, call_eval.pipeline_id)

    # 2. Скачиваем аудио
    audio_bytes, mime_type = await fetch_audio_bytes(call_eval.recording_url)
    if not audio_bytes:
        call_eval.status = "error"
        call_eval.skip_reason = "Не удалось скачать аудиозапись по ссылке телефонии"
        await session.commit()
        return False

    # 3. Анализ в Gemini
    analysis = await evaluate_call_with_gemini(
        audio_bytes=audio_bytes,
        mime_type=mime_type,
        rules=rules,
        api_key=gemini_key,
        model_name=qc_settings.ai_model or acc.ai_model or "gemini-2.5-flash",
        custom_prompt=qc_settings.system_prompt,
        company_context=acc.ai_company_context,
    )

    if not analysis:
        call_eval.status = "error"
        call_eval.skip_reason = "Ошибка ответа нейросети при анализе"
        await session.commit()
        return False

    # 4. Честный математический расчёт оценки в Python
    rules_eval = analysis.get("rules_evaluation") or []

    # Обогащаем названиями законов из активных правил (нейросеть не тратит токены на их генерацию)
    rules_by_id = {r.get("id"): r for r in rules if r.get("id")}
    for i, r in enumerate(rules_eval):
        matched = rules_by_id.get(r.get("rule_id")) or (rules[i] if i < len(rules) else {})
        if not r.get("rule_title") and matched:
            r["rule_title"] = matched.get("title")

    score, anomaly_points = calculate_score_and_anomalies(rules_eval, rules)

    # 5. Автоматическое формирование списка ошибок из нарушенных правил (без лишней нагрузки на нейросеть)
    errors_list = []
    for r in rules_eval:
        if not r.get("passed"):
            ts = f"[{r.get('timestamp')}] " if r.get("timestamp") else ""
            title = r.get("rule_title") or f"Qoida #{r.get('rule_id')}"
            details = r.get("details")
            errors_list.append(f"{ts}{title}: {details}" if details else f"{ts}{title}")

    # Сохранение результата
    call_eval.status = "completed"
    call_eval.overall_score = score
    call_eval.rules_breakdown = rules_eval
    call_eval.errors_list = errors_list
    call_eval.bottleneck = errors_list[0] if errors_list else None
    call_eval.transcript = None
    call_eval.summary = analysis.get("summary") or analysis.get("brief_summary")
    call_eval.recommendation = None
    call_eval.anomaly_points = anomaly_points

    await session.commit()

    logger.info(f"Successfully evaluated call #{call_eval.id} (external={call_eval.external_call_id}): score={score}%")
    return True


async def qualify_raw_calls(session: AsyncSession, account_id: Optional[int] = None, batch_size: int = 500) -> int:
    """
    Квалифицирует сырые звонки из crm_sync (status='raw'):
    - Проверяет статус ответа телефонии (call_status != 4 -> skipped_not_answered)
    - Проверяет наличие ссылки на аудио (skipped_no_audio)
    - Проверяет статус активности КК и дату активации (skipped_qc_disabled, skipped_historical)
    - Проверяет исключенные воронки (skipped_pipeline)
    - Проверяет длительность по порогам (skipped_duration)
    - Целевые звонки переводит в статус 'pending' для анализа нейросетью.
    """
    stmt = select(QcCallEvaluation).where(QcCallEvaluation.status == "raw")
    if account_id is not None:
        stmt = stmt.where(QcCallEvaluation.account_id == account_id)
    stmt = stmt.order_by(QcCallEvaluation.id.asc()).limit(batch_size)

    raw_calls = (await session.execute(stmt)).scalars().all()
    if not raw_calls:
        return 0

    now_utc = datetime.now(timezone.utc)
    qc_settings_cache: Dict[int, Optional[QcSettings]] = {}
    qualified_count = 0

    for call in raw_calls:
        acc_id = call.account_id
        if acc_id not in qc_settings_cache:
            qc_row = (await session.execute(
                select(QcSettings).where(QcSettings.account_id == acc_id)
            )).scalar_one_or_none()
            qc_settings_cache[acc_id] = qc_row
        qc_set = qc_settings_cache[acc_id]

        # 1. Проверка ответа телефонии (недозвон / сброс)
        if call.call_status is not None and call.call_status != 4:
            call.status = "skipped_not_answered"
            call.skip_reason = CALL_STATUS_DESCRIPTIONS.get(call.call_status, f"код статуса {call.call_status}")
            qualified_count += 1
            continue

        # 2. Проверка ссылки на аудиозапись
        if not call.recording_url:
            call.status = "skipped_no_audio"
            call.skip_reason = "Нет ссылки на аудиозапись"
            qualified_count += 1
            continue

        # 3. Проверка активности модуля контроля качества
        if not qc_set or not qc_set.is_enabled:
            call.status = "skipped_qc_disabled"
            call.skip_reason = "Контроль качества отключен"
            qualified_count += 1
            continue

        # 4. Проверка даты активации КК или архивности (старше 2 дней до активации)
        if qc_set.activated_at and call.call_date < qc_set.activated_at:
            call.status = "skipped_historical"
            call.skip_reason = "Архивный звонок (до активации КК)"
            qualified_count += 1
            continue
        elif not qc_set.activated_at and call.call_date < (now_utc - timedelta(days=2)):
            call.status = "skipped_historical"
            call.skip_reason = "Архивный звонок (старше 2 дней)"
            qualified_count += 1
            continue

        # 5. Исключенные воронки
        disabled_pipes = set(qc_set.disabled_pipeline_ids or [])
        if call.pipeline_id and call.pipeline_id in disabled_pipes:
            call.status = "skipped_pipeline"
            call.skip_reason = "Анализ отключён для данной воронки"
            qualified_count += 1
            continue

        # 6. Пороги длительности звонка
        min_dur = qc_set.min_duration_sec or 20
        max_dur = qc_set.max_duration_sec or 600
        dur = call.duration_seconds or 0
        if dur < min_dur or dur > max_dur:
            call.status = "skipped_duration"
            call.skip_reason = "Вне диапазона автоматического анализа"
            qualified_count += 1
            continue

        # Целевой звонок готов к анализу нейросетью
        call.status = "pending"
        call.skip_reason = None
        qualified_count += 1

    await session.commit()
    return qualified_count


async def process_pending_calls(session: AsyncSession, limit: int = 5) -> int:
    """Выбирает звонки в статусе 'pending' и прогоняет их через анализ (только для активных модулей)."""
    stmt = (
        select(QcCallEvaluation.id)
        .join(QcSettings, QcSettings.account_id == QcCallEvaluation.account_id)
        .join(Account, Account.id == QcCallEvaluation.account_id)
        .where(
            QcCallEvaluation.status == "pending",
            QcSettings.is_enabled == True,
            Account.ai_enabled == True,
            Account.status == "connected",
            Account.sync_status == "active"
        )
        .order_by(QcCallEvaluation.id.asc())
        .limit(limit)
    )
    res = await session.execute(stmt)
    pending_ids = res.scalars().all()
    if not pending_ids:
        return 0

    processed_count = 0
    for p_id in pending_ids:
        try:
            ok = await process_call_evaluation(session, p_id)
            if ok:
                processed_count += 1
        except Exception as e:
            logger.error(f"Error evaluating pending call #{p_id}: {e}", exc_info=True)

    return processed_count


async def qc_background_worker():
    """Фоновый воркер бэкенда для обработки очереди звонков."""
    logger.info("🚀 QC Background Worker started in Backend.")
    while True:
        try:
            async with AsyncSessionLocal() as session:
                qualified = await qualify_raw_calls(session, batch_size=500)
                if qualified > 0:
                    logger.info(f"QC Worker qualified {qualified} raw calls.")
                processed = await process_pending_calls(session, limit=3)
                if processed > 0:
                    logger.info(f"QC Worker processed {processed} pending calls.")
        except asyncio.CancelledError:
            logger.info("QC Background Worker stopped.")
            break
        except Exception as e:
            logger.error(f"QC Background Worker iteration error: {e}")

        await asyncio.sleep(15)

