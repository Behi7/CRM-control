import os
import json
import base64
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
import jwt
import httpx
from fastapi import FastAPI, Depends, HTTPException, Header, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

app = FastAPI(title="AmoCRM Analytics - Module 01 (Python Time Analytics)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/amocrm_analytics")
JWT_ACCESS_SECRET = os.getenv("JWT_ACCESS_SECRET", "")
TOKEN_ENCRYPTION_KEY = os.getenv("TOKEN_ENCRYPTION_KEY", "")
STALE_THRESHOLD_MINUTES = int(os.getenv("STALE_THRESHOLD_MINUTES", "30"))

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)


# ===================== AUTH & SECURITY =====================

def get_current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, JWT_ACCESS_SECRET, algorithms=["HS256"])
        return {
            "userId": payload.get("sub"),
            "role": payload.get("role"),
            "accountId": payload.get("accountId"),
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def check_account_access(user: dict, account_id: int):
    if user.get("role") != "admin" and user.get("accountId") != account_id:
        raise HTTPException(status_code=403, detail="Access denied to this account")


def get_data_freshness(conn, account_id: int) -> dict:
    row = conn.execute(
        text("SELECT last_synced_at, backfill_status FROM accounts WHERE id = :id"),
        {"id": account_id}
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")

    last_synced = row["last_synced_at"]
    backfill_status = row["backfill_status"]
    stale_seconds = STALE_THRESHOLD_MINUTES * 60
    now = datetime.now(timezone.utc)

    is_stale = (
        last_synced is None
        or (now - last_synced).total_seconds() > stale_seconds
        or backfill_status != "done"
    )
    return {
        "dataFreshness": {
            "lastSyncedAt": last_synced.isoformat() if last_synced else None,
            "isStale": is_stale,
        }
    }


def parse_date_boundary(d_str: str | None, end_of_day: bool) -> datetime | None:
    if not d_str:
        return None
    d = d_str.strip()
    try:
        if len(d) == 10 and d[4] == '-' and d[7] == '-':
            iso = f"{d}T23:59:59.999999+00:00" if end_of_day else f"{d}T00:00:00+00:00"
            return datetime.fromisoformat(iso)
        return datetime.fromisoformat(d.replace("Z", "+00:00"))
    except Exception:
        return None


def parse_int_list(val: Any) -> list[int]:
    if not val:
        return []
    if isinstance(val, list):
        res = []
        for x in val:
            res.extend(parse_int_list(x))
        return res
    if isinstance(val, str):
        parts = [p.strip() for p in val.split(",") if p.strip()]
        return [int(p) for p in parts if p.isdigit()]
    return []


def build_filter_clauses(
    tag_ids_raw: Any = None,
    status_raw: str | None = None,
    manager_ids_raw: Any = None,
    date_from_raw: str | None = None,
    date_to_raw: str | None = None,
) -> tuple[str, dict]:
    where_parts = []
    params: dict[str, Any] = {}

    tag_ids = parse_int_list(tag_ids_raw)
    if tag_ids:
        where_parts.append("""
            l.id IN (
                SELECT lt.lead_id FROM lead_tags lt
                WHERE lt.tag_id = ANY(:filter_tag_ids)
                GROUP BY lt.lead_id HAVING COUNT(DISTINCT lt.tag_id) = :filter_tag_count
            )
        """)
        params["filter_tag_ids"] = tag_ids
        params["filter_tag_count"] = len(tag_ids)

    if status_raw and status_raw != "all":
        statuses = [s.strip() for s in status_raw.split(",") if s.strip() in ("open", "won", "lost")]
        if statuses:
            where_parts.append("l.status = ANY(:filter_statuses)")
            params["filter_statuses"] = statuses

    manager_ids = parse_int_list(manager_ids_raw)
    if manager_ids:
        where_parts.append("l.responsible_user_id = ANY(:filter_manager_ids)")
        params["filter_manager_ids"] = manager_ids

    date_from = parse_date_boundary(date_from_raw, False)
    date_to = parse_date_boundary(date_to_raw, True)

    if date_from and date_to:
        if date_from > date_to:
            date_from, date_to = date_to, date_from
        where_parts.append("l.crm_created_at >= :filter_date_from AND l.crm_created_at <= :filter_date_to")
        params["filter_date_from"] = date_from
        params["filter_date_to"] = date_to
    elif date_from:
        where_parts.append("l.crm_created_at >= :filter_date_from")
        params["filter_date_from"] = date_from
    elif date_to:
        where_parts.append("l.crm_created_at <= :filter_date_to")
        params["filter_date_to"] = date_to

    clause = ("AND " + " AND ".join(where_parts)) if where_parts else ""
    return clause, params


def format_duration(seconds: float | int | None, lang: str = "ru") -> str:
    if seconds is None:
        return "—"
    sec = int(round(seconds))
    if sec <= 0:
        return "0 son" if lang == "uz" else "0 сек"
    d = sec // 86400
    h = (sec % 86400) // 3600
    m = (sec % 3600) // 60
    parts = []
    if lang == "uz":
        if d > 0: parts.append(f"{d}k")
        if h > 0: parts.append(f"{h}s")
        if m > 0: parts.append(f"{m}d")
        return " ".join(parts) or "<1d"
    else:
        if d > 0: parts.append(f"{d}д")
        if h > 0: parts.append(f"{h}ч")
        if m > 0: parts.append(f"{m}м")
        return " ".join(parts) or "<1м"


def decrypt_ai_token(data_str: str, key_env: str) -> str:
    raw = (key_env or "").strip()
    if len(raw) == 64 and all(c in "0123456789abcdefABCDEF" for c in raw):
        key = bytes.fromhex(raw)
    elif len(raw.encode("utf-8")) == 32:
        key = raw.encode("utf-8")
    else:
        key = base64.b64decode(raw)

    obj = json.loads(data_str)
    nonce = base64.b64decode(obj["nonce"])
    ct = base64.b64decode(obj["ciphertext"])
    tag = base64.b64decode(obj["authTag"])

    aesgcm = AESGCM(key)
    decrypted = aesgcm.decrypt(nonce, ct + tag, None)
    return decrypted.decode("utf-8")


# ===================== ENDPOINTS =====================

@app.get("/health")
def health():
    return {"status": "ok", "module": "01_time_analytics"}


@app.get("/accounts/{account_id}/pipelines")
def get_pipelines(account_id: int, user: dict = Depends(get_current_user)):
    check_account_access(user, account_id)
    with engine.connect() as conn:
        freshness = get_data_freshness(conn, account_id)
        sql = text("""
            SELECT id, external_id AS "externalId", name, is_archived AS "isArchived"
            FROM pipelines
            WHERE account_id = :acc_id AND is_archived = false
            ORDER BY id ASC
        """)
        rows = conn.execute(sql, {"acc_id": account_id}).mappings().all()
        return {**freshness, "items": [dict(r) for r in rows]}


@app.get("/accounts/{account_id}/tags")
def get_tags(account_id: int, user: dict = Depends(get_current_user)):
    check_account_access(user, account_id)
    with engine.connect() as conn:
        freshness = get_data_freshness(conn, account_id)
        sql = text("""
            SELECT t.id, t.external_id AS "externalId", t.name, t.is_archived AS "isArchived"
            FROM tags t
            WHERE t.account_id = :acc_id
              AND t.is_archived = false
              AND EXISTS (SELECT 1 FROM lead_tags lt WHERE lt.tag_id = t.id)
            ORDER BY t.name ASC
        """)
        rows = conn.execute(sql, {"acc_id": account_id}).mappings().all()
        return {**freshness, "items": [dict(r) for r in rows]}


@app.get("/accounts/{account_id}/managers")
def get_managers(account_id: int, user: dict = Depends(get_current_user)):
    check_account_access(user, account_id)
    with engine.connect() as conn:
        freshness = get_data_freshness(conn, account_id)
        sql = text("""
            SELECT id, external_id AS "externalId", name, is_archived AS "isArchived"
            FROM amo_users
            WHERE account_id = :acc_id AND is_archived = false
            ORDER BY name ASC
        """)
        rows = conn.execute(sql, {"acc_id": account_id}).mappings().all()
        return {**freshness, "items": [dict(r) for r in rows]}


@app.get("/pipelines/{pipeline_id}/stages-stats")
def get_stages_stats(
    pipeline_id: int,
    tagIds: str | None = Query(default=None),
    status: str | None = Query(default=None),
    managerIds: str | None = Query(default=None),
    dateFrom: str | None = Query(default=None),
    dateTo: str | None = Query(default=None),
    user: dict = Depends(get_current_user),
):
    with engine.connect() as conn:
        pipe_row = conn.execute(
            text("SELECT id, account_id, name FROM pipelines WHERE id = :id"),
            {"id": pipeline_id}
        ).mappings().first()
        if not pipe_row:
            raise HTTPException(status_code=404, detail="Pipeline not found")

        account_id = pipe_row["account_id"]
        check_account_access(user, account_id)
        freshness = get_data_freshness(conn, account_id)

        stages_rows = conn.execute(
            text("""
                SELECT id, external_id, name, sort_order
                FROM stages
                WHERE pipeline_id = :pipeline_id AND is_archived = false
                ORDER BY sort_order ASC, id ASC
            """),
            {"pipeline_id": pipeline_id}
        ).mappings().all()

        if not stages_rows:
            return {**freshness, "items": []}

        stage_ids = [r["id"] for r in stages_rows]
        filter_clause, filter_params = build_filter_clauses(tagIds, status, managerIds, dateFrom, dateTo)

        stats_sql = text(f"""
            SELECT 
                h.stage_id,
                AVG(h.duration_seconds) FILTER (WHERE h.exited_at IS NOT NULL)::float as avg_closed_seconds,
                COUNT(h.id) FILTER (WHERE h.exited_at IS NOT NULL)::int as closed_count,
                COUNT(h.id) FILTER (WHERE h.exited_at IS NULL)::int as active_count,
                COUNT(DISTINCT h.lead_id) FILTER (WHERE h.exited_at IS NOT NULL)::int as closed_leads,
                COUNT(DISTINCT h.lead_id)::int as unique_leads
            FROM lead_stage_history h 
            JOIN leads l ON l.id = h.lead_id
            WHERE h.stage_id = ANY(:stage_ids) AND l.status <> 'gone' {filter_clause}
            GROUP BY h.stage_id
        """)
        stats_params = {**filter_params, "stage_ids": stage_ids}
        stats_rows = conn.execute(stats_sql, stats_params).mappings().all()
        stats_map = {r["stage_id"]: r for r in stats_rows}

        skips_sql = text(f"""
            SELECT 
                sk.skipped_stage_id as stage_id,
                COUNT(*)::int as cnt, 
                COUNT(DISTINCT sk.lead_id)::int AS unique_leads 
            FROM lead_stage_skips sk 
            JOIN leads l ON l.id = sk.lead_id
            WHERE sk.skipped_stage_id = ANY(:stage_ids) AND l.status <> 'gone' {filter_clause}
            GROUP BY sk.skipped_stage_id
        """)
        skips_rows = conn.execute(skips_sql, stats_params).mappings().all()
        skips_map = {r["stage_id"]: r for r in skips_rows}

        terminal_sql = text(f"""
            SELECT 
                l.status,
                COUNT(*)::int AS cnt
            FROM leads l
            WHERE l.pipeline_id = :pipeline_id 
              AND l.status IN ('won', 'lost')
              {filter_clause}
            GROUP BY l.status
        """)
        terminal_params = {**filter_params, "pipeline_id": pipeline_id}
        terminal_rows = conn.execute(terminal_sql, terminal_params).mappings().all()
        terminal_map = {r["status"]: r["cnt"] for r in terminal_rows}

        result = []
        for s in stages_rows:
            s_ext = s["external_id"]
            if s_ext in ("142", "143"):
                term_status = "won" if s_ext == "142" else "lost"
                cnt = terminal_map.get(term_status, 0)
                result.append({
                    "stageId": str(s["id"]),
                    "externalId": s_ext,
                    "name": s["name"],
                    "sortOrder": s["sort_order"],
                    "avgSecondsActual": None,
                    "avgSecondsIncludingSkips": None,
                    "skipsCount": 0,
                    "leadsCount": cnt,
                    "activeLeadsCount": cnt,
                    "activeHistoryCount": 0,
                })
                continue

            st = stats_map.get(s["id"])
            sk = skips_map.get(s["id"])

            closed_count = st["closed_count"] if st else 0
            active_count = st["active_count"] if st else 0
            closed_leads = st["closed_leads"] if st else 0
            skips_count = sk["cnt"] if sk else 0

            avg_closed = None
            if closed_count > 0 and st and st["avg_closed_seconds"] is not None:
                avg_closed = int(round(st["avg_closed_seconds"]))

            avg_including = None
            if avg_closed is not None and (closed_count + skips_count) > 0:
                avg_including = int(round((avg_closed * closed_count) / (closed_count + skips_count)))

            result.append({
                "stageId": str(s["id"]),
                "externalId": s_ext,
                "name": s["name"],
                "sortOrder": s["sort_order"],
                "avgSecondsActual": avg_closed,
                "avgSecondsIncludingSkips": avg_including,
                "skipsCount": skips_count,
                "leadsCount": closed_leads,
                "activeLeadsCount": active_count,
                "activeHistoryCount": active_count,
            })

        return {**freshness, "items": result}


@app.get("/stages/{stage_id}/active-leads")
def get_active_leads(
    stage_id: int,
    page: int = Query(default=1, ge=1),
    perPage: int = Query(default=50, ge=1, le=500),
    tagIds: str | None = Query(default=None),
    status: str | None = Query(default=None),
    managerIds: str | None = Query(default=None),
    dateFrom: str | None = Query(default=None),
    dateTo: str | None = Query(default=None),
    user: dict = Depends(get_current_user),
):
    with engine.connect() as conn:
        stage_row = conn.execute(
            text("""
                SELECT s.id, s.external_id, s.pipeline_id, p.account_id
                FROM stages s
                JOIN pipelines p ON p.id = s.pipeline_id
                WHERE s.id = :id
            """),
            {"id": stage_id}
        ).mappings().first()
        if not stage_row:
            raise HTTPException(status_code=404, detail="Stage not found")

        account_id = stage_row["account_id"]
        check_account_access(user, account_id)
        freshness = get_data_freshness(conn, account_id)

        offset = (page - 1) * perPage
        filter_clause, filter_params = build_filter_clauses(tagIds, status, managerIds, dateFrom, dateTo)
        s_ext = stage_row["external_id"]

        if s_ext in ("142", "143"):
            term_status = "won" if s_ext == "142" else "lost"
            query_params = {
                **filter_params,
                "pipeline_id": stage_row["pipeline_id"],
                "term_status": term_status,
                "limit": perPage,
                "offset": offset,
            }
            rows = conn.execute(text(f"""
                SELECT l.id::text, l.external_id::text, l.name, l.crm_closed_at AS entered_at, l.status, l.price::text,
                       au.name as responsible_name
                FROM leads l
                LEFT JOIN amo_users au ON au.id = l.responsible_user_id
                WHERE l.pipeline_id = :pipeline_id 
                  AND l.status = :term_status
                  {filter_clause}
                ORDER BY l.crm_closed_at DESC
                LIMIT :limit OFFSET :offset
            """), query_params).mappings().all()

            total_row = conn.execute(text(f"""
                SELECT COUNT(*)::int as c FROM leads l
                WHERE l.pipeline_id = :pipeline_id 
                  AND l.status = :term_status
                  {filter_clause}
            """), query_params).mappings().first()

            return {
                **freshness,
                "items": [dict(r) for r in rows],
                "page": page,
                "perPage": perPage,
                "total": total_row["c"] if total_row else 0,
            }

        query_params = {
            **filter_params,
            "stage_id": stage_id,
            "limit": perPage,
            "offset": offset,
        }
        rows = conn.execute(text(f"""
            SELECT l.id::text, l.external_id::text, l.name, h.entered_at, l.status, l.price::text,
                   au.name as responsible_name
            FROM lead_stage_history h
            JOIN leads l ON l.id = h.lead_id
            LEFT JOIN amo_users au ON au.id = l.responsible_user_id
            WHERE h.stage_id = :stage_id
              AND h.exited_at IS NULL
              AND l.status <> 'gone'
              {filter_clause}
            ORDER BY h.entered_at ASC
            LIMIT :limit OFFSET :offset
        """), query_params).mappings().all()

        total_row = conn.execute(text(f"""
            SELECT COUNT(*)::int as c
            FROM lead_stage_history h
            JOIN leads l ON l.id = h.lead_id
            WHERE h.stage_id = :stage_id
              AND h.exited_at IS NULL
              AND l.status <> 'gone'
              {filter_clause}
        """), query_params).mappings().first()

        return {
            **freshness,
            "items": [dict(r) for r in rows],
            "page": page,
            "perPage": perPage,
            "total": total_row["c"] if total_row else 0,
        }


@app.get("/leads/{lead_id}/history")
def get_lead_history(lead_id: int, user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        lead_row = conn.execute(text("""
            SELECT l.id, l.external_id AS "externalId", l.name, l.price::text, l.status,
                   l.account_id, l.responsible_user_id,
                   au.id as resp_id, au.name as resp_name
            FROM leads l
            LEFT JOIN amo_users au ON au.id = l.responsible_user_id
            WHERE l.id = :id
        """), {"id": lead_id}).mappings().first()
        if not lead_row:
            raise HTTPException(status_code=404, detail="Lead not found")

        account_id = lead_row["account_id"]
        check_account_access(user, account_id)
        freshness = get_data_freshness(conn, account_id)

        history_rows = conn.execute(text("""
            SELECT s.name as stage_name, s.external_id::text, h.entered_at, h.exited_at,
                   CASE WHEN h.exited_at IS NULL
                        THEN EXTRACT(EPOCH FROM (now() - h.entered_at))::int
                        ELSE h.duration_seconds END AS duration_seconds
            FROM lead_stage_history h
            JOIN stages s ON s.id = h.stage_id
            WHERE h.lead_id = :lead_id
            ORDER BY h.entered_at ASC
        """), {"lead_id": lead_id}).mappings().all()

        skips_rows = conn.execute(text("""
            SELECT sk.source_event_id::text, sk.transition_at, sk.direction,
                   fs.name as from_stage_name, ts.name as to_stage_name, ss.name as skipped_stage_name
            FROM lead_stage_skips sk
            JOIN stages fs ON fs.id = sk.from_stage_id
            JOIN stages ts ON ts.id = sk.to_stage_id
            JOIN stages ss ON ss.id = sk.skipped_stage_id
            WHERE sk.lead_id = :lead_id
            ORDER BY sk.transition_at ASC
        """), {"lead_id": lead_id}).mappings().all()

        tags_rows = conn.execute(text("""
            SELECT t.id, t.name
            FROM lead_tags lt
            JOIN tags t ON t.id = lt.tag_id
            WHERE lt.lead_id = :lead_id
        """), {"lead_id": lead_id}).mappings().all()

        lead_data = {
            "id": lead_row["id"],
            "externalId": lead_row["externalId"],
            "name": lead_row["name"],
            "price": lead_row["price"],
            "status": lead_row["status"],
            "responsibleUser": {"id": lead_row["resp_id"], "name": lead_row["resp_name"]} if lead_row["resp_id"] else None,
            "leadTags": [{"tag": {"id": tr["id"], "name": tr["name"]}} for tr in tags_rows],
        }

        return {
            **freshness,
            "lead": lead_data,
            "history": [dict(r) for r in history_rows],
            "skips": [dict(r) for r in skips_rows],
        }


@app.get("/accounts/{account_id}/leads/search")
def search_leads(
    account_id: int,
    q: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    perPage: int = Query(default=50, ge=1, le=500),
    tagIds: str | None = Query(default=None),
    status: str | None = Query(default=None),
    managerIds: str | None = Query(default=None),
    dateFrom: str | None = Query(default=None),
    dateTo: str | None = Query(default=None),
    user: dict = Depends(get_current_user),
):
    check_account_access(user, account_id)
    with engine.connect() as conn:
        freshness = get_data_freshness(conn, account_id)
        if len(q.strip()) < 2:
            return {**freshness, "items": [], "page": page, "perPage": perPage, "total": 0}

        like_pattern = f"%{q.strip().replace('%', r'\%').replace('_', r'\_')}%"
        filter_clause, filter_params = build_filter_clauses(tagIds, status, managerIds, dateFrom, dateTo)
        offset = (page - 1) * perPage

        query_params = {
            **filter_params,
            "account_id": account_id,
            "pattern": like_pattern,
            "limit": perPage,
            "offset": offset,
        }

        rows = conn.execute(text(f"""
            SELECT l.id::text, l.external_id::text, l.name, l.status, l.price::text,
                   l.crm_created_at, l.crm_closed_at,
                   au.name as responsible_name
            FROM leads l
            LEFT JOIN amo_users au ON au.id = l.responsible_user_id
            WHERE l.account_id = :account_id
              AND l.status <> 'gone'
              AND (l.name ILIKE :pattern OR l.external_id ILIKE :pattern)
              {filter_clause}
            ORDER BY l.crm_created_at DESC
            LIMIT :limit OFFSET :offset
        """), query_params).mappings().all()

        total_row = conn.execute(text(f"""
            SELECT COUNT(*)::int as c
            FROM leads l
            WHERE l.account_id = :account_id
              AND l.status <> 'gone'
              AND (l.name ILIKE :pattern OR l.external_id ILIKE :pattern)
              {filter_clause}
        """), query_params).mappings().first()

        return {
            **freshness,
            "items": [dict(r) for r in rows],
            "page": page,
            "perPage": perPage,
            "total": total_row["c"] if total_row else 0,
        }


@app.get("/accounts/{account_id}/leads")
def list_leads_by_status(
    account_id: int,
    status: str = Query(default="open"),
    page: int = Query(default=1, ge=1),
    perPage: int = Query(default=50, ge=1, le=500),
    tagIds: str | None = Query(default=None),
    managerIds: str | None = Query(default=None),
    dateFrom: str | None = Query(default=None),
    dateTo: str | None = Query(default=None),
    user: dict = Depends(get_current_user),
):
    check_account_access(user, account_id)
    with engine.connect() as conn:
        freshness = get_data_freshness(conn, account_id)
        filter_clause, filter_params = build_filter_clauses(tagIds, None, managerIds, dateFrom, dateTo)
        offset = (page - 1) * perPage

        query_params = {
            **filter_params,
            "account_id": account_id,
            "status": status,
            "limit": perPage,
            "offset": offset,
        }

        rows = conn.execute(text(f"""
            SELECT l.id::text, l.external_id::text, l.name, l.status, l.price::text,
                   l.crm_created_at, l.crm_closed_at,
                   au.name as responsible_name
            FROM leads l
            LEFT JOIN amo_users au ON au.id = l.responsible_user_id
            WHERE l.account_id = :account_id
              AND l.status = :status
              {filter_clause}
            ORDER BY l.crm_created_at DESC
            LIMIT :limit OFFSET :offset
        """), query_params).mappings().all()

        total_row = conn.execute(text(f"""
            SELECT COUNT(*)::int as c
            FROM leads l
            WHERE l.account_id = :account_id
              AND l.status = :status
              {filter_clause}
        """), query_params).mappings().first()

        return {
            **freshness,
            "items": [dict(r) for r in rows],
            "page": page,
            "perPage": perPage,
            "total": total_row["c"] if total_row else 0,
        }


# ===================== AI INTEGRATION =====================

class AiChatRequest(BaseModel):
    message: str
    pipelineId: Optional[int] = None
    filters: Optional[dict] = None
    lang: Optional[str] = "ru"
    history: Optional[List[dict]] = None
    biData: Optional[dict] = None
    biSelectedBlocks: Optional[List[str]] = None


@app.get("/accounts/{account_id}/ai/status")
def get_ai_status(account_id: int, user: dict = Depends(get_current_user)):
    check_account_access(user, account_id)
    with engine.connect() as conn:
        acc = conn.execute(
            text("SELECT ai_enabled, ai_model, ai_encrypted_token FROM accounts WHERE id = :id"),
            {"id": account_id}
        ).mappings().first()
        if not acc:
            raise HTTPException(status_code=404, detail="Account not found")

        has_token = bool(acc["ai_encrypted_token"])
        is_ready = bool(acc["ai_enabled"] and has_token)

        return {
            "enabled": is_ready,
            "configured": has_token,
            "model": acc["ai_model"] or "gemini-2.5-flash",
        }


@app.post("/accounts/{account_id}/ai/chat")
async def chat_ai(account_id: int, body: AiChatRequest, user: dict = Depends(get_current_user)):
    check_account_access(user, account_id)
    with engine.connect() as conn:
        acc = conn.execute(
            text("SELECT ai_enabled, ai_model, ai_encrypted_token, ai_company_context FROM accounts WHERE id = :id"),
            {"id": account_id}
        ).mappings().first()
        if not acc:
            raise HTTPException(status_code=404, detail="Account not found")

        if not acc["ai_enabled"] or not acc["ai_encrypted_token"]:
            raise HTTPException(status_code=400, detail="ИИ не подключен для этого аккаунта в админке")

        try:
            api_key = decrypt_ai_token(acc["ai_encrypted_token"], TOKEN_ENCRYPTION_KEY)
        except Exception:
            raise HTTPException(status_code=500, detail="Не удалось расшифровать ключ ИИ")

        clean_model = (acc["ai_model"] or "gemini-2.5-flash").strip().removeprefix("models/")
        is_uz = (body.lang == "uz")
        ai_context = acc["ai_company_context"] or ""

        # BI Analytics Context
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
            stats_res = get_stages_stats(
                pipeline_id=pipe_id,
                tagIds=",".join(map(str, body.filters.get("tagIds", []))) if body.filters and body.filters.get("tagIds") else None,
                status=body.filters.get("status") if body.filters else None,
                managerIds=",".join(map(str, body.filters.get("managerIds", []))) if body.filters and body.filters.get("managerIds") else None,
                dateFrom=body.filters.get("dateFrom") if body.filters else None,
                dateTo=body.filters.get("dateTo") if body.filters else None,
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
