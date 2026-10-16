import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
import httpx

logger = logging.getLogger("AnomalyEngine")

def calculate_stage_benchmarks(won_history: List[Any]) -> Dict[int, float]:
    """
    Вычисляет медианное время прохождения этапов (в часах) по успешным сделкам (won).
    """
    stage_durations: Dict[int, List[float]] = {}
    for h in won_history:
        if h.duration_seconds and h.duration_seconds > 0:
            stage_durations.setdefault(h.stage_id, []).append(h.duration_seconds / 3600.0)

    benchmarks: Dict[int, float] = {}
    for stage_id, durations in stage_durations.items():
        durations.sort()
        n = len(durations)
        if n == 0:
            benchmarks[stage_id] = 24.0
        elif n % 2 == 1:
            benchmarks[stage_id] = round(durations[n // 2], 1)
        else:
            benchmarks[stage_id] = round((durations[n // 2 - 1] + durations[n // 2]) / 2.0, 1)

    return benchmarks


def audit_lead_math(
    lead: Any,
    stage_history: List[Any],
    skips: List[Any],
    calls: List[Any],
    stage_benchmarks: Dict[int, float],
    stage_names: Dict[int, str],
    avg_won_price: float = 0.0,
) -> Dict[str, Any]:
    """
    Выполняет строгий математический аудит слитой сделки.
    Применяет "Правило усилий" (Effort Check) для защиты добросовестных менеджеров.
    """
    time_penalty = 0
    stagnant_stages_info = []
    effort_shield_active = False

    # 1. Анализируем звонки
    total_calls = len(calls)
    completed_calls = [c for c in calls if c.duration_seconds and c.duration_seconds >= 20]
    total_completed = len(completed_calls)

    # Уникальные даты попыток звонков (в днях)
    call_dates = set()
    for c in calls:
        if c.call_date:
            call_dates.add(c.call_date.strftime("%Y-%m-%d"))
    unique_call_days = len(call_dates)

    # Проверяем "Правило усилий": менеджер звонил в разные дни 4+ раз
    if total_calls >= 4 and unique_call_days >= 2:
        effort_shield_active = True

    # 2. Анализ этапов воронки
    for sh in stage_history:
        s_id = sh.stage_id
        s_name = stage_names.get(s_id, f"Этап #{s_id}").lower()
        duration_hrs = (sh.duration_seconds or 0) / 3600.0
        bench_hrs = stage_benchmarks.get(s_id, 24.0)
        if bench_hrs <= 0:
            bench_hrs = 24.0

        is_unreached_stage = any(w in s_name for w in ["недозвон", "не отвечает", "перезвон", "думает", "ожидание"])

        # Если это этап недозвона/ожидания и менеджер проявил реальные усилия — снимаем штраф времени!
        if is_unreached_stage and effort_shield_active:
            continue

        if duration_hrs > 4 * bench_hrs and duration_hrs >= 48:
            time_penalty += 30
            stagnant_stages_info.append({
                "stage_name": stage_names.get(s_id, f"Этап #{s_id}"),
                "duration_hours": round(duration_hrs, 1),
                "benchmark_hours": bench_hrs,
                "factor": round(duration_hrs / bench_hrs, 1),
                "severity": "critical"
            })
        elif duration_hrs > 2 * bench_hrs and duration_hrs >= 24:
            time_penalty += 15
            stagnant_stages_info.append({
                "stage_name": stage_names.get(s_id, f"Этап #{s_id}"),
                "duration_hours": round(duration_hrs, 1),
                "benchmark_hours": bench_hrs,
                "factor": round(duration_hrs / bench_hrs, 1),
                "severity": "moderate"
            })

    time_penalty = min(time_penalty, 40)

    # 3. Штрафы по звонкам и контролю качества
    calls_penalty = 0
    qc_scores = [c.overall_score for c in calls if c.overall_score is not None]
    avg_qc_score = round(sum(qc_scores) / len(qc_scores), 1) if qc_scores else None

    if total_calls == 0:
        calls_penalty += 40  # Слив без единой попытки звонка
    elif total_completed == 0:
        if total_calls < 3 and not effort_shield_active:
            calls_penalty += 25  # Бросил после 1-2 гудков без системных попыток
    else:
        if avg_qc_score is not None:
            if avg_qc_score < 50:
                calls_penalty += 25  # Грубые нарушения регламента диалога
            elif avg_qc_score < 70:
                calls_penalty += 15  # Низкое качество речи

    # Проверка на грубые ошибки из QC
    critical_qc_errors = []
    for c in calls:
        if c.errors_list and isinstance(c.errors_list, list):
            for err in c.errors_list:
                critical_qc_errors.append(str(err))

    if len(critical_qc_errors) >= 3:
        calls_penalty += 10

    calls_penalty = min(calls_penalty, 45)

    # 4. Штрафы за перепрыгивание обязательных этапов
    skips_penalty = 0
    if skips:
        skips_penalty = min(len(skips) * 15, 25)

    # 5. Штраф за крупный чек при наличии косяков
    price_penalty = 0
    lead_price = float(lead.price or 0)
    if avg_won_price > 0 and lead_price >= 1.5 * avg_won_price:
        if time_penalty > 0 or calls_penalty > 0:
            price_penalty = 15

    raw_score = time_penalty + calls_penalty + skips_penalty + price_penalty

    # Если сработал Effort Shield и нет других грубых нарушений — гарантируем справедливую оценку
    if effort_shield_active and calls_penalty == 0 and time_penalty == 0:
        raw_score = min(raw_score, 20)

    anomaly_score = max(0, min(100, raw_score))

    # Определение уровня риска
    if anomaly_score >= 80:
        anomaly_level = "critical"
        manager_fault = "high"
    elif anomaly_score >= 50:
        anomaly_level = "warning"
        manager_fault = "medium"
    else:
        anomaly_level = "fair"
        manager_fault = "none"

    # Формируем главный фактор (key_factor)
    key_factors = []
    if total_calls == 0:
        key_factors.append("Закрыта без единого звонка клиенту")
    elif total_completed == 0 and not effort_shield_active:
        key_factors.append(f"Всего {total_calls} гудка без попыток перезвона")
    elif effort_shield_active and anomaly_level == "fair":
        key_factors.append(f"Честный недозвон: {total_calls} звонков в разные дни, регламент соблюден")

    if stagnant_stages_info:
        top_stag = stagnant_stages_info[0]
        key_factors.append(f"Зависание на этапе '{top_stag['stage_name']}' в {top_stag['factor']}x выше нормы")

    if avg_qc_score is not None and avg_qc_score < 60:
        key_factors.append(f"Низкий балл контроля качества звонков ({avg_qc_score}%)")

    if skips:
        key_factors.append(f"Срез воронки ({len(skips)} пропущенных этапов)")

    main_factor = "; ".join(key_factors[:2]) if key_factors else "Нарушений регламента не зафиксировано"

    return {
        "anomaly_score": anomaly_score,
        "anomaly_level": anomaly_level,
        "manager_fault": manager_fault,
        "key_factor": main_factor,
        "effort_shield_active": effort_shield_active,
        "breakdown": {
            "time_penalty": time_penalty,
            "calls_penalty": calls_penalty,
            "skips_penalty": skips_penalty,
            "price_penalty": price_penalty,
            "total_calls": total_calls,
            "completed_calls": total_completed,
            "unique_call_days": unique_call_days,
            "avg_qc_score": avg_qc_score,
            "stagnant_stages": stagnant_stages_info,
            "critical_qc_errors": critical_qc_errors[:5],
            "skipped_stages_count": len(skips),
        }
    }


async def generate_ai_forensic_verdict(
    lead_name: str,
    price: float,
    stated_reason: Optional[str],
    audit_math: Dict[str, Any],
    stage_timeline: List[Dict[str, Any]],
    calls_summary: List[Dict[str, Any]],
    api_key: Optional[str] = None,
    model_name: Optional[str] = "gemini-2.5-flash",
    company_context: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Генерирует интеллектуальный вердикт следователя (AI Forensic Verdict).
    Если API ключ доступен — использует Gemini 2.5 Flash.
    Если недоступен — формирует высокоточный фактологический вердикт на основе эвристики.
    """
    # Fallback генератор (на случай отсутствия AI-токена)
    def fallback_verdict():
        score = audit_math["anomaly_score"]
        fault = audit_math["manager_fault"]
        effort = audit_math.get("effort_shield_active", False)
        breakdown = audit_math.get("breakdown", {})
        total_calls = breakdown.get("total_calls", 0)

        stated = stated_reason or "Причина не указана"

        if effort and fault == "none":
            real_reason = "Объективная недоступность клиента (соблюден регламент дозвона)"
            pivot = "Клиент перестал отвечать на звонки после многократных попыток связи"
            summary = (
                f"Менеджер действовал корректно: совершил {total_calls} попыток дозвона в разные дни. "
                f"Причина менеджера «{stated}» подтверждена фактами. Вины менеджера в срыве сделки нет."
            )
            rec = "Сделка закрыта обоснованно. Рекомендуется отправить в автоматическую прогревающую рассылку."
        elif total_calls == 0:
            real_reason = "Сделка брошена без попытки установить контакт"
            pivot = "Лид поступил в CRM, но менеджер не сделал ни одного исходящего звонка"
            summary = (
                f"Менеджер указал «{stated}», однако по сделке нет ни одного зафиксированного звонка. "
                "Лид был слит без реальной попытки квалификации."
            )
            rec = "Срочно переназначить сделку на другого менеджера для первого контакта и проверить дисциплину."
        elif breakdown.get("stagnant_stages"):
            top_s = breakdown["stagnant_stages"][0]
            real_reason = f"Потеря инициативы и критическое зависание на этапе '{top_s['stage_name']}'"
            pivot = f"Сделка пролежала на этапе '{top_s['stage_name']}' {top_s['duration_hours']} ч. (норма: {top_s['benchmark_hours']} ч.)"
            summary = (
                f"Менеджер указал причину «{stated}», однако сделка была упущена из-за затягивания сроков "
                f"на этапе '{top_s['stage_name']}' в {top_s['factor']} раз дольше нормы."
            )
            rec = "Разобрать с менеджером соблюдение тайминга этапов. Клиент мог уйти к более оперативному конкуренту."
        else:
            real_reason = stated
            pivot = "Закрытие сделки в отказ"
            summary = f"Сделка закрыта со статусом «{stated}». Индекс аномальности {score}%."
            rec = "Контроль на регулярной планерке."

        return {
            "real_loss_reason": real_reason,
            "manager_guilt": fault,
            "pivot_point": pivot,
            "forensic_summary": summary,
            "rop_recommendation": rec,
            "score_adjustment": 0
        }

    if not api_key:
        return fallback_verdict()

    try:
        clean_model = (model_name or "gemini-2.5-flash").strip().removeprefix("models/")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={api_key}"

        payload_context = {
            "deal_name": lead_name,
            "budget": price,
            "stated_reason": stated_reason or "Не указано",
            "anomaly_score": audit_math["anomaly_score"],
            "manager_fault_level": audit_math["manager_fault"],
            "effort_shield_active": audit_math.get("effort_shield_active", False),
            "breakdown": audit_math.get("breakdown", {}),
            "timeline": stage_timeline[:8],
            "calls": calls_summary[:5],
        }

        system_prompt = f"""Ты — беспристрастный и опытный цифровой аудитор (следователь) отдела продаж для РОПа.
Твоя задача — изучить досье слитой сделки из AmoCRM и вскрыть ПРАВДУ: кто виноват в потере сделки (клиент или менеджер) и почему.

Контекст бизнеса:
{company_context or 'Стандартный B2B/B2C отдел продаж'}

ПРАВИЛА АРБИТРАЖА:
1. Если менеджер указал 'Дорого' / 'Клиент передумал', но по факту не звонил или сделка висела неделями без движения — прямо разоблачи отмазку.
2. ЕСЛИ менеджер проявил добросовестность (сделал 4+ звонков в разные дни, но клиент не брал трубку) — ОБЯЗАТЕЛЬНО встань на защиту менеджера, сними с него вину и напиши, что отказ объективен.
3. Укажи конкретную поворотную точку (pivot_point) — где и когда сделка фактически умерла.
4. Дай РОПу четкую рекомендацию: стоит ли попытаться спасти лида другим менеджером или списать в архив.

Верни ответ СТРОГО в формате JSON со следующими полями:
{{
  "real_loss_reason": "краткая формулировка реальной причины слива (до 10 слов)",
  "manager_guilt": "high" | "medium" | "none",
  "pivot_point": "конкретная дата или момент потери сделки (1 предложение)",
  "forensic_summary": "подробный аргументированный вердикт для РОПа (2-3 предложения)",
  "rop_recommendation": "конкретное управленческое действие для РОПа (1-2 предложения)",
  "score_adjustment": число (0 если согласен с математикой, -20 если менеджер старался и нужно смягчить, +15 если вскрылся грубый обман)
}}"""

        req_body = {
            "contents": [
                {
                    "parts": [
                        {"text": system_prompt},
                        {"text": f"Досье сделки:\n{json.dumps(payload_context, ensure_ascii=False, indent=2)}"}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "response_mime_type": "application/json"
            }
        }

        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(url, json=req_body)
            if resp.status_code == 200:
                data = resp.json()
                text_content = data["candidates"][0]["content"]["parts"][0]["text"]
                parsed = json.loads(text_content)
                return {
                    "real_loss_reason": parsed.get("real_loss_reason") or fallback_verdict()["real_loss_reason"],
                    "manager_guilt": parsed.get("manager_guilt") or audit_math["manager_fault"],
                    "pivot_point": parsed.get("pivot_point") or fallback_verdict()["pivot_point"],
                    "forensic_summary": parsed.get("forensic_summary") or fallback_verdict()["forensic_summary"],
                    "rop_recommendation": parsed.get("rop_recommendation") or fallback_verdict()["rop_recommendation"],
                    "score_adjustment": int(parsed.get("score_adjustment") or 0)
                }
            else:
                logger.warning(f"Gemini API returned status {resp.status_code}: {resp.text}")
                return fallback_verdict()
    except Exception as e:
        logger.warning(f"Failed to generate AI verdict with Gemini: {e}")
        return fallback_verdict()

