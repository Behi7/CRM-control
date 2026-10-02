from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
import httpx
from app.core.database import sync_engine
from app.core.security import get_current_user, decrypt_token
from app.modules.time_analytics.router import get_stages_stats, format_duration

router = APIRouter(tags=["AI Chat & Predictions"])

class AiChatBody(BaseModel):
    message: str
    pipelineId: Optional[int] = None
    filters: Optional[dict] = None
    biData: Optional[dict] = None
    biSelectedBlocks: Optional[list[str]] = None
    history: Optional[list[dict]] = None
    lang: Optional[str] = "ru"

def check_account_access(user: dict, account_id: int):
    if user.get("role") != "admin" and user.get("accountId") != account_id:
        raise HTTPException(status_code=403, detail="Access denied to this account")

@router.get("/accounts/{account_id}/ai-status")
def get_ai_status(account_id: int, user: dict = Depends(get_current_user)):
    check_account_access(user, account_id)
    with sync_engine.connect() as conn:
        acc = conn.execute(
            text("SELECT ai_enabled, ai_model, ai_encrypted_token FROM accounts WHERE id = :id"),
            {"id": account_id}
        ).mappings().first()
        if not acc:
            raise HTTPException(status_code=404, detail="Account not found")

        return {
            "enabled": bool(acc["ai_enabled"] and acc["ai_encrypted_token"]),
            "model": acc["ai_model"] or "gemini-2.5-flash",
        }

@router.post("/accounts/{account_id}/ai-chat")
async def chat_ai(account_id: int, body: AiChatBody, user: dict = Depends(get_current_user)):
    check_account_access(user, account_id)
    with sync_engine.connect() as conn:
        acc = conn.execute(
            text("""
                SELECT ai_enabled, ai_model, ai_encrypted_token, ai_company_context, subdomain, base_domain
                FROM accounts WHERE id = :id
            """),
            {"id": account_id}
        ).mappings().first()
        if not acc:
            raise HTTPException(status_code=404, detail="Account not found")

        if not acc["ai_enabled"] or not acc["ai_encrypted_token"]:
            raise HTTPException(status_code=400, detail="AI analyst is not enabled or API key is missing")

        api_key = decrypt_token(acc["ai_encrypted_token"])
        model_name = acc["ai_model"] or "gemini-2.5-flash"
        clean_model = model_name.strip().removeprefix("models/")
        ai_context = acc["ai_company_context"] or ""
        is_uz = body.lang == "uz"

        if body.biData:
            bi = body.biData
            selected = body.biSelectedBlocks or ["overview"]
            bi_context = "=== AMO-CRM BI ANALITIKA MA'LUMOTLARI ===\n" if is_uz else "=== ДАННЫЕ BI-АНАЛИТИКИ AMOCRM С ЭКРАНА ПОЛЬЗОВАТЕЛЯ ===\n"

            if "overview" in selected and bi.get("kpis"):
                k = bi["kpis"]
                bi_context += (
                    f"\n[1. UMUMIY KPI VA MOLIYA]:\n"
                    f"- Jami bitimlar: {k.get('totalLeads')}\n"
                    f"- Won: {k.get('wonLeads')}, Tushum: {k.get('totalRevenue')}\n"
                    f"- Open: {k.get('openLeads')}, Potensial: {k.get('openPipelineValue')}\n"
                    f"- Lost: {k.get('lostLeads')}, Yo'qotilgan: {k.get('lostRevenue')}\n"
                    f"- O'rtacha chek: {k.get('avgCheck')}, WinRate: {k.get('winRateClosed')}%\n"
                ) if is_uz else (
                    f"\n[1. СВОДНЫЕ KPI И ФИНАНСЫ]:\n"
                    f"- Всего сделок: {k.get('totalLeads')}\n"
                    f"- Успешно (Won): {k.get('wonLeads')}, Выручка: {k.get('totalRevenue')}\n"
                    f"- В работе (Open): {k.get('openLeads')}, Потенциал: {k.get('openPipelineValue')}\n"
                    f"- Отказ (Lost): {k.get('lostLeads')}, Потери: {k.get('lostRevenue')}\n"
                    f"- Средний чек: {k.get('avgCheck')}, Конверсия: {k.get('winRateClosed')}%\n"
                )

            if "managers" in selected and isinstance(bi.get("managers"), list):
                bi_context += "\n[2. MENEJERLAR]:\n" if is_uz else "\n[2. РЕЙТИНГ МЕНЕДЖЕРОВ]:\n"
                for m in bi["managers"][:10]:
                    bi_context += f"  * {m.get('managerName')}: Won={m.get('wonLeads')}, WinRate={m.get('winRate')}%, Tushum={m.get('revenue')}\n"

            sys_instruction = (
                f"Sen — amoCRM bo'yicha yetakchi Biznes-Tahlilchi (BI Analyst)san.\n"
                f"{f'=== KOMPANIYA ===\n{ai_context}\n\n' if ai_context else ''}"
                f"{bi_context}\n\n"
                "Qoidalar:\n1. O'zbek tilida (lotin) javob ber.\n2. Ma'lumot so'rama, barcha raqamlar yuqorida keltirilgan.\n3. ROP uchun 3-4 ta aniq tavsiya ber.\n4. Raqamlarni **qalin** qilib ko'rsat."
            ) if is_uz else (
                f"Ты — ведущий Бизнес-Аналитик (BI Analyst) и эксперт amoCRM.\n"
                f"{f'=== О КОМПАНИИ ===\n{ai_context}\n\n' if ai_context else ''}"
                f"{bi_context}\n\n"
                "Правила:\n1. Отвечай на русском языке.\n2. Не проси данных — все цифры перед тобой.\n3. Дай 3-4 конкретные рекомендации РОПу.\n4. Выделяй важные цифры **жирным**."
            )

            return await execute_gemini_call(clean_model, api_key, sys_instruction, body.history, body.message, is_uz)

        # Time Analytics Context
        pipe_id = body.pipelineId
        if not pipe_id:
            first_p = conn.execute(
                text("SELECT id, name FROM pipelines WHERE account_id = :acc_id AND is_archived = false ORDER BY id ASC"),
                {"acc_id": account_id}
            ).mappings().first()
            pipe_id = first_p["id"] if first_p else None
            pipe_name = first_p["name"] if first_p else ""
        else:
            p_row = conn.execute(
                text("SELECT name FROM pipelines WHERE id = :id AND account_id = :acc_id"),
                {"id": pipe_id, "acc_id": account_id}
            ).mappings().first()
            pipe_name = p_row["name"] if p_row else ""

        table_text = ""
        if pipe_id:
            filters_dict = body.filters or {}
            stats_res = get_stages_stats(
                pipeline_id=pipe_id,
                tag_ids=filters_dict.get("tagIds", []),
                status=filters_dict.get("status"),
                manager_ids=filters_dict.get("managerIds", []),
                date_from=filters_dict.get("dateFrom"),
                date_to=filters_dict.get("dateTo"),
                user=user,
            )
            table_text = (
                f"Voronka: \"{pipe_name}\"\n"
                "| Bosqich | O'rtacha vaqt | Sakrashlar | O'tgan bitimlar | Hozirda bosqichda |\n|---|---|---|---|---|\n"
            ) if is_uz else (
                f"Воронка: \"{pipe_name}\"\n"
                "| Этап | Среднее время | Пропуски | Пройдено сделок | Сейчас на этапе |\n|---|---|---|---|---|\n"
            )
            for s in stats_res.get("items", []):
                act_time = format_duration(s.get("avgSecondsActual"), body.lang or "ru")
                table_text += f"| {s.get('name')} | {act_time} | {s.get('skipsCount')} | {s.get('leadsCount')} | {s.get('activeLeadsCount')} |\n"

        sys_instruction = (
            f"Sen — amoCRM savdo voronkalarini optimallashtirish bo'yicha yetakchi biznes-tahlilchisan.\n"
            f"{f'=== KOMPANIYA ===\n{ai_context}\n\n' if ai_context else ''}"
            f"=== VORONKA BOSQICHLARI JADVALI ===\n{table_text}\n\n"
            "Qoidalar:\n1. O'zbek tilida (lotin) professional javob ber.\n2. Tor joylar (bottlenecks) va sakrashlarni tahlil qil.\n3. ROP uchun 3-4 amaliy tavsiya ber.\n4. Raqamlarni **qalin** shriftda yoz."
        ) if is_uz else (
            f"Ты — ведущий эксперт по оптимизации воронок продаж amoCRM и времени цикла сделки.\n"
            f"{f'=== О КОМПАНИИ ===\n{ai_context}\n\n' if ai_context else ''}"
            f"=== ТАБЛИЦА ЭТАПОВ ВОРОНКИ ===\n{table_text}\n\n"
            "Правила:\n1. Отвечай на русском языке.\n2. Проанализируй узкие места (задержки) и пропуски этапов.\n3. Дай 3-4 конкретные рекомендации РОПу.\n4. Выделяй важные цифры и этапы **жирным**."
        )

        return await execute_gemini_call(clean_model, api_key, sys_instruction, body.history, body.message, is_uz)

