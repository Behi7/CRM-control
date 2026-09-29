import os
import json
import base64
from datetime import datetime, timezone
from typing import Optional
import jwt
import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import FastAPI, Depends, HTTPException, Header, Query, BackgroundTasks
from sqlalchemy import create_engine, text

app = FastAPI(title="AmoCRM Analytics - Module 02 (Python Deep BI)")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/amocrm_analytics")
JWT_ACCESS_SECRET = os.getenv("JWT_ACCESS_SECRET", "")
TOKEN_ENCRYPTION_KEY = os.getenv("TOKEN_ENCRYPTION_KEY", "")

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)


def decrypt_amo_token(encrypted_json: str) -> str:
    """Расшифровка 5-летнего токена AmoCRM (AES-256-GCM) из таблицы accounts."""
    if not encrypted_json or not TOKEN_ENCRYPTION_KEY:
        raise ValueError("Missing encrypted token or TOKEN_ENCRYPTION_KEY")
    obj = json.loads(encrypted_json)
    nonce = base64.b64decode(obj["nonce"])
    ciphertext = base64.b64decode(obj["ciphertext"])
    auth_tag = base64.b64decode(obj["authTag"])
    aesgcm = AESGCM(TOKEN_ENCRYPTION_KEY.encode("utf-8"))
    plaintext = aesgcm.decrypt(nonce, ciphertext + auth_tag, None)
    return plaintext.decode("utf-8")


