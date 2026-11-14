import asyncio
import base64
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, or_, and_
import httpx

from app.core.database import AsyncSessionLocal
from app.models import (
    Account, Lead, Pipeline, AmoUser,
    QcSettings, QcRule, QcCallEvaluation
)
from app.core.security import decrypt_token

logger = logging.getLogger("QCService")

MAX_AUDIO_BYTES = 15 * 1024 * 1024  # 15 MB limit (Gemini inlineData max is 20MB)

CALL_STATUS_DESCRIPTIONS = {
    1: "Оставлено сообщение на автоответчик",
    2: "Перезвонить позже",
    3: "Нет на месте",
    5: "Неверный номер",
    6: "Не дозвонился / абонент не ответил",
    7: "Номер занят",
}

DEFAULT_RULES_FALLBACK = [
    {"id": -1, "title": "Mijoz bilan salomlashish va tanishish", "description": "Menejer o'z ismini va kompaniya nomini aytdimi", "penalty": 10},
    {"id": -2, "title": "Mijoz ehtiyojini aniqlash", "description": "Mijoz ehtiyoji va og'riqli nuqtalarini aniqlash uchun savollar berdimi", "penalty": 15},
    {"id": -3, "title": "Narx yoki narxlar oralig'ini aytish", "description": "Mijoz narx so'raganda aniq narx yoki vilkani aytdimi", "penalty": 20},
    {"id": -4, "title": "Mijoz so'zini bo'lmaslik", "description": "Mijoz fikrini oxirigacha diqqat bilan eshitdimi", "penalty": 15},
    {"id": -5, "title": "Keyingi qadamni belgilash", "description": "Keyingi muloqot vaqti yoki aniq kelishuvni qayd etdimi", "penalty": 25},
]


async def get_active_rules(session: AsyncSession, account_id: int, pipeline_id: Optional[int]) -> List[Dict[str, Any]]:
    """Возвращает активные правила регламента (приоритет: воронка -> общие правила аккаунта -> fallback)."""
    if pipeline_id:
        p_stmt = (
            select(QcRule)
            .where(QcRule.account_id == account_id, QcRule.pipeline_id == pipeline_id, QcRule.is_active == True)
            .order_by(QcRule.sort_order.asc(), QcRule.id.asc())
        )
        p_res = await session.execute(p_stmt)
        pipe_rules = p_res.scalars().all()
        if pipe_rules:
            return [{"id": r.id, "title": r.title, "description": r.description, "penalty": r.penalty_points} for r in pipe_rules]

    g_stmt = (
        select(QcRule)
        .where(QcRule.account_id == account_id, QcRule.pipeline_id.is_(None), QcRule.is_active == True)
        .order_by(QcRule.sort_order.asc(), QcRule.id.asc())
    )
    g_res = await session.execute(g_stmt)
    global_rules = g_res.scalars().all()
    if global_rules:
        return [{"id": r.id, "title": r.title, "description": r.description, "penalty": r.penalty_points} for r in global_rules]

    return [dict(r) for r in DEFAULT_RULES_FALLBACK]


