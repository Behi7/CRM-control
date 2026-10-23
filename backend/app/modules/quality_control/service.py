import asyncio
import base64
import json
import logging
from datetime import datetime, timezone
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
        {"id": None, "title": "Поздоровался и представился", "description": "Назвал имя и компанию", "penalty": 10},
        {"id": None, "title": "Выявил потребность и боли", "description": "Задал уточняющие вопросы", "penalty": 15},
        {"id": None, "title": "Озвучил стоимость или вилку цен", "description": "Четко ответил по цене", "penalty": 20},
        {"id": None, "title": "Не перебивал клиента", "description": "Слушал внимательно", "penalty": 15},
        {"id": None, "title": "Назначил следующий шаг", "description": "Зафиксировал дедлайн или договоренность", "penalty": 25},
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

        rules_formatted = "\n".join([
            f"- Закон {i+1} [ID={r.get('id') or (i+1)}]: \"{r['title']}\". Что проверить: {r.get('description') or 'проверить соблюдение'}."
            for i, r in enumerate(rules)
        ])

        base_instruction = (
            custom_prompt.strip()
            if (custom_prompt and custom_prompt.strip())
            else """Ты — объективный, строгий и профессиональный эксперт службы контроля качества звонков отдела продаж.
Твоя задача — внимательно прослушать аудиозапись разговора менеджера с клиентом, провести глубокий фактологический аудит диалога по законам регламента.
Твоя цель — исключительно зафиксировать объективные факты: соблюдено правило (passed: true) или нарушено (passed: false), привести точные таймкоды и цитаты. Никаких баллов и оценок рассчитывать не нужно.
Тебе НЕ нужно транскрибировать разговор целиком. Вместо этого сфокусируйся на точности аудита: таймкодах, цитатах ошибок и готовых скриптах (как менеджеру нужно было сказать правильно).
Будь строгим, но объективным. Замечай перебивания клиента, уход от прямого ответа по ценам, пассивность, отсутствие инициативы."""
        )

        company_section = ""
        if company_context and company_context.strip():
            company_section = f"\nКонтекст о компании и специфика бизнеса:\n{company_context.strip()}\n"

        system_instruction = f"""
{base_instruction}
{company_section}
Законы регламента для проверки:
{rules_formatted}

Инструкция проверки:
- Для КАЖДОГО закона из списка определи: был ли он соблюдён менеджером (passed: true) или нарушен (passed: false).
- В поле timestamp укажи точный таймкод (в формате "ММ:СС", например "01:24"), к которому относится соблюдение или нарушение данного правила (или null, если неприменимо).
- В поле details укажи конкретную аргументацию с точной цитатой из звонка (что именно сказал менеджер или клиент).
- В поле improvement (ОБЯЗАТЕЛЬНО для правил с passed: false): напиши готовый эталонный речевой скрипт для менеджера — как именно следовало сказать/поступить в этой ситуации. Если правило passed: true, укажи null.
- В поле errors_summary: перечисли конкретные ошибки с указанием таймкода в квадратных скобках (например, "[01:15] Не назвал вилку цен", "[02:30] Перебил клиента").
- В поле bottleneck: детально опиши узкое место (момент, где диалог дал сбой, клиент засомневался, возникло недопонимание или менеджер упустил инициативу) с указанием таймкода.
- В поле brief_summary: краткая суть диалога (2-3 предложения).
- В поле recommendation: конкретная рекомендация менеджеру и руководителю (РОПу) по улучшению конверсии.
- Если звонок фактически не состоялся (гудки, автоответчик, сброс, абонент не взял трубку):
  - Поставь всем правилам passed: false.
  - В errors_summary укажи ["[00:00] Звонок не состоялся / абонент не ответил"].

Верни ответ СТРОГО в формате JSON по следующей схеме:
{{
  "rules_evaluation": [
    {{
      "rule_id": 1,
      "rule_title": "Поздоровался и представился",
      "passed": true,
      "timestamp": "00:04",
      "details": "Менеджер поприветствовал: «Добрый день, компания Эксперт, меня зовут Алишер»",
      "improvement": null
    }},
    {{
      "rule_id": 2,
      "rule_title": "Озвучил стоимость или вилку цен",
      "passed": false,
      "timestamp": "01:45",
      "details": "На прямой вопрос клиента «Сколько это стоит?» менеджер ответил уклончиво: «Ну, там всё индивидуально...»",
      "improvement": "Следовало назвать вилку: «Стоимость базового пакета от 500 000 сум, расширенного — 900 000 сум. Давайте я уточню детали...»"
    }}
  ],
  "errors_summary": [
    "[01:45] Менеджер уклонился от прямого ответа на вопрос о стоимости"
  ],
  "bottleneck": "На 01:45 клиент прямо спросил стоимость, менеджер замялся и не назвал даже ориентир.",
  "brief_summary": "Первичный звонок от клиента по поводу продукта. Клиент интересовался условиями.",
  "recommendation": "Менеджеру нужно уверенно называть ориентировочные цены и задавать встречный вопрос."
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


async def process_call_evaluation(session: AsyncSession, eval_id: int) -> bool:
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

    disabled_pipelines = set(qc_settings.disabled_pipeline_ids or [])
    if call_eval.pipeline_id and call_eval.pipeline_id in disabled_pipelines:
        call_eval.status = "skipped_pipeline"
        call_eval.skip_reason = "Анализ отключён для данной воронки"
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
    score, anomaly_points = calculate_score_and_anomalies(rules_eval, rules)

    # 5. Сохранение результата
    call_eval.status = "completed"
    call_eval.overall_score = score
    call_eval.rules_breakdown = rules_eval
    call_eval.errors_list = analysis.get("errors_summary")
    call_eval.bottleneck = analysis.get("bottleneck")
    call_eval.transcript = None
    call_eval.summary = analysis.get("brief_summary")
    call_eval.recommendation = analysis.get("recommendation")
    call_eval.anomaly_points = anomaly_points

    await session.commit()

    logger.info(f"Successfully evaluated call #{call_eval.id} (external={call_eval.external_call_id}): score={score}%")
    return True


async def process_pending_calls(session: AsyncSession, limit: int = 5) -> int:
    """Выбирает звонки в статусе 'pending' и прогоняет их через анализ."""
    stmt = (
        select(QcCallEvaluation.id)
        .where(QcCallEvaluation.status == "pending")
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
                processed = await process_pending_calls(session, limit=3)
                if processed > 0:
                    logger.info(f"QC Worker processed {processed} pending calls.")
        except asyncio.CancelledError:
            logger.info("QC Background Worker stopped.")
            break
        except Exception as e:
            logger.error(f"QC Background Worker iteration error: {e}")

        await asyncio.sleep(15)

