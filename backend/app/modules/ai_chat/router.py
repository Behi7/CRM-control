from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
import httpx
from app.core.database import sync_engine
from app.core.security import get_current_user, decrypt_token
from app.modules.analytics.stages import get_stages_stats, get_all_pipelines_stages_stats
from app.modules.analytics.common import format_duration

router = APIRouter(tags=["AI Chat & Predictions"])

class AiChatBody(BaseModel):
    message: str
    pipelineId: Optional[int] = None
    filters: Optional[dict] = None
    biData: Optional[dict] = None
    biSelectedBlocks: Optional[list[str]] = None
    stagePipelineChoice: Optional[Any] = None
    history: Optional[list[dict]] = None
    lang: Optional[str] = "ru"

def check_account_access(user: dict, account_id: int):
    if user.get("role") != "admin" and user.get("accountId") != account_id:
        raise HTTPException(status_code=403, detail="Access denied to this account")

@router.get("/accounts/{account_id}/ai-status")
@router.get("/accounts/{account_id}/ai/status")
def get_ai_status(account_id: int, user: dict = Depends(get_current_user)):
    check_account_access(user, account_id)
    with sync_engine.connect() as conn:
        acc = conn.execute(
            text("SELECT ai_enabled, ai_model, ai_encrypted_token, chat_settings FROM accounts WHERE id = :id"),
            {"id": account_id}
        ).mappings().first()
        if not acc:
            raise HTTPException(status_code=404, detail="Account not found")

        chat_cfg = acc.get("chat_settings") or {}
        chat_model = chat_cfg.get("ai_model") or acc["ai_model"] or "gemini-2.5-flash"
        chat_enabled = chat_cfg.get("is_enabled", True) if acc["ai_enabled"] else False

        return {
            "enabled": bool(chat_enabled and acc["ai_encrypted_token"]),
            "configured": bool(acc["ai_encrypted_token"]),
            "model": chat_model,
        }