async def fetch_audio_bytes(url: str, max_bytes: int = MAX_AUDIO_BYTES) -> Tuple[Optional[bytes], str]:
    """Скачивает аудиопоток с защитой от OOM и валидацией сигнатур (Magic Bytes)."""
    try:
        timeout = httpx.Timeout(30.0, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            async with client.stream("GET", url) as resp:
                if resp.status_code != 200:
                    logger.warning(f"Failed to fetch audio from {url}: status {resp.status_code}")
                    return None, "audio/mp3"

                content_len = resp.headers.get("content-length")
                if content_len and int(content_len) > max_bytes:
                    logger.warning(f"Audio exceeds max size: {content_len} > {max_bytes} bytes")
                    return None, "audio/mp3"

                chunks = []
                downloaded = 0
                async for chunk in resp.aiter_bytes(chunk_size=65536):
                    downloaded += len(chunk)
                    if downloaded > max_bytes:
                        logger.warning(f"Audio stream exceeded max size limit {max_bytes} bytes. Aborting.")
                        return None, "audio/mp3"
                    chunks.append(chunk)

                data = b"".join(chunks)
                if not data or len(data) < 12:
                    return None, "audio/mp3"

                # 1. Определение типа по сигнатуре (Magic Bytes)
                if data.startswith(b"RIFF") and len(data) > 12 and data[8:12] == b"WAVE":
                    return data, "audio/wav"
                if data.startswith(b"ID3") or (len(data) > 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0):
                    return data, "audio/mp3"
                if data.startswith(b"OggS"):
                    return data, "audio/ogg"
                if len(data) > 8 and data[4:8] == b"ftyp":
                    return data, "audio/mp4"

                # 2. Fallback по заголовку Content-Type или URL
                ct = resp.headers.get("content-type", "").lower()
                clean_url = url.split("?")[0].lower()
                if "mpeg" in ct or "mp3" in ct or clean_url.endswith(".mp3"):
                    return data, "audio/mp3"
                if "wav" in ct or clean_url.endswith(".wav"):
                    return data, "audio/wav"
                if "ogg" in ct or clean_url.endswith(".ogg"):
                    return data, "audio/ogg"
                if "m4a" in ct or "mp4" in ct or clean_url.endswith(".m4a"):
                    return data, "audio/mp4"

                return data, "audio/mp3"
    except Exception as e:
        logger.warning(f"Failed to fetch audio from {url}: {e}")
        return None, "audio/mp3"


def _parse_audio_duration_cpu(data: bytes, mime_type: str = "") -> float:
    """CPU-интенсивный расчет длительности MP3 / WAV. Вызывается через asyncio.to_thread."""
    if not data or len(data) < 12:
        return 0.0

    total_len = len(data)

    # 1. WAV / RIFF
    if data.startswith(b"RIFF") and total_len > 16 and data[8:12] == b"WAVE":
        offset = 12
        byte_rate = 0
        data_size = 0
        while offset + 8 <= total_len:
            chunk_id = data[offset:offset+4]
            chunk_size = int.from_bytes(data[offset+4:offset+8], "little")
            if chunk_id == b"fmt " and chunk_size >= 16:
                byte_rate = int.from_bytes(data[offset+16:offset+20], "little")
            elif chunk_id == b"data":
                data_size = min(chunk_size, total_len - (offset + 8))
                break
            # Word-alignment padding в RIFF WAV
            offset += 8 + chunk_size + (chunk_size % 2)
        if byte_rate > 0 and data_size > 0:
            return float(data_size) / float(byte_rate)

    # 2. MP3 (Пропуск ID3v2 + быстрый Xing/Info header или сканирование фреймов)
    offset = 0
    if data.startswith(b"ID3") and total_len > 10:
        tag_size = ((data[6] & 0x7F) << 21) | ((data[7] & 0x7F) << 14) | ((data[8] & 0x7F) << 7) | (data[9] & 0x7F)
        offset = min(10 + tag_size, total_len)

    bitrate_map_v1_l3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
    sample_rate_map_v1 = [44100, 48000, 32000, 0]

    frames = 0
    total_samples = 0
    sample_rate = 0

    while offset + 4 < total_len and frames < 15000:
        b1, b2, b3 = data[offset], data[offset+1], data[offset+2]
        if b1 == 0xFF and (b2 & 0xE0) == 0xE0:
            version_bits = (b2 >> 3) & 0x03
            layer_bits = (b2 >> 1) & 0x03
            bitrate_idx = (b3 >> 4) & 0x0F
            sr_idx = (b3 >> 2) & 0x03
            padding = (b3 >> 1) & 0x01

            if version_bits == 3 and layer_bits == 1 and bitrate_idx not in (0, 15) and sr_idx != 3:
                br = bitrate_map_v1_l3[bitrate_idx] * 1000
                sr = sample_rate_map_v1[sr_idx]
                spf = 1152
                frame_len = (144 * br // sr) + padding

                # Проверка заголовка Xing / Info в первом фрейме для мгновенного замера
                if frames == 0 and offset + 36 <= total_len:
                    side_info_offset = 32  # для stereo MPEG-1 Layer 3
                    xing_offset = offset + 4 + side_info_offset
                    if xing_offset + 12 <= total_len:
                        marker = data[xing_offset:xing_offset+4]
                        if marker in (b"Xing", b"Info"):
                            flags = int.from_bytes(data[xing_offset+4:xing_offset+8], "big")
                            if flags & 0x01:  # frames flag
                                xing_frames = int.from_bytes(data[xing_offset+8:xing_offset+12], "big")
                                if xing_frames > 0 and sr > 0:
                                    return (xing_frames * spf) / sr

                if frame_len > 0 and offset + frame_len <= total_len:
                    total_samples += spf
                    sample_rate = sr
                    frames += 1
                    offset += frame_len
                    continue
        offset += 1

    if sample_rate > 0 and frames > 0:
        return total_samples / sample_rate

    # Fallback по размеру файла (типичный битрейт телефонии 32 kbps)
    return max(1.0, float(len(data) * 8) / 32000.0)


async def get_audio_duration_seconds(data: bytes, mime_type: str = "") -> float:
    """Асинхронный замер длительности в фоновом тредпуле без блокировки Event Loop."""
    return await asyncio.to_thread(_parse_audio_duration_cpu, data, mime_type)


async def evaluate_call_with_gemini(
    audio_bytes: bytes,
    mime_type: str,
    rules: List[Dict[str, Any]],
    api_key: str,
    model_name: str,
    custom_prompt: Optional[str] = None,
    company_context: Optional[str] = None,
    max_retries: int = 3,
) -> Optional[Dict[str, Any]]:
    """Отправляет аудио в Gemini API с защитой от Rate Limit (429/503), x-goog-api-key и чисткой JSON."""
    b64_data = base64.b64encode(audio_bytes).decode("utf-8")
    clean_model = (model_name or "gemini-2.0-flash").strip().removeprefix("models/")
    if clean_model.startswith("gemin-"):
        clean_model = "gemini-" + clean_model[6:]

    # Нормализуем mime-тип для Gemini API
    gemini_mime = mime_type
    if gemini_mime == "audio/m4a":
        gemini_mime = "audio/mp4"

    rules_formatted = "\n".join([
        f"- Law #{r.get('id') if r.get('id') is not None else (i+1)}: \"{r['title']}\"\n"
        f"  Verification criteria: {r.get('description') or r['title']}."
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

CRITICAL ACCURACY:
- Do NOT invent extra requirements. If the manager satisfied the core criterion, mark passed: true.
- Only mark passed: false if the manager clearly failed, avoided answering, or violated the criterion."""
    )

    company_section = f"\nCompany Context:\n{company_context.strip()}\n" if (company_context and company_context.strip()) else ""

    system_instruction = f"""{base_instruction}
{company_section}
Laws to verify:
{rules_formatted}

Return response STRICTLY in JSON format following this schema:
{{
  "rules_evaluation": [
    {{
      "rule_id": 1,
      "passed": true,
      "timestamp": "00:04",
      "details": "..."
    }}
  ]
}}
"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent"
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "inlineData": {
                            "mimeType": gemini_mime,
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
            "temperature": 0.1,
            "responseMimeType": "application/json",
        }
    }

    for attempt in range(1, max_retries + 1):
        try:
            timeout = httpx.Timeout(90.0, connect=10.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, headers=headers, json=payload)

                # Rate Limit (429) или Overloaded (503) -> exponential backoff
                if resp.status_code in (429, 503):
                    wait_sec = attempt * 3
                    logger.warning(f"Gemini API {resp.status_code}. Retrying in {wait_sec}s (attempt {attempt}/{max_retries})...")
                    await asyncio.sleep(wait_sec)
                    continue

                if resp.status_code != 200:
                    logger.error(f"Gemini API error: {resp.status_code} {resp.text}")
                    return None

                data = resp.json()
                candidates = data.get("candidates", [])
                if not candidates:
                    return None

                raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                if not raw_text:
                    return None

                cleaned_json = raw_text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                return json.loads(cleaned_json)

        except Exception as e:
            logger.error(f"Gemini attempt {attempt} error: {e}", exc_info=True)
            if attempt < max_retries:
                await asyncio.sleep(attempt * 2)

    return None


def calculate_score_and_anomalies(
    rules_evaluation: List[Dict[str, Any]],
    active_rules: List[Dict[str, Any]]
) -> Tuple[int, int, List[Dict[str, Any]]]:
    """
    Математически строгий расчёт оценки (0-100%) на стороне Python.
    Исключает галлюцинации баллов и дублирование правил.
    """
    rules_map: Dict[Any, Dict[str, Any]] = {}
    for i, r in enumerate(active_rules):
        eff_id = r.get("id") if r.get("id") is not None else -(i + 1)
        rules_map[eff_id] = r

    eval_by_id: Dict[Any, Dict[str, Any]] = {}
    eval_by_index: List[Dict[str, Any]] = []
    for ev in rules_evaluation:
        rid = ev.get("rule_id")
        if rid is not None:
            eval_by_id[rid] = ev
            try:
                eval_by_id[int(rid)] = ev
            except (ValueError, TypeError):
                pass
        eval_by_index.append(ev)

    total_weight = 0
    earned_weight = 0
    anomaly_points = 0
    enriched_breakdown = []

    for i, (eff_id, rule) in enumerate(rules_map.items()):
        penalty = int(rule.get("penalty") or rule.get("penalty_points") or 10)
        total_weight += penalty

        # Сопоставляем ответ нейросети
        eval_item = eval_by_id.get(eff_id) or (eval_by_index[i] if i < len(eval_by_index) else None)
        
        # Строгая булева проверка (строка "false" не должна считаться True)
        raw_passed = eval_item.get("passed") if eval_item else False
        is_passed = raw_passed is True or str(raw_passed).strip().lower() in ("true", "1", "yes")

        if is_passed:
            earned_weight += penalty
        else:
            anomaly_points += penalty

        enriched_breakdown.append({
            "rule_id": eff_id,
            "rule_title": rule.get("title", ""),
            "passed": is_passed,
            "penalty": penalty,
            "timestamp": eval_item.get("timestamp") if eval_item else None,
            "details": eval_item.get("details") if eval_item else "Qoida tekshirilmadi"
        })

    score = int(round((earned_weight / total_weight) * 100)) if total_weight > 0 else 100
    score = max(0, min(100, score))

    if score < 50:
        anomaly_points += 25

    return score, anomaly_points, enriched_breakdown


async def process_call_evaluation(
    session: AsyncSession,
    eval_id: int,
    force: bool = False,
    expected_account_id: Optional[int] = None
) -> bool:
    """Обрабатывает один звонок с защитой от BOLA, переводом в processing и retry-логикой."""
    stmt = select(QcCallEvaluation).where(QcCallEvaluation.id == eval_id)
    if expected_account_id is not None:
        stmt = stmt.where(QcCallEvaluation.account_id == expected_account_id)

    res = await session.execute(stmt)
    call_eval = res.scalar_one_or_none()
    if not call_eval or not call_eval.recording_url:
        return False

    account_id = call_eval.account_id
    acc = (await session.execute(select(Account).where(Account.id == account_id))).scalar_one_or_none()
    if not acc or not acc.ai_encrypted_token:
        logger.warning(f"Account #{account_id}: no Gemini token, skipping evaluation of call #{eval_id}")
        return False

    qc_settings = (await session.execute(select(QcSettings).where(QcSettings.account_id == account_id))).scalar_one_or_none()
    if not qc_settings or not qc_settings.is_enabled:
        return False

    if not force:
        # Проверяем, не был ли звонок совершен до активации КК
        if qc_settings.activated_at and call_eval.call_date:
            if call_eval.call_date < qc_settings.activated_at:
                call_eval.status = "skipped_qc_disabled"
                call_eval.skip_reason = "Звонок совершен до активации контроля качества"
                await session.commit()
                return True

        disabled_pipelines = set(qc_settings.disabled_pipeline_ids or [])
        if disabled_pipelines:
            if not call_eval.pipeline_id and call_eval.lead_id:
                lead_row = (await session.execute(
                    select(Lead.pipeline_id).where(Lead.id == call_eval.lead_id)
                )).first()
                if lead_row and lead_row[0]:
                    call_eval.pipeline_id = lead_row[0]

            if call_eval.pipeline_id in disabled_pipelines or not call_eval.pipeline_id:
                call_eval.status = "skipped_pipeline"
                call_eval.skip_reason = "Анализ отключён для данной воронки"
                await session.commit()
                return True

        min_dur = qc_settings.min_duration_sec or 20
        max_dur = qc_settings.max_duration_sec or 600
        dur = call_eval.duration_seconds or 0
        if dur > 0 and (dur < min_dur or dur > max_dur):
            call_eval.status = "skipped_duration"
            call_eval.skip_reason = f"Длительность {dur} сек вне диапазона ({min_dur}-{max_dur} сек)"
            await session.commit()
            return True

    # Блокировка от состояния гонки: переводим в статус processing
    call_eval.status = "processing"
    await session.commit()

    gemini_key = decrypt_token(acc.ai_encrypted_token)
    rules = await get_active_rules(session, account_id, call_eval.pipeline_id)

    # Скачивание аудиозаписи
    audio_bytes, mime_type = await fetch_audio_bytes(call_eval.recording_url)
    if not audio_bytes:
        call_eval.status = "error"
        call_eval.skip_reason = "Не удалось скачать аудиозапись по ссылке телефонии"
        await session.commit()
        return False

    # Замер реальной длительности через тредпул
    actual_duration = await get_audio_duration_seconds(audio_bytes, mime_type)
    if actual_duration > 0:
        call_eval.duration_seconds = int(round(actual_duration))

    # Проверка фактической длительности звука
    if not force:
        min_dur = qc_settings.min_duration_sec or 20
        max_dur = qc_settings.max_duration_sec or 600
        dur = call_eval.duration_seconds or 0
        if dur < min_dur or dur > max_dur:
            call_eval.status = "skipped_duration"
            call_eval.skip_reason = f"Реальная длительность {dur} сек вне диапазона ({min_dur}-{max_dur} сек)"
            await session.commit()
            return True

    # Анализ в Gemini с retry logic
    analysis = await evaluate_call_with_gemini(
        audio_bytes=audio_bytes,
        mime_type=mime_type,
        rules=rules,
        api_key=gemini_key,
        model_name=qc_settings.ai_model or acc.ai_model or "gemini-2.0-flash",
        custom_prompt=qc_settings.system_prompt,
        company_context=acc.ai_company_context,
    )

    if not analysis:
        call_eval.status = "error"
        call_eval.skip_reason = "Ошибка ответа нейросети при анализе (таймаут или превышение квоты)"
        await session.commit()
        return False

    # Математический расчет оценки
    rules_eval = analysis.get("rules_evaluation") or []
    score, anomaly_points, enriched_breakdown = calculate_score_and_anomalies(rules_eval, rules)

    # Формирование списка ошибок
    errors_list = []
    for r in enriched_breakdown:
        if not r.get("passed"):
            ts = f"[{r.get('timestamp')}] " if r.get('timestamp') else ""
            title = r.get("rule_title") or f"Qoida #{r.get('rule_id')}"
            details = r.get("details")
            errors_list.append(f"{ts}{title}: {details}" if details else f"{ts}{title}")

    # Сохранение результатов
    call_eval.status = "completed"
    call_eval.overall_score = score
    call_eval.rules_breakdown = enriched_breakdown
    call_eval.errors_list = errors_list
    call_eval.anomaly_points = anomaly_points

    await session.commit()
    logger.info(f"Successfully evaluated call #{call_eval.id} (score={score}%)")
    return True


async def qualify_raw_calls(session: AsyncSession, account_id: Optional[int] = None, batch_size: int = 500) -> int:
    """
    Квалифицирует сырые звонки из crm_sync (status='raw') с устранением N+1 запросов.
    """
    stmt = select(QcCallEvaluation).where(QcCallEvaluation.status == "raw")
    if account_id is not None:
        stmt = stmt.where(QcCallEvaluation.account_id == account_id)
    stmt = stmt.order_by(QcCallEvaluation.id.asc()).limit(batch_size)

    raw_calls = (await session.execute(stmt)).scalars().all()
    if not raw_calls:
        return 0

    now_utc = datetime.now(timezone.utc)

    # 1. Батчевая предзагрузка настроек QcSettings (устранение N+1)
    acc_ids = {c.account_id for c in raw_calls}
    qc_rows = (await session.execute(
        select(QcSettings).where(QcSettings.account_id.in_(acc_ids))
    )).scalars().all()
    qc_settings_cache = {q.account_id: q for q in qc_rows}

    # 2. Батчевая предзагрузка pipeline_id для сделок без воронки (устранение N+1)
    missing_lead_ids = {c.lead_id for c in raw_calls if not c.pipeline_id and c.lead_id}
    lead_pipe_map: Dict[int, Optional[int]] = {}
    if missing_lead_ids:
        lead_rows = (await session.execute(
            select(Lead.id, Lead.pipeline_id).where(Lead.id.in_(missing_lead_ids))
        )).all()
        lead_pipe_map = {row[0]: row[1] for row in lead_rows}

    qualified_count = 0

    for call in raw_calls:
        qc_set = qc_settings_cache.get(call.account_id)

        # 1. Проверка ответа телефонии
        if call.call_status is not None and call.call_status != 4:
            call.status = "skipped_not_answered"
            call.skip_reason = CALL_STATUS_DESCRIPTIONS.get(call.call_status, f"код статуса {call.call_status}")
            qualified_count += 1
            continue
        if call.duration_seconds is not None and call.duration_seconds <= 0:
            call.status = "skipped_not_answered"
            call.skip_reason = "Длительность звонка 0 сек (недозвон)"
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

        # 4. Проверка даты активации КК или архивности
        act_time = qc_set.activated_at or qc_set.updated_at
        if act_time and call.call_date < act_time:
            call.status = "skipped_historical"
            call.skip_reason = "Архивный звонок (до активации КК)"
            qualified_count += 1
            continue
        elif not act_time and call.call_date < (now_utc - timedelta(days=2)):
            call.status = "skipped_historical"
            call.skip_reason = "Архивный звонок (старше 2 дней)"
            qualified_count += 1
            continue

        # 5. Исключенные воронки
        if not call.pipeline_id and call.lead_id:
            call.pipeline_id = lead_pipe_map.get(call.lead_id)

        disabled_pipes = set(qc_set.disabled_pipeline_ids or [])
        if disabled_pipes:
            if call.pipeline_id in disabled_pipes or not call.pipeline_id:
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

        call.status = "pending"
        call.skip_reason = None
        qualified_count += 1

    await session.commit()
    return qualified_count


async def process_pending_calls(session: AsyncSession, limit: int = 3) -> int:
    """Выбирает звонки в статусе 'pending' и отправляет на анализ."""
    # Также подбираем зависшие в processing более 15 минут назад звонки (на случай аварийного рестарта контейнера)
    stale_threshold = datetime.now(timezone.utc) - timedelta(minutes=15)
    
    stmt = (
        select(QcCallEvaluation.id)
        .join(QcSettings, QcSettings.account_id == QcCallEvaluation.account_id)
        .join(Account, Account.id == QcCallEvaluation.account_id)
        .where(
            or_(
                QcCallEvaluation.status == "pending",
                and_(QcCallEvaluation.status == "processing", QcCallEvaluation.created_at < stale_threshold)
            ),
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
            logger.error(f"QC Background Worker iteration error: {e}", exc_info=True)

        await asyncio.sleep(15)
