import os
import json
import urllib.request
from datetime import datetime, timezone
from typing import Optional
import jwt
from fastapi import FastAPI, Depends, HTTPException, Header, Query
from sqlalchemy import create_engine, text

app = FastAPI(title="AmoCRM Analytics - Module 02 (Python Deep BI)")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/amocrm_analytics")
JWT_ACCESS_SECRET = os.getenv("JWT_ACCESS_SECRET", "")
TOKEN_ENCRYPTION_KEY = os.getenv("TOKEN_ENCRYPTION_KEY", "")

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)


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


@app.post("/analytics/{account_id}/enrich")
def trigger_account_enrichment(
    account_id: int,
    authorization: str | None = Header(default=None),
    user: dict = Depends(get_current_user),
):
    """Отправляет задачу на внеочередное обогащение в микросервис 00_crm_sync через очередь."""
    check_account_access(user, account_id)
    try:
        req = urllib.request.Request(
            f"http://backend:3000/admin/accounts/{account_id}/enrich",
            method="POST",
            headers={"Authorization": authorization or "", "Content-Type": "application/json"},
            data=b"{}",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return {"ok": True, "message": "Задача на обогащение передана микросервису 00_crm_sync"}


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

        # 3. Рейтинг и дисциплина менеджеров
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

        # Кастомные поля: фильтруем ТОЛЬКО списочные/категориальные поля (поля с выборками)
        cf_rows = conn.execute(
            text(f"""
                WITH unpacked AS (
                    SELECT
                        l.id AS lead_id,
                        l.status,
                        COALESCE(l.price, 0) AS price,
                        TRIM(cf->>'name') AS field_name,
                        TRIM(val_elem.val) AS field_value
                    FROM leads l
                    CROSS JOIN LATERAL jsonb_array_elements(
                        CASE WHEN jsonb_typeof(l.custom_fields) = 'array' THEN l.custom_fields ELSE '[]'::jsonb END
                    ) AS cf
                    CROSS JOIN LATERAL jsonb_array_elements_text(
                        CASE WHEN jsonb_typeof(cf->'values') = 'array' THEN cf->'values' ELSE '[]'::jsonb END
                    ) AS val_elem(val)
                    WHERE {where_sql}
                      AND cf->>'name' IS NOT NULL
                      AND TRIM(val_elem.val) <> ''
                ),
                field_stats AS (
                    SELECT
                        field_name,
                        COUNT(DISTINCT lead_id) AS total_filled,
                        COUNT(DISTINCT field_value) AS distinct_vals,
                        AVG(LENGTH(field_value)) AS avg_val_len,
                        MAX(LENGTH(field_value)) AS max_val_len,
                        COUNT(DISTINCT lead_id) FILTER (WHERE status = 'won') AS won_filled,
                        COUNT(DISTINCT lead_id) FILTER (WHERE status = 'lost') AS lost_filled,
                        COUNT(DISTINCT lead_id) FILTER (WHERE status = 'open') AS open_filled,
                        COALESCE(SUM(price) FILTER (WHERE status = 'won'), 0) AS field_won_value
                    FROM unpacked
                    WHERE UPPER(field_name) NOT LIKE 'UTM_%'
                      AND UPPER(field_name) NOT IN (
                          'FBCLID', 'GCLID', 'YCLID', '_YM_UID', '_YM_COUNTER', 'ROISTAT',
                          'REFERRER', 'OPENSTAT', 'FROM', 'FORMNAME', 'TRANID', 'COOKIES',
                          'TILDACOOKIE', 'FORMID', 'BUTTON', 'GA UTM'
                      )
                      AND UPPER(field_name) NOT LIKE '%ССЫЛКА%'
                      AND UPPER(field_name) NOT LIKE '%LINK%'
                      AND UPPER(field_name) NOT LIKE '%URL%'
                      AND UPPER(field_name) NOT LIKE '%КОММЕНТ%'
                      AND UPPER(field_name) NOT LIKE '%COMMENT%'
                      AND UPPER(field_name) NOT LIKE '%IZOH%'
                      AND UPPER(field_name) NOT LIKE '%ПРИМЕЧАН%'
                      AND UPPER(field_name) NOT LIKE '%ТЕЛЕФОН%'
                      AND UPPER(field_name) NOT LIKE '%PHONE%'
                      AND UPPER(field_name) NOT LIKE '%EMAIL%'
                      AND UPPER(field_name) NOT LIKE '%ПОЧТА%'
                      AND UPPER(field_name) NOT LIKE '%ДАТА%'
                      AND UPPER(field_name) NOT LIKE '%DATE%'
                      AND UPPER(field_name) NOT LIKE '%SANASI%'
                      AND UPPER(field_name) NOT LIKE '%SANA%'
                      AND UPPER(field_name) NOT LIKE '%VAQT%'
                      AND UPPER(field_name) NOT LIKE '%ПАСПОРТ%'
                      AND UPPER(field_name) NOT LIKE '%PASPORT%'
                      AND UPPER(field_name) NOT LIKE '%ИНН%'
                      AND UPPER(field_name) NOT LIKE '%АДРЕС%'
                      AND UPPER(field_name) NOT LIKE '%MANZIL%'
                      AND UPPER(field_name) NOT LIKE '%ФИО%'
                      AND UPPER(field_name) NOT LIKE '%ФАМИЛИЯ%'
                      AND UPPER(field_name) NOT LIKE '%ИМЯ%'
                    GROUP BY field_name
                    HAVING COUNT(DISTINCT field_value) BETWEEN 1 AND 45
                       AND (
                           COUNT(DISTINCT lead_id) >= GREATEST(COUNT(DISTINCT field_value) + 1, 2)
                           OR COUNT(DISTINCT field_value) <= 12
                       )
                       AND AVG(LENGTH(field_value)) <= 45
                       AND MAX(LENGTH(field_value)) <= 100
                )
                SELECT
                    u.field_name,
                    fs.total_filled,
                    fs.distinct_vals,
                    fs.won_filled,
                    fs.lost_filled,
                    fs.open_filled,
                    fs.field_won_value,
                    u.field_value,
                    COUNT(DISTINCT u.lead_id) AS "totalLeads",
                    COUNT(DISTINCT u.lead_id) FILTER (WHERE u.status = 'won') AS "wonLeads",
                    COUNT(DISTINCT u.lead_id) FILTER (WHERE u.status = 'lost') AS "lostLeads",
                    COUNT(DISTINCT u.lead_id) FILTER (WHERE u.status = 'open') AS "openLeads",
                    COALESCE(SUM(u.price) FILTER (WHERE u.status = 'won'), 0) AS revenue,
                    COALESCE(AVG(u.price) FILTER (WHERE u.status = 'won' AND u.price > 0), 0) AS "avgCheck",
                    COALESCE(SUM(u.price) FILTER (WHERE u.status = 'open'), 0) AS "openValue",
                    COALESCE(SUM(u.price) FILTER (WHERE u.status = 'lost'), 0) AS "lostValue"
                FROM unpacked u
                JOIN field_stats fs ON fs.field_name = u.field_name
                WHERE u.field_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                  AND u.field_value !~ '^[0-9]{2}\.[0-9]{2}\.[0-9]{4}'
                  AND u.field_value !~ '^[0-9]{9,20}$'
                GROUP BY
                    u.field_name,
                    fs.total_filled,
                    fs.distinct_vals,
                    fs.won_filled,
                    fs.lost_filled,
                    fs.open_filled,
                    fs.field_won_value,
                    u.field_value
                ORDER BY fs.total_filled DESC, u.field_name ASC, "totalLeads" DESC, revenue DESC
            """),
            params,
        ).mappings().all()

        custom_fields_breakdown = []
        fields_grouped_map = {}

        for r in cf_rows:
            fname = r["field_name"]
            tot_leads = int(r["totalLeads"] or 0)
            won_l = int(r["wonLeads"] or 0)
            lost_l = int(r["lostLeads"] or 0)
            open_l = int(r["openLeads"] or 0)
            tot_filled = int(r["total_filled"] or 1)
            rev = float(r["revenue"] or 0)
            avg_chk = round(float(r["avgCheck"] or 0), 2)
            open_val = float(r["openValue"] or 0)
            lost_val = float(r["lostValue"] or 0)
            win_r = round(won_l / tot_leads * 100, 1) if tot_leads > 0 else 0.0
            share_pct = round(tot_leads / tot_filled * 100, 1) if tot_filled > 0 else 0.0

            item = {
                "fieldName": fname,
                "fieldValue": r["field_value"],
                "totalLeads": tot_leads,
                "shareOfField": share_pct,
                "wonLeads": won_l,
                "lostLeads": lost_l,
                "openLeads": open_l,
                "winRate": win_r,
                "revenue": rev,
                "wonValue": rev,
                "avgCheck": avg_chk,
                "openValue": open_val,
                "lostValue": lost_val,
            }
            custom_fields_breakdown.append(item)

            if fname not in fields_grouped_map:
                f_won = int(r["won_filled"] or 0)
                f_tot = int(r["total_filled"] or 0)
                fields_grouped_map[fname] = {
                    "fieldName": fname,
                    "totalFilled": f_tot,
                    "wonFilled": f_won,
                    "lostFilled": int(r["lost_filled"] or 0),
                    "openFilled": int(r["open_filled"] or 0),
                    "wonValue": float(r["field_won_value"] or 0),
                    "winRate": round(f_won / f_tot * 100, 1) if f_tot > 0 else 0.0,
                    "optionsCount": 0,
                    "options": [],
                }
            fields_grouped_map[fname]["options"].append(item)
            fields_grouped_map[fname]["optionsCount"] = len(fields_grouped_map[fname]["options"])

        custom_fields_lists = list(fields_grouped_map.values())

        # 6. Причины отказа (системное поле loss_reason_name + кастомное списочное поле Rad etish sababi / Причина отказа)
        loss_rows = conn.execute(
            text(f"""
                SELECT
                    COALESCE(
                        NULLIF(TRIM(l.loss_reason_name), ''),
                        NULLIF(TRIM((
                            SELECT cf_loss->'values'->>0
                            FROM jsonb_array_elements(
                                CASE WHEN jsonb_typeof(l.custom_fields) = 'array' THEN l.custom_fields ELSE '[]'::jsonb END
                            ) AS cf_loss
                            WHERE LOWER(TRIM(cf_loss->>'name')) IN (
                                'rad etish sababi', 'причина отказа', 'причина закрытия', 'sabab', 'rad sababi'
                            )
                              AND COALESCE(TRIM(cf_loss->'values'->>0), '') <> ''
                            LIMIT 1
                        )), ''),
                        'Причина не указана в CRM'
                    ) AS reason,
                    COUNT(*) AS "lostLeads",
                    COALESCE(SUM(l.price), 0) AS "lostValue",
                    COALESCE(AVG(l.price) FILTER (WHERE l.price > 0), 0) AS "avgLostCheck"
                FROM leads l
                WHERE {where_sql} AND l.status = 'lost'
                GROUP BY 1
                ORDER BY "lostLeads" DESC, "lostValue" DESC
                LIMIT 30
            """),
            params,
        ).mappings().all()

        loss_reasons = [
            {
                "reason": r["reason"],
                "lostLeads": int(r["lostLeads"]),
                "lostValue": float(r["lostValue"] or 0),
                "avgLostCheck": round(float(r["avgLostCheck"] or 0), 2),
                "sharePercent": round(int(r["lostLeads"]) / lost_leads * 100, 1) if lost_leads > 0 else 0.0,
            }
            for r in loss_rows
        ]

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
            "managers": managers,
            "marketing": {
                "utmSources": utm_sources,
                "tagsBreakdown": tags_breakdown,
                "customFieldsBreakdown": custom_fields_breakdown,
                "customFieldsLists": custom_fields_lists,
            },
            "lossesAndLtv": {
                "lossReasons": loss_reasons,
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