@router.post("/accounts/{account_id}/ai-chat")
@router.post("/accounts/{account_id}/ai/chat")
async def chat_ai(account_id: int, body: AiChatBody, user: dict = Depends(get_current_user)):
    check_account_access(user, account_id)
    with sync_engine.connect() as conn:
        acc = conn.execute(
            text("""
                SELECT ai_enabled, ai_model, ai_encrypted_token, ai_company_context, chat_settings, subdomain, base_domain
                FROM accounts WHERE id = :id
            """),
            {"id": account_id}
        ).mappings().first()
        if not acc:
            raise HTTPException(status_code=404, detail="Account not found")

        chat_cfg = acc.get("chat_settings") or {}
        chat_enabled = chat_cfg.get("is_enabled", True)
        if not acc["ai_enabled"] or not chat_enabled or not acc["ai_encrypted_token"]:
            raise HTTPException(status_code=400, detail="AI analyst is not enabled or API key is missing")

        api_key = decrypt_token(acc["ai_encrypted_token"])
        model_name = chat_cfg.get("ai_model") or acc["ai_model"] or "gemini-2.5-flash"
        clean_model = model_name.strip().removeprefix("models/")
        ai_context = acc["ai_company_context"] or ""
        custom_chat_prompt = chat_cfg.get("system_prompt")
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

            if "time_stages" in selected:
                filters_dict = body.filters or {}
                choice = body.stagePipelineChoice
                if str(choice) == "all":
                    all_stats = get_all_pipelines_stages_stats(
                        account_id=account_id,
                        tag_ids=filters_dict.get("tagIds", []),
                        status=filters_dict.get("status"),
                        manager_ids=filters_dict.get("managerIds", []),
                        date_from=filters_dict.get("dateFrom"),
                        date_to=filters_dict.get("dateTo"),
                        user=user,
                    )
                    bi_context += "\n[BOSQICHLAR VAQTI (BARCHA VORONKALAR)]:\n" if is_uz else "\n[ВРЕМЯ НА ЭТАПАХ (ВСЕ ВОРОНКИ)]:\n"
                    for p in all_stats.get("pipelines", []):
                        bi_context += (
                            f"\nVoronka: \"{p.get('pipelineName')}\" (O'tgan: {p.get('totalPassedLeads')}, Ishda: {p.get('totalActiveLeads')}):\n"
                            if is_uz
                            else f"\nВоронка: \"{p.get('pipelineName')}\" (Пройдено: {p.get('totalPassedLeads')}, В работе: {p.get('totalActiveLeads')}):\n"
                        )
                        for s in p.get("items", []):
                            if s.get("externalId") in ("142", "143"):
                                continue
                            dur = format_duration(s.get("avgSecondsActual"), body.lang or "ru")
                            bi_context += (
                                f"  - {s.get('name')}: {dur} (Ishda: {s.get('activeLeadsCount')}, O'tdi: {s.get('leadsCount')}, Sakrashlar: {s.get('skipsCount')})\n"
                                if is_uz
                                else f"  - {s.get('name')}: {dur} (В работе: {s.get('activeLeadsCount')}, Прошло: {s.get('leadsCount')}, Пропусков: {s.get('skipsCount')})\n"
                            )
                else:
                    target_pipe_id = None
                    try:
                        if choice is not None and str(choice).isdigit():
                            target_pipe_id = int(choice)
                    except (ValueError, TypeError):
                        pass

                    if not target_pipe_id and body.pipelineId:
                        target_pipe_id = body.pipelineId

                    if not target_pipe_id:
                        first_p = conn.execute(
                            text("SELECT id FROM pipelines WHERE account_id = :acc_id AND is_archived = false ORDER BY id ASC"),
                            {"acc_id": account_id}
                        ).mappings().first()
                        target_pipe_id = first_p["id"] if first_p else None

                    if target_pipe_id:
                        p_row = conn.execute(
                            text("SELECT name FROM pipelines WHERE id = :id AND account_id = :acc_id"),
                            {"id": target_pipe_id, "acc_id": account_id}
                        ).mappings().first()
                        pipe_name = p_row["name"] if p_row else f"ID {target_pipe_id}"

                        stats_res = get_stages_stats(
                            pipeline_id=target_pipe_id,
                            tag_ids=filters_dict.get("tagIds", []),
                            status=filters_dict.get("status"),
                            manager_ids=filters_dict.get("managerIds", []),
                            date_from=filters_dict.get("dateFrom"),
                            date_to=filters_dict.get("dateTo"),
                            user=user,
                        )
                        bi_context += (
                            f"\n[BOSQICHLAR VAQTI (VORONKA: \"{pipe_name}\")]:\n"
                            if is_uz
                            else f"\n[ВРЕМЯ НА ЭТАПАХ (ВОРОНКА: \"{pipe_name}\")]:\n"
                        )
                        won_st = stats_res.get("wonStats") or {}
                        lost_st = stats_res.get("lostStats") or {}
                        if won_st.get("total", 0) > 0:
                            bi_context += (
                                f"  * Yutilgan bitimlar o'rtacha sikli: {won_st.get('avgDays', 0):.1f} kun (Mediana: {won_st.get('medianDays', 0):.1f} kun)\n"
                                if is_uz
                                else f"  * Средний цикл успешных сделок: {won_st.get('avgDays', 0):.1f} дн. (Медиана: {won_st.get('medianDays', 0):.1f} дн.)\n"
                            )
                        if lost_st.get("total", 0) > 0:
                            bi_context += (
                                f"  * Rad etilguncha yashash muddati: {lost_st.get('avgDays', 0):.1f} kun\n"
                                if is_uz
                                else f"  * Средний срок жизни до отказа: {lost_st.get('avgDays', 0):.1f} дн.\n"
                            )

                        bi_context += "  * Bosqichlar vaqti va yuklama:\n" if is_uz else "  * Время и нагрузка по этапам:\n"
                        for s in stats_res.get("items", []):
                            if s.get("externalId") in ("142", "143"):
                                continue
                            dur = format_duration(s.get("avgSecondsActual"), body.lang or "ru")
                            bi_context += (
                                f"    - {s.get('name')}: {dur} (Ishda: {s.get('activeLeadsCount')}, O'tdi: {s.get('leadsCount')}, Sakrashlar: {s.get('skipsCount')})\n"
                                if is_uz
                                else f"    - {s.get('name')}: {dur} (В работе: {s.get('activeLeadsCount')}, Прошло: {s.get('leadsCount')}, Пропусков: {s.get('skipsCount')})\n"
                            )

            if "managers" in selected and isinstance(bi.get("managers"), list):
                bi_context += "\n[MENEJERLAR REYTINGI]:\n" if is_uz else "\n[РЕЙТИНГ МЕНЕДЖЕРОВ]:\n"
                for m in bi["managers"][:10]:
                    bi_context += f"  * {m.get('managerName')}: Won={m.get('wonLeads')}, WinRate={m.get('winRate')}%, Tushum={m.get('revenue')}\n"

            if "marketing" in selected and isinstance(bi.get("marketing"), dict):
                mkt = bi["marketing"]
                utm_list = mkt.get("utmSources") or []
                if utm_list:
                    bi_context += "\n[MANBALAR VA MARKETING]:\n" if is_uz else "\n[ИСТОЧНИКИ И МАРКЕТИНГ]:\n"
                    for u in utm_list[:8]:
                        bi_context += f"  * {u.get('source')}: Won={u.get('wonLeads')}, Jami={u.get('totalLeads')}, Tushum={u.get('revenue')}\n" if is_uz else f"  * {u.get('source')}: Won={u.get('wonLeads')}, Всего={u.get('totalLeads')}, Выручка={u.get('revenue')}\n"

            if "losses" in selected and isinstance(bi.get("lossesAndLtv"), dict):
                loss_reasons = bi["lossesAndLtv"].get("lossReasons") or []
                if loss_reasons:
                    bi_context += "\n[RAD ETILISH SABABLARI]:\n" if is_uz else "\n[ПРИЧИНЫ ОТКАЗА]:\n"
                    for lr in loss_reasons[:8]:
                        bi_context += f"  * {lr.get('reason')}: {lr.get('count')} ta ({lr.get('share')}%), Yo'qotildi={lr.get('droppedValue')}\n" if is_uz else f"  * {lr.get('reason')}: {lr.get('count')} сд. ({lr.get('share')}%), Потери={lr.get('droppedValue')}\n"

            if "risk_deals" in selected and isinstance(bi.get("lossesAndLtv"), dict):
                risk_list = bi["lossesAndLtv"].get("riskDeals") or []
                if risk_list:
                    bi_context += "\n[XAVF ZONASIDAGI BITIMLAR (TOP-10)]:\n" if is_uz else "\n[СДЕЛКИ В ЗОНЕ РИСКА (ТОП-10)]:\n"
                    for rd in risk_list[:10]:
                        bi_context += f"  * {rd.get('name')}: Byudjet={rd.get('price')}, Bosqich={rd.get('stageName')}, Mas'ul={rd.get('managerName')}, Harakatsiz={rd.get('idleDays')} kun, Xavf={rd.get('riskType')}\n" if is_uz else f"  * {rd.get('name')}: Бюджет={rd.get('price')}, Этап={rd.get('stageName')}, Ответственный={rd.get('managerName')}, Без движения={rd.get('idleDays')} дн., Риск={rd.get('riskType')}\n"

            sys_instruction = (
                f"Sen — amoCRM bo'yicha yetakchi Biznes-Tahlilchi (BI Analyst)san.\n"
                f"{f'=== KOMPANIYA ===\n{ai_context}\n\n' if ai_context else ''}"
                f"{bi_context}\n\n"
                "Qoidalar:\n1. O'zbek tilida (lotin) javob ber.\n2. Ma'lumot so'rama, barcha raqamlar yuqorida keltirilgan.\n3. ROP uchun 3-4 ta aniq tavsiya ber.\n4. Raqamlarni va bosqichlarni **qalin** qilib ko'rsat."
            ) if is_uz else (
                f"Ты — ведущий Бизнес-Аналитик (BI Analyst) и эксперт amoCRM.\n"
                f"{f'=== О КОМПАНИИ ===\n{ai_context}\n\n' if ai_context else ''}"
                f"{bi_context}\n\n"
                "Правила:\n1. Отвечай на русском языке.\n2. Не проси данных — все цифры перед тобой.\n3. Дай 3-4 конкретные рекомендации РОПу.\n4. Выделяй важные цифры и этапы **жирным**."
            )

            if custom_chat_prompt:
                sys_instruction = f"{custom_chat_prompt.strip()}\n\n" + sys_instruction

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

        if custom_chat_prompt:
            sys_instruction = f"{custom_chat_prompt.strip()}\n\n" + sys_instruction

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