async def execute_gemini_call(
    clean_model: str,
    api_key: str,
    system_instruction: str,
    history: list | None,
    user_message: str,
    is_uz: bool,
) -> dict:
    contents = []
    if history and isinstance(history, list):
        for h in history:
            text_val = h.get("text")
            role = h.get("role")
            if text_val and role in ("user", "model"):
                contents.append({"role": role, "parts": [{"text": text_val}]})

    contents.append({"role": "user", "parts": [{"text": user_message}]})

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={api_key}"
    payload = {
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 2048},
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                err_text = resp.text
                raise HTTPException(status_code=502, detail=f"Ошибка Gemini API: {resp.status_code} {err_text}")

            res_json = resp.json()
            candidates = res_json.get("candidates", [])
            reply = (
                candidates[0].get("content", {}).get("parts", [{}])[0].get("text")
                if candidates else None
            ) or ("Modeldan javob olib bo'lmadi." if is_uz else "Не удалось получить ответ от модели.")
            return {"reply": reply}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=504, detail=f"Таймаут или сбой обращения к ИИ: {str(e)}")

@router.get("/summary/{account_id}")
def get_account_summary(account_id: int, user: dict = Depends(get_current_user)):
    check_account_access(user, account_id)
    with sync_engine.connect() as conn:
        managers_count = conn.execute(
            text("SELECT COUNT(*) FROM amo_users WHERE account_id = :acc_id AND is_archived = false"),
            {"acc_id": account_id},
        ).scalar()

    return {
        "module": "03_python_analytics",
        "accountId": account_id,
        "activeManagersInDb": managers_count or 0,
    }