def get_current_user(authorization: str | None = Header(default=None)):
    """Проверка общего JWT-токена от ядра (01_time_analytics)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, JWT_ACCESS_SECRET, algorithms=["HS256"])
        return payload  # содержит sub (userId), role ('admin'|'viewer'), accountId
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def check_account_access(user: dict, account_id: int):
    if user.get("role") != "admin" and user.get("accountId") != account_id:
        raise HTTPException(status_code=403, detail="Access denied to this account")


@app.get("/health")
def health():
    return {"status": "ok", "module": "02_python_analytics"}


@app.get("/accounts")
def list_accounts_bi(user: dict = Depends(get_current_user)):
    """Список аккаунтов со статистикой обогащения БД (для левого меню и шапки Модуля 02)."""
    role = user.get("role")
    user_acc_id = user.get("accountId")

    where_clause = ""
    params = {}
    if role != "admin":
        where_clause = "WHERE a.id = :acc_id"
        params["acc_id"] = user_acc_id

    sql = text(f"""
        SELECT
            a.id,
            a.subdomain,
            a.base_domain AS "baseDomain",
            a.timezone,
            a.status,
            a.sync_status AS "syncStatus",
            a.last_synced_at AS "lastSyncedAt",
            COUNT(l.id) AS "totalLeads",
            COUNT(l.custom_fields) AS "enrichedLeads",
            COUNT(l.main_contact_id) AS "withContacts",
            COUNT(l.utm_source) AS "withUtm",
            COUNT(l.loss_reason_name) AS "withLossReason"
        FROM accounts a
        LEFT JOIN leads l ON l.account_id = a.id
        {where_clause}
        GROUP BY a.id
        ORDER BY a.id ASC
    """)
    with engine.connect() as conn:
        rows = conn.execute(sql, params).mappings().all()
        return [dict(r) for r in rows]


def _run_python_enrichment(account_id: int):
    """Фоновая дозагрузка (обогащение) сделок аккаунта напрямую через 5-летний токен."""
    with engine.connect() as conn:
        acc = conn.execute(
            text("SELECT id, subdomain, base_domain, encrypted_token FROM accounts WHERE id = :id"),
            {"id": account_id},
        ).mappings().first()
        if not acc or not acc["encrypted_token"]:
            return

    try:
        token = decrypt_amo_token(acc["encrypted_token"])
    except Exception as e:
        print(f"[Enrich] Failed to decrypt token for account {account_id}: {e}")
        return

    base_url = f"https://{acc['subdomain']}.{acc['base_domain']}"
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Загрузим справочник причин отказа (/api/v4/leads/loss_reasons)
    loss_reasons_map: dict[str, str] = {}
    try:
        with httpx.Client(timeout=30.0) as client:
            lr_resp = client.get(f"{base_url}/api/v4/leads/loss_reasons", headers=headers)
            if lr_resp.status_code == 200:
                items = lr_resp.json().get("_embedded", {}).get("loss_reasons", [])
                for item in items:
                    loss_reasons_map[str(item.get("id"))] = item.get("name", "")
    except Exception as e:
        print(f"[Enrich] Could not fetch loss_reasons dictionary: {e}")

    # 2. Проходим по сделкам и обогащаем поля
    page = 1
    with httpx.Client(timeout=30.0) as client:
        while True:
            try:
                resp = client.get(
                    f"{base_url}/api/v4/leads",
                    headers=headers,
                    params={"page": page, "limit": 250, "with": "tags,contacts,loss_reason"},
                )
                if resp.status_code not in (200, 204):
                    break
                if resp.status_code == 204:
                    break
                leads = resp.json().get("_embedded", {}).get("leads", [])
                if not leads:
                    break

                batch_updates = []
                for amo in leads:
                    ext_id = str(amo.get("id"))
                    loss_id = str(amo["loss_reason_id"]) if amo.get("loss_reason_id") else None
                    emb_loss = amo.get("_embedded", {}).get("loss_reason")
                    loss_name = None
                    if isinstance(emb_loss, list) and len(emb_loss) > 0:
                        loss_name = emb_loss[0].get("name")
                    elif isinstance(emb_loss, dict):
                        loss_name = emb_loss.get("name")
                    if not loss_name and loss_id and loss_id in loss_reasons_map:
                        loss_name = loss_reasons_map[loss_id]

                    contacts = amo.get("_embedded", {}).get("contacts") or []
                    main_c = next((c for c in contacts if c.get("is_main")), contacts[0] if contacts else None)
                    main_contact_id = str(main_c["id"]) if main_c and main_c.get("id") else None

                    closest_task = amo.get("closest_task_at")
                    closest_task_dt = (
                        datetime.fromtimestamp(int(closest_task), tz=timezone.utc)
                        if closest_task and int(closest_task) > 0
                        else None
                    )

                    cfs = amo.get("custom_fields_values") or []
                    clean_cfs = []
                    utm_source = utm_medium = utm_campaign = utm_content = utm_term = None

                    for cf in cfs:
                        f_name = cf.get("field_name") or ""
                        f_code = cf.get("field_code") or ""
                        vals = [v.get("value") for v in (cf.get("values") or []) if v.get("value") is not None]
                        if vals:
                            clean_cfs.append({
                                "id": cf.get("field_id"),
                                "name": f_name,
                                "code": f_code,
                                "values": vals,
                            })
                            key = (f_code or f_name).strip().upper()
                            v_str = str(vals[0]).strip()
                            if key in ("UTM_SOURCE", "ИСТОЧНИК", "SOURCE"):
                                utm_source = utm_source or v_str
                            elif key == "UTM_MEDIUM":
                                utm_medium = utm_medium or v_str
                            elif key == "UTM_CAMPAIGN":
                                utm_campaign = utm_campaign or v_str
                            elif key == "UTM_CONTENT":
                                utm_content = utm_content or v_str
                            elif key == "UTM_TERM":
                                utm_term = utm_term or v_str

                    batch_updates.append({
                        "acc_id": account_id,
                        "ext_id": ext_id,
                        "loss_id": loss_id,
                        "loss_name": loss_name,
                        "contact_id": main_contact_id,
                        "task_at": closest_task_dt,
                        "cfs": json.dumps(clean_cfs, ensure_ascii=False) if clean_cfs else None,
                        "utm_source": utm_source,
                        "utm_medium": utm_medium,
                        "utm_campaign": utm_campaign,
                        "utm_content": utm_content,
                        "utm_term": utm_term,
                    })

                if batch_updates:
                    with engine.begin() as conn:
                        conn.execute(
                            text("""
                                UPDATE leads
                                SET
                                    loss_reason_id = COALESCE(:loss_id, loss_reason_id),
                                    loss_reason_name = COALESCE(:loss_name, loss_reason_name),
                                    main_contact_id = COALESCE(:contact_id, main_contact_id),
                                    closest_task_at = :task_at,
                                    custom_fields = COALESCE(CAST(:cfs AS jsonb), custom_fields),
                                    utm_source = COALESCE(:utm_source, utm_source),
                                    utm_medium = COALESCE(:utm_medium, utm_medium),
                                    utm_campaign = COALESCE(:utm_campaign, utm_campaign),
                                    utm_content = COALESCE(:utm_content, utm_content),
                                    utm_term = COALESCE(:utm_term, utm_term)
                                WHERE account_id = :acc_id AND external_id = :ext_id
                            """),
                            batch_updates,
                        )

                if len(leads) < 250:
                    break
                page += 1
            except Exception as e:
                print(f"[Enrich] Error on page {page} for account {account_id}: {e}")
                break


@app.post("/analytics/{account_id}/enrich")
def trigger_account_enrichment(
    account_id: int,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    """Запускает фоновое обогащение сделок аккаунта через 5-летний токен AmoCRM."""
    check_account_access(user, account_id)
    background_tasks.add_task(_run_python_enrichment, account_id)
    return {"ok": True, "message": "Обогащение данных из AmoCRM запущено в фоне"}


@app.get("/analytics/{account_id}")
def get_detailed_analytics(
    account_id: int,
    pipeline_id: Optional[int] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    manager_ids: Optional[str] = Query(default=None),
    tag_ids: Optional[str] = Query(default=None),
    user: dict = Depends(get_current_user),
):
    """Глубокая BI-аналитика AmoCRM по аккаунту."""
    check_account_access(user, account_id)

    with engine.connect() as conn:
        account = conn.execute(
            text("""
                SELECT id, subdomain, base_domain AS "baseDomain", timezone, status,
                       sync_status AS "syncStatus", last_synced_at AS "lastSyncedAt"
                FROM accounts WHERE id = :acc_id
            """),
            {"acc_id": account_id},
        ).mappings().first()

        if not account:
            raise HTTPException(status_code=404, detail="Account not found")

        # Справочники фильтров
        pipelines = [
            dict(r)
            for r in conn.execute(
                text("SELECT id, name, external_id AS \"externalId\" FROM pipelines WHERE account_id = :acc_id AND is_archived = false ORDER BY id ASC"),
                {"acc_id": account_id},
            ).mappings().all()
        ]
        managers_list = [
            dict(r)
            for r in conn.execute(
                text("SELECT id, name, email FROM amo_users WHERE account_id = :acc_id AND is_archived = false ORDER BY name ASC"),
                {"acc_id": account_id},
            ).mappings().all()
        ]
        tags_list = [
            dict(r)
            for r in conn.execute(
                text("SELECT id, name FROM tags WHERE account_id = :acc_id AND is_archived = false ORDER BY name ASC"),
                {"acc_id": account_id},
            ).mappings().all()
        ]

        # Формируем условия фильтрации
        conditions = ["l.account_id = :acc_id"]
        params: dict = {"acc_id": account_id}

        if pipeline_id:
            conditions.append("l.pipeline_id = :pipeline_id")
            params["pipeline_id"] = pipeline_id

        if date_from:
            conditions.append("l.crm_created_at >= CAST(:date_from AS timestamptz)")
            params["date_from"] = f"{date_from}T00:00:00Z"

        if date_to:
            conditions.append("l.crm_created_at <= CAST(:date_to AS timestamptz)")
            params["date_to"] = f"{date_to}T23:59:59Z"

        if manager_ids:
            m_ids = [int(x) for x in manager_ids.split(",") if x.strip().isdigit()]
            if m_ids:
                conditions.append("l.responsible_user_id = ANY(:m_ids)")
                params["m_ids"] = m_ids

        if tag_ids:
            t_ids = [int(x) for x in tag_ids.split(",") if x.strip().isdigit()]
            if t_ids:
                conditions.append(
                    "EXISTS (SELECT 1 FROM lead_tags lt WHERE lt.lead_id = l.id AND lt.tag_id = ANY(:t_ids))"
                )
                params["t_ids"] = t_ids

        where_sql = " AND ".join(conditions)

        # 1. Сводные KPI
        kpi_row = conn.execute(
            text(f"""
                SELECT
                    COUNT(*) AS total_leads,
                    COUNT(*) FILTER (WHERE l.status = 'won') AS won_leads,
                    COUNT(*) FILTER (WHERE l.status = 'lost') AS lost_leads,
                    COUNT(*) FILTER (WHERE l.status = 'open') AS open_leads,
                    COALESCE(SUM(l.price) FILTER (WHERE l.status = 'won'), 0) AS total_revenue,
                    COALESCE(SUM(l.price) FILTER (WHERE l.status = 'open'), 0) AS open_pipeline_value,
                    COALESCE(SUM(l.price) FILTER (WHERE l.status = 'lost'), 0) AS lost_revenue,
                    COALESCE(AVG(l.price) FILTER (WHERE l.status = 'won' AND l.price > 0), 0) AS avg_check,
                    COALESCE(
                        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.price)
                        FILTER (WHERE l.status = 'won' AND l.price > 0),
                        0
                    ) AS median_check,
                    COALESCE(
                        AVG(EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0)
                        FILTER (WHERE l.status = 'won' AND l.crm_closed_at IS NOT NULL AND l.crm_closed_at >= l.crm_created_at),
                        0
                    ) AS avg_cycle_days,
                    COALESCE(
                        AVG(EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0)
                        FILTER (WHERE l.status = 'lost' AND l.crm_closed_at IS NOT NULL AND l.crm_closed_at >= l.crm_created_at),
                        0
                    ) AS avg_loss_days,
                    COUNT(*) FILTER (WHERE l.status = 'open' AND l.closest_task_at IS NOT NULL AND l.closest_task_at < NOW()) AS overdue_tasks_leads,
                    COUNT(*) FILTER (WHERE l.status = 'open' AND l.closest_task_at IS NULL) AS no_task_leads,
                    COUNT(l.custom_fields) AS enriched_count,
                    COUNT(DISTINCT l.main_contact_id) AS unique_contacts
                FROM leads l
                WHERE {where_sql}
            """),
            params,
        ).mappings().first()

        total_leads = int(kpi_row["total_leads"] or 0)
        won_leads = int(kpi_row["won_leads"] or 0)
        lost_leads = int(kpi_row["lost_leads"] or 0)
        open_leads = int(kpi_row["open_leads"] or 0)
        closed_total = won_leads + lost_leads

        kpis = {
            "totalLeads": total_leads,
            "wonLeads": won_leads,
            "lostLeads": lost_leads,
            "openLeads": open_leads,
            "totalRevenue": float(kpi_row["total_revenue"] or 0),
            "openPipelineValue": float(kpi_row["open_pipeline_value"] or 0),
            "lostRevenue": float(kpi_row["lost_revenue"] or 0),
            "avgCheck": round(float(kpi_row["avg_check"] or 0), 2),
            "medianCheck": round(float(kpi_row["median_check"] or 0), 2),
            "winRateTotal": round((won_leads / total_leads * 100), 1) if total_leads > 0 else 0.0,
            "winRateClosed": round((won_leads / closed_total * 100), 1) if closed_total > 0 else 0.0,
            "avgCycleDays": round(float(kpi_row["avg_cycle_days"] or 0), 1),
            "avgLossDays": round(float(kpi_row["avg_loss_days"] or 0), 1),
            "overdueTasksLeads": int(kpi_row["overdue_tasks_leads"] or 0),
            "noTaskLeads": int(kpi_row["no_task_leads"] or 0),
            "enrichedCount": int(kpi_row["enriched_count"] or 0),
            "uniqueContacts": int(kpi_row["unique_contacts"] or 0),
        }

        # 2. Динамика по времени (по месяцам или неделям в зависимости от диапазона)
        timeseries_rows = conn.execute(
            text(f"""
                SELECT
                    TO_CHAR(DATE_TRUNC('month', l.crm_created_at), 'YYYY-MM') AS period,
                    COUNT(*) AS "totalLeads",
                    COUNT(*) FILTER (WHERE l.status = 'won') AS "wonLeads",
                    COUNT(*) FILTER (WHERE l.status = 'lost') AS "lostLeads",
                    COUNT(*) FILTER (WHERE l.status = 'open') AS "openLeads",
                    COALESCE(SUM(l.price) FILTER (WHERE l.status = 'won'), 0) AS revenue,
                    COALESCE(SUM(l.price), 0) AS "pipelineValue"
                FROM leads l
                WHERE {where_sql}
                GROUP BY 1
                ORDER BY 1 ASC
                LIMIT 36
            """),
            params,
        ).mappings().all()

        timeseries = [
            {
                "period": r["period"],
                "totalLeads": int(r["totalLeads"]),
                "wonLeads": int(r["wonLeads"]),
                "lostLeads": int(r["lostLeads"]),
                "openLeads": int(r["openLeads"]),
                "revenue": float(r["revenue"]),
                "pipelineValue": float(r["pipelineValue"]),
            }
            for r in timeseries_rows
        ]

        # 3. Глубокая воронка продаж + утечки денег по этапам
        effective_pipeline_id = pipeline_id or (pipelines[0]["id"] if pipelines else None)
        funnel = []
        if effective_pipeline_id:
            funnel_params = {**params, "eff_pipe_id": effective_pipeline_id}
            # Для каждого этапа считаем:
            # - сколько сделок из выборки побывало на этапе (через lead_stage_history или current_stage_id)
            # - сколько сейчас открыто на этапе
            # - сколько сделок ушло в lost, когда этот этап был последним в lead_stage_history
            funnel_rows = conn.execute(
                text(f"""
                    WITH filtered_leads AS (
                        SELECT l.*
                        FROM leads l
                        WHERE {where_sql} AND l.pipeline_id = :eff_pipe_id
                    ),
                    last_stage_per_lead AS (
                        SELECT DISTINCT ON (h.lead_id)
                            h.lead_id,
                            h.stage_id
                        FROM lead_stage_history h
                        JOIN filtered_leads fl ON fl.id = h.lead_id
                        ORDER BY h.lead_id, h.entered_at DESC, h.id DESC
                    ),
                    stage_touch AS (
                        SELECT
                            s.id AS stage_id,
                            COUNT(DISTINCT fl.id) AS reached_leads,
                            COALESCE(SUM(DISTINCT fl.price), 0) AS reached_value,
                            COALESCE(AVG(h.duration_seconds) / 3600.0, 0) AS avg_hours
                        FROM stages s
                        LEFT JOIN lead_stage_history h ON h.stage_id = s.id
                        LEFT JOIN filtered_leads fl ON fl.id = h.lead_id OR fl.current_stage_id = s.id
                        WHERE s.pipeline_id = :eff_pipe_id AND s.is_archived = false
                        GROUP BY s.id
                    )
                    SELECT
                        s.id AS "stageId",
                        s.name AS "stageName",
                        COALESCE(s.sort_order, 0) AS "sortOrder",
                        COALESCE(st.reached_leads, 0) AS "reachedLeads",
                        COALESCE(st.reached_value, 0) AS "reachedValue",
                        COALESCE(st.avg_hours, 0) AS "avgStageHours",
                        COUNT(DISTINCT fl_open.id) AS "currentOpenLeads",
                        COALESCE(SUM(fl_open.price), 0) AS "currentOpenValue",
                        COUNT(DISTINCT fl_lost.id) AS "lostAtStageLeads",
                        COALESCE(SUM(fl_lost.price), 0) AS "lostAtStageValue"
                    FROM stages s
                    LEFT JOIN stage_touch st ON st.stage_id = s.id
                    LEFT JOIN filtered_leads fl_open ON fl_open.current_stage_id = s.id AND fl_open.status = 'open'
                    LEFT JOIN last_stage_per_lead lsp ON lsp.stage_id = s.id
                    LEFT JOIN filtered_leads fl_lost ON fl_lost.id = lsp.lead_id AND fl_lost.status = 'lost'
                    WHERE s.pipeline_id = :eff_pipe_id AND s.is_archived = false
                      AND s.external_id NOT IN ('142', '143')
                    GROUP BY s.id, s.name, s.sort_order, st.reached_leads, st.reached_value, st.avg_hours
                    ORDER BY COALESCE(s.sort_order, 0) ASC, s.id ASC
                """),
                funnel_params,
            ).mappings().all()

            max_reached = max([int(r["reachedLeads"] or 0) for r in funnel_rows], default=0)
            prev_reached = max_reached
            for idx, r in enumerate(funnel_rows):
                reached = int(r["reachedLeads"] or 0)
                conv_start = round((reached / max_reached * 100), 1) if max_reached > 0 else 0.0
                conv_prev = round((reached / prev_reached * 100), 1) if (idx > 0 and prev_reached > 0) else 100.0
                if reached > 0:
                    prev_reached = reached
                funnel.append({
                    "stageId": r["stageId"],
                    "stageName": r["stageName"],
                    "sortOrder": int(r["sortOrder"] or 0),
                    "reachedLeads": reached,
                    "reachedValue": float(r["reachedValue"] or 0),
                    "currentOpenLeads": int(r["currentOpenLeads"] or 0),
                    "currentOpenValue": float(r["currentOpenValue"] or 0),
                    "lostAtStageLeads": int(r["lostAtStageLeads"] or 0),
                    "lostAtStageValue": float(r["lostAtStageValue"] or 0),
                    "avgStageHours": round(float(r["avgStageHours"] or 0), 1),
                    "conversionFromStart": conv_start,
                    "conversionFromPrev": min(conv_prev, 100.0),
                })

        # 4. Рейтинг и дисциплина менеджеров
        manager_rows = conn.execute(
            text(f"""
                SELECT
                    COALESCE(u.id, 0) AS "managerId",
                    COALESCE(u.name, 'Без ответственного') AS "managerName",
                    COUNT(l.id) AS "totalLeads",
                    COUNT(l.id) FILTER (WHERE l.status = 'won') AS "wonLeads",
                    COUNT(l.id) FILTER (WHERE l.status = 'lost') AS "lostLeads",
                    COUNT(l.id) FILTER (WHERE l.status = 'open') AS "openLeads",
                    COALESCE(SUM(l.price) FILTER (WHERE l.status = 'won'), 0) AS revenue,
                    COALESCE(SUM(l.price) FILTER (WHERE l.status = 'open'), 0) AS "openValue",
                    COALESCE(SUM(l.price) FILTER (WHERE l.status = 'lost'), 0) AS "lostValue",
                    COALESCE(AVG(l.price) FILTER (WHERE l.status = 'won' AND l.price > 0), 0) AS "avgCheck",
                    COALESCE(
                        AVG(EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0)
                        FILTER (WHERE l.status = 'won' AND l.crm_closed_at IS NOT NULL AND l.crm_closed_at >= l.crm_created_at),
                        0
                    ) AS "avgCycleDays",
                    COUNT(l.id) FILTER (WHERE l.status = 'open' AND l.closest_task_at IS NOT NULL AND l.closest_task_at < NOW()) AS "overdueTasksLeads",
                    COUNT(l.id) FILTER (WHERE l.status = 'open' AND l.closest_task_at IS NULL) AS "noTaskLeads",
                    (
                        SELECT COUNT(*)
                        FROM lead_stage_skips sk
                        WHERE sk.lead_id = ANY(ARRAY_AGG(l.id))
                    ) AS "stageSkipsCount"
                FROM leads l
                LEFT JOIN amo_users u ON u.id = l.responsible_user_id
                WHERE {where_sql}
                GROUP BY u.id, u.name
                ORDER BY revenue DESC, "wonLeads" DESC, "totalLeads" DESC
            """),
            params,
        ).mappings().all()

        managers = []
        for r in manager_rows:
            tot = int(r["totalLeads"] or 0)
            won = int(r["wonLeads"] or 0)
            lost = int(r["lostLeads"] or 0)
            closed = won + lost
            managers.append({
                "managerId": r["managerId"],
                "managerName": r["managerName"],
                "totalLeads": tot,
                "wonLeads": won,
                "lostLeads": lost,
                "openLeads": int(r["openLeads"] or 0),
                "revenue": float(r["revenue"] or 0),
                "openValue": float(r["openValue"] or 0),
                "lostValue": float(r["lostValue"] or 0),
                "avgCheck": round(float(r["avgCheck"] or 0), 2),
                "winRate": round((won / closed * 100), 1) if closed > 0 else 0.0,
                "avgCycleDays": round(float(r["avgCycleDays"] or 0), 1),
                "overdueTasksLeads": int(r["overdueTasksLeads"] or 0),
                "noTaskLeads": int(r["noTaskLeads"] or 0),
                "stageSkipsCount": int(r["stageSkipsCount"] or 0),
            })

        # 5. Маркетинг, UTM-источники, Теги и Кастомные поля
        utm_rows = conn.execute(
            text(f"""
                SELECT
                    COALESCE(NULLIF(TRIM(l.utm_source), ''), 'Прямой / Не указан') AS source,
                    COUNT(*) AS "totalLeads",
                    COUNT(*) FILTER (WHERE l.status = 'won') AS "wonLeads",
                    COUNT(*) FILTER (WHERE l.status = 'lost') AS "lostLeads",
                    COUNT(*) FILTER (WHERE l.status = 'open') AS "openLeads",
                    COALESCE(SUM(l.price) FILTER (WHERE l.status = 'won'), 0) AS revenue,
                    COALESCE(AVG(l.price) FILTER (WHERE l.status = 'won' AND l.price > 0), 0) AS "avgCheck"
                FROM leads l
                WHERE {where_sql}
                GROUP BY 1
                ORDER BY "totalLeads" DESC, revenue DESC
                LIMIT 20
            """),
            params,
        ).mappings().all()

        utm_sources = [
            {
                "source": r["source"],
                "totalLeads": int(r["totalLeads"]),
                "wonLeads": int(r["wonLeads"]),
                "lostLeads": int(r["lostLeads"]),
                "openLeads": int(r["openLeads"]),
                "winRate": round(int(r["wonLeads"]) / int(r["totalLeads"]) * 100, 1) if int(r["totalLeads"]) > 0 else 0.0,
                "revenue": float(r["revenue"] or 0),
                "avgCheck": round(float(r["avgCheck"] or 0), 2),
            }
            for r in utm_rows
        ]

        tag_rows = conn.execute(
            text(f"""
                SELECT
                    t.id AS "tagId",
                    t.name AS "tagName",
                    COUNT(l.id) AS "totalLeads",
                    COUNT(l.id) FILTER (WHERE l.status = 'won') AS "wonLeads",
                    COUNT(l.id) FILTER (WHERE l.status = 'lost') AS "lostLeads",
                    COALESCE(SUM(l.price) FILTER (WHERE l.status = 'won'), 0) AS revenue,
                    COALESCE(AVG(l.price) FILTER (WHERE l.status = 'won' AND l.price > 0), 0) AS "avgCheck"
                FROM lead_tags lt
                JOIN tags t ON t.id = lt.tag_id
                JOIN leads l ON l.id = lt.lead_id
                WHERE {where_sql}
                GROUP BY t.id, t.name
                ORDER BY "totalLeads" DESC, revenue DESC
                LIMIT 25
            """),
            params,
        ).mappings().all()

        tags_breakdown = [
            {
                "tagId": r["tagId"],
                "tagName": r["tagName"],
                "totalLeads": int(r["totalLeads"]),
                "wonLeads": int(r["wonLeads"]),
                "lostLeads": int(r["lostLeads"]),
                "winRate": round(int(r["wonLeads"]) / int(r["totalLeads"]) * 100, 1) if int(r["totalLeads"]) > 0 else 0.0,
                "revenue": float(r["revenue"] or 0),
                "avgCheck": round(float(r["avgCheck"] or 0), 2),
            }
            for r in tag_rows
        ]

        # Кастомные поля (JSONB распаковка топ-полей бизнеса)
        cf_rows = conn.execute(
            text(f"""
                SELECT
                    cf->>'name' AS field_name,
                    COALESCE(cf->'values'->>0, '') AS field_value,
                    COUNT(DISTINCT l.id) AS "totalLeads",
                    COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'won') AS "wonLeads",
                    COALESCE(SUM(l.price) FILTER (WHERE l.status = 'won'), 0) AS revenue
                FROM leads l,
                LATERAL jsonb_array_elements(
                    CASE WHEN jsonb_typeof(l.custom_fields) = 'array' THEN l.custom_fields ELSE '[]'::jsonb END
                ) AS cf
                WHERE {where_sql}
                  AND cf->>'name' IS NOT NULL
                  AND COALESCE(cf->'values'->>0, '') <> ''
                GROUP BY 1, 2
                ORDER BY "totalLeads" DESC
                LIMIT 40
            """),
            params,
        ).mappings().all()

        custom_fields_breakdown = [
            {
                "fieldName": r["field_name"],
                "fieldValue": r["field_value"],
                "totalLeads": int(r["totalLeads"]),
                "wonLeads": int(r["wonLeads"]),
                "winRate": round(int(r["wonLeads"]) / int(r["totalLeads"]) * 100, 1) if int(r["totalLeads"]) > 0 else 0.0,
                "revenue": float(r["revenue"] or 0),
            }
            for r in cf_rows
        ]

        # 6. Причины отказа, Повторные продажи (LTV) и проблемные сделки
        loss_rows = conn.execute(
            text(f"""
                SELECT
                    COALESCE(NULLIF(TRIM(l.loss_reason_name), ''), 'Причина не указана в CRM') AS reason,
                    COUNT(*) AS "lostLeads",
                    COALESCE(SUM(l.price), 0) AS "lostValue"
                FROM leads l
                WHERE {where_sql} AND l.status = 'lost'
                GROUP BY 1
                ORDER BY "lostLeads" DESC, "lostValue" DESC
                LIMIT 20
            """),
            params,
        ).mappings().all()

        loss_reasons = [
            {
                "reason": r["reason"],
                "lostLeads": int(r["lostLeads"]),
                "lostValue": float(r["lostValue"] or 0),
                "sharePercent": round(int(r["lostLeads"]) / lost_leads * 100, 1) if lost_leads > 0 else 0.0,
            }
            for r in loss_rows
        ]

        # LTV и повторные продажи по main_contact_id
        ltv_stats = conn.execute(
            text(f"""
                WITH contact_agg AS (
                    SELECT
                        l.main_contact_id AS contact_id,
                        COUNT(*) AS deals_count,
                        COUNT(*) FILTER (WHERE l.status = 'won') AS won_count,
                        COALESCE(SUM(l.price) FILTER (WHERE l.status = 'won'), 0) AS total_spent,
                        MIN(l.crm_created_at) AS first_deal_at,
                        MAX(l.crm_created_at) AS last_deal_at
                    FROM leads l
                    WHERE {where_sql} AND l.main_contact_id IS NOT NULL
                    GROUP BY l.main_contact_id
                )
                SELECT
                    COUNT(*) AS unique_contacts,
                    COUNT(*) FILTER (WHERE deals_count >= 2) AS repeat_contacts,
                    COUNT(*) FILTER (WHERE won_count >= 2) AS repeat_buyers,
                    COALESCE(AVG(total_spent) FILTER (WHERE won_count >= 1), 0) AS avg_ltv,
                    COALESCE(SUM(total_spent) FILTER (WHERE deals_count >= 2), 0) AS repeat_revenue
                FROM contact_agg
            """),
            params,
        ).mappings().first()

        unique_c = int(ltv_stats["unique_contacts"] or 0) if ltv_stats else 0
        repeat_c = int(ltv_stats["repeat_contacts"] or 0) if ltv_stats else 0

        top_clients_rows = conn.execute(
            text(f"""
                SELECT
                    l.main_contact_id AS "contactId",
                    MAX(l.name) AS "sampleLeadName",
                    COUNT(*) AS "totalDeals",
                    COUNT(*) FILTER (WHERE l.status = 'won') AS "wonDeals",
                    COALESCE(SUM(l.price) FILTER (WHERE l.status = 'won'), 0) AS revenue
                FROM leads l
                WHERE {where_sql} AND l.main_contact_id IS NOT NULL
                GROUP BY l.main_contact_id
                HAVING COUNT(*) >= 2 OR SUM(l.price) FILTER (WHERE l.status = 'won') > 0
                ORDER BY revenue DESC, "totalDeals" DESC
                LIMIT 15
            """),
            params,
        ).mappings().all()

        # ТОП открытых сделок в зоне риска (просроченные задачи / без задач / зависшие > 14 дней)
        risk_rows = conn.execute(
            text(f"""
                SELECT
                    l.id,
                    l.external_id AS "externalId",
                    COALESCE(l.name, 'Сделка #' || l.external_id) AS name,
                    COALESCE(l.price, 0) AS price,
                    COALESCE(s.name, 'Этап не определён') AS "stageName",
                    COALESCE(u.name, 'Без ответственного') AS "managerName",
                    l.crm_created_at AS "createdAt",
                    l.updated_at AS "updatedAt",
                    l.closest_task_at AS "closestTaskAt",
                    ROUND(EXTRACT(EPOCH FROM (NOW() - l.updated_at)) / 86400.0, 1) AS "idleDays",
                    CASE
                        WHEN l.closest_task_at IS NULL THEN 'no_task'
                        WHEN l.closest_task_at < NOW() THEN 'overdue_task'
                        WHEN l.updated_at < NOW() - INTERVAL '14 days' THEN 'stale_deal'
                        ELSE 'high_value'
                    END AS "riskType"
                FROM leads l
                LEFT JOIN stages s ON s.id = l.current_stage_id
                LEFT JOIN amo_users u ON u.id = l.responsible_user_id
                WHERE {where_sql}
                  AND l.status = 'open'
                  AND (
                      l.closest_task_at IS NULL
                      OR l.closest_task_at < NOW()
                      OR l.updated_at < NOW() - INTERVAL '14 days'
                  )
                ORDER BY COALESCE(l.price, 0) DESC, l.updated_at ASC
                LIMIT 25
            """),
            params,
        ).mappings().all()

        return {
            "module": "02_python_analytics",
            "account": dict(account),
            "filtersMeta": {
                "pipelines": pipelines,
                "managers": managers_list,
                "tags": tags_list,
            },
            "kpis": kpis,
            "timeseries": timeseries,
            "funnel": funnel,
            "managers": managers,
            "marketing": {
                "utmSources": utm_sources,
                "tagsBreakdown": tags_breakdown,
                "customFieldsBreakdown": custom_fields_breakdown,
            },
            "lossesAndLtv": {
                "lossReasons": loss_reasons,
                "ltv": {
                    "uniqueContacts": unique_c,
                    "repeatContacts": repeat_c,
                    "repeatBuyers": int(ltv_stats["repeat_buyers"] or 0) if ltv_stats else 0,
                    "repeatRatePercent": round(repeat_c / unique_c * 100, 1) if unique_c > 0 else 0.0,
                    "avgLtv": round(float(ltv_stats["avg_ltv"] or 0), 2) if ltv_stats else 0.0,
                    "repeatRevenue": float(ltv_stats["repeat_revenue"] or 0) if ltv_stats else 0.0,
                    "topClients": [
                        {
                            "contactId": r["contactId"],
                            "sampleLeadName": r["sampleLeadName"],
                            "totalDeals": int(r["totalDeals"]),
                            "wonDeals": int(r["wonDeals"]),
                            "revenue": float(r["revenue"] or 0),
                        }
                        for r in top_clients_rows
                    ],
                },
                "riskDeals": [
                    {
                        "id": r["id"],
                        "externalId": r["externalId"],
                        "name": r["name"],
                        "price": float(r["price"] or 0),
                        "stageName": r["stageName"],
                        "managerName": r["managerName"],
                        "createdAt": r["createdAt"],
                        "updatedAt": r["updatedAt"],
                        "closestTaskAt": r["closestTaskAt"],
                        "idleDays": float(r["idleDays"] or 0),
                        "riskType": r["riskType"],
                        "crmUrl": f"https://{account['subdomain']}.{account['baseDomain']}/leads/detail/{r['externalId']}",
                    }
                    for r in risk_rows
                ],
            },
        }