@router.get("/forecasts/{account_id}")
def get_forecasts(
    account_id: int,
    pipeline_id: Optional[int] = Query(default=None),
    period: Optional[str] = Query(default="month"),
    user: dict = Depends(get_current_user),
):
    check_account_access(user, account_id)
    with sync_engine.connect() as conn:
        pipe_where = "AND pipeline_id = :p_id" if pipeline_id else ""
        params: dict[str, Any] = {"acc_id": account_id}
        if pipeline_id:
            params["p_id"] = pipeline_id

        # Stats on closed leads
        closed_stats = conn.execute(
            text(f"""
                SELECT 
                    COUNT(*) FILTER (WHERE status = 'won')::int AS won_cnt,
                    COUNT(*) FILTER (WHERE status = 'lost')::int AS lost_cnt,
                    COALESCE(SUM(price) FILTER (WHERE status = 'won'), 0)::float AS won_sum,
                    COALESCE(AVG(price) FILTER (WHERE status = 'won'), 0)::float AS avg_check,
                    COALESCE(SUM(price) FILTER (WHERE status = 'open'), 0)::float AS open_sum,
                    COUNT(*) FILTER (WHERE status = 'open')::int AS open_cnt
                FROM leads
                WHERE account_id = :acc_id AND status <> 'gone' {pipe_where}
            """),
            params
        ).mappings().first()

        won_cnt = closed_stats["won_cnt"] if closed_stats else 0
        lost_cnt = closed_stats["lost_cnt"] if closed_stats else 0
        total_closed = won_cnt + lost_cnt
        win_rate = (won_cnt / total_closed) if total_closed > 0 else 0.3
        open_sum = closed_stats["open_sum"] if closed_stats else 0.0
        avg_check = closed_stats["avg_check"] if closed_stats else 0.0
        predicted_won_leads = int(round((closed_stats["open_cnt"] if closed_stats else 0) * win_rate))
        predicted_revenue = round(open_sum * win_rate, 2)

        return {
            "accountId": account_id,
            "period": period,
            "pipelineId": pipeline_id,
            "historicalWinRate": round(win_rate * 100, 1),
            "openPipelineValue": open_sum,
            "predictedRevenue": predicted_revenue,
            "predictedWonLeads": predicted_won_leads,
            "avgCheck": round(avg_check, 2),
            "confidenceScore": 85 if total_closed > 50 else 60,
        }


@router.get("/churn-risk/{account_id}")
def get_churn_risk(account_id: int, user: dict = Depends(get_current_user)):
    check_account_access(user, account_id)
    with sync_engine.connect() as conn:
        risky_leads = conn.execute(
            text("""
                SELECT 
                    l.id, l.external_id AS "externalId", l.name, l.price::float,
                    l.crm_created_at AS "createdAt",
                    au.name AS "managerName"
                FROM leads l
                LEFT JOIN amo_users au ON au.id = l.responsible_user_id
                WHERE l.account_id = :acc_id 
                  AND l.status = 'open'
                  AND l.crm_created_at < (NOW() - INTERVAL '14 days')
                ORDER BY l.price DESC NULLS LAST
                LIMIT 20
            """),
            {"acc_id": account_id}
        ).mappings().all()

        return {
            "accountId": account_id,
            "riskCount": len(risky_leads),
            "highRiskLeads": [dict(r) for r in risky_leads],
        }

