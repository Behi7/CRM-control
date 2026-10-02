import os
import json
import base64
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
import httpx
from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from pydantic import BaseModel
from sqlalchemy import text
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.config import settings
from app.core.database import sync_engine
from app.core.security import get_current_user

router = APIRouter(tags=["01 Time Analytics"])

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
    stale_seconds = settings.STALE_THRESHOLD_MINUTES * 60
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

@router.get("/accounts/{account_id}/pipelines")
def get_pipelines(account_id: int, user: dict = Depends(get_current_user)):
    check_account_access(user, account_id)
    with sync_engine.connect() as conn:
        freshness = get_data_freshness(conn, account_id)
        sql = text("""
            SELECT id, external_id AS "externalId", name, is_archived AS "isArchived"
            FROM pipelines
            WHERE account_id = :acc_id AND is_archived = false
            ORDER BY id ASC
        """)
        rows = conn.execute(sql, {"acc_id": account_id}).mappings().all()
        return {**freshness, "items": [dict(r) for r in rows]}

@router.get("/accounts/{account_id}/tags")
def get_tags(account_id: int, user: dict = Depends(get_current_user)):
    check_account_access(user, account_id)
    with sync_engine.connect() as conn:
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

@router.get("/accounts/{account_id}/managers")
def get_managers(account_id: int, user: dict = Depends(get_current_user)):
    check_account_access(user, account_id)
    with sync_engine.connect() as conn:
        freshness = get_data_freshness(conn, account_id)
        sql = text("""
            SELECT id, external_id AS "externalId", name, is_archived AS "isArchived"
            FROM amo_users
            WHERE account_id = :acc_id AND is_archived = false
            ORDER BY name ASC
        """)
        rows = conn.execute(sql, {"acc_id": account_id}).mappings().all()
        return {**freshness, "items": [dict(r) for r in rows]}

@router.get("/pipelines/{pipeline_id}/stages-stats")
def get_stages_stats(
    pipeline_id: int,
    tag_ids: list[int] = Query(default=[]),
    status: str | None = Query(default=None),
    manager_ids: list[int] = Query(default=[]),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    user: dict = Depends(get_current_user),
):
    with sync_engine.connect() as conn:
        pipe_row = conn.execute(
            text("SELECT account_id FROM pipelines WHERE id = :id"),
            {"id": pipeline_id}
        ).mappings().first()
        if not pipe_row:
            raise HTTPException(status_code=404, detail="Pipeline not found")

        acc_id = pipe_row["account_id"]
        check_account_access(user, acc_id)
        freshness = get_data_freshness(conn, acc_id)

        filter_clause, filter_params = build_filter_clauses(
            tag_ids, status, manager_ids, date_from, date_to
        )

        stages_sql = text("""
            SELECT id AS "stageId", external_id AS "externalId", name, sort_order AS "sortOrder"
            FROM stages
            WHERE pipeline_id = :pipe_id AND is_archived = false
            ORDER BY sort_order ASC, id ASC
        """)
        stages = conn.execute(stages_sql, {"pipe_id": pipeline_id}).mappings().all()

        stats_sql = text(f"""
            SELECT
                h.stage_id,
                AVG(h.duration_seconds)::numeric(12,2) AS avg_duration,
                COUNT(DISTINCT h.lead_id) AS passed_leads_count
            FROM lead_stage_history h
            JOIN leads l ON l.id = h.lead_id
            WHERE l.pipeline_id = :pipe_id
              AND h.duration_seconds IS NOT NULL
              {filter_clause}
            GROUP BY h.stage_id
        """)
        params = {"pipe_id": pipeline_id, **filter_params}
        stats_map = {
            r["stage_id"]: r
            for r in conn.execute(stats_sql, params).mappings().all()
        }

        active_sql = text(f"""
            SELECT l.current_stage_id, COUNT(l.id) AS active_leads_count
            FROM leads l
            WHERE l.pipeline_id = :pipe_id
              AND l.status = 'open'
              {filter_clause}
            GROUP BY l.current_stage_id
        """)
        active_map = {
            r["current_stage_id"]: r["active_leads_count"]
            for r in conn.execute(active_sql, params).mappings().all()
        }

        skips_sql = text(f"""
            SELECT s.skipped_stage_id, COUNT(s.id) AS skips_count
            FROM lead_stage_skips s
            JOIN leads l ON l.id = s.lead_id
            WHERE s.pipeline_id = :pipe_id
              {filter_clause}
            GROUP BY s.skipped_stage_id
        """)
        skips_map = {
            r["skipped_stage_id"]: r["skips_count"]
            for r in conn.execute(skips_sql, params).mappings().all()
        }

        items = []
        for s in stages:
            s_id = s["stageId"]
            st = stats_map.get(s_id, {})
            avg_actual = float(st["avg_duration"]) if st.get("avg_duration") is not None else None
            passed_cnt = int(st.get("passed_leads_count") or 0)
            active_cnt = int(active_map.get(s_id) or 0)
            skips_cnt = int(skips_map.get(s_id) or 0)

            total_including_skips = passed_cnt + skips_cnt
            if total_including_skips > 0 and avg_actual is not None:
                avg_skips = round((avg_actual * passed_cnt) / total_including_skips, 2)
            else:
                avg_skips = avg_actual

            items.append({
                "stageId": s_id,
                "externalId": s["externalId"],
                "name": s["name"],
                "avgSecondsActual": avg_actual,
                "avgSecondsIncludingSkips": avg_skips,
                "skipsCount": skips_cnt,
                "leadsCount": passed_cnt,
                "activeLeadsCount": active_cnt,
            })

        return {**freshness, "items": items}

@router.get("/stages/{stage_id}/leads")
def get_stage_leads(
    stage_id: int,
    tag_ids: list[int] = Query(default=[]),
    status: str | None = Query(default=None),
    manager_ids: list[int] = Query(default=[]),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(get_current_user),
):
    with sync_engine.connect() as conn:
        stage = conn.execute(
            text("""
                SELECT s.id, s.name, s.external_id, p.account_id, p.id AS pipeline_id
                FROM stages s
                JOIN pipelines p ON p.id = s.pipeline_id
                WHERE s.id = :id
            """),
            {"id": stage_id}
        ).mappings().first()
        if not stage:
            raise HTTPException(status_code=404, detail="Stage not found")

        acc_id = stage["account_id"]
        check_account_access(user, acc_id)

        filter_clause, filter_params = build_filter_clauses(
            tag_ids, status, manager_ids, date_from, date_to
        )

        sql = text(f"""
            SELECT
                l.id,
                l.external_id AS "externalId",
                l.name,
                l.status,
                l.price,
                l.crm_created_at AS "crmCreatedAt",
                u.name AS "managerName",
                h.entered_at AS "enteredAt",
                h.exited_at AS "exitedAt",
                h.duration_seconds AS "durationSeconds"
            FROM leads l
            JOIN lead_stage_history h ON h.lead_id = l.id AND h.stage_id = :stage_id
            LEFT JOIN amo_users u ON u.id = l.responsible_user_id
            WHERE l.pipeline_id = :pipe_id
              {filter_clause}
            ORDER BY h.entered_at DESC
            LIMIT :limit OFFSET :offset
        """)
        params = {
            "stage_id": stage_id,
            "pipe_id": stage["pipeline_id"],
            "limit": limit,
            "offset": offset,
            **filter_params,
        }
        rows = conn.execute(sql, params).mappings().all()

        items = []
        for r in rows:
            d = dict(r)
            d["price"] = float(d["price"]) if d.get("price") is not None else None
            d["crmCreatedAt"] = d["crmCreatedAt"].isoformat() if d.get("crmCreatedAt") else None
            d["enteredAt"] = d["enteredAt"].isoformat() if d.get("enteredAt") else None
            d["exitedAt"] = d["exitedAt"].isoformat() if d.get("exitedAt") else None
            items.append(d)

        return {"items": items}

@router.get("/leads/{lead_id}/history")
def get_lead_history(lead_id: int, user: dict = Depends(get_current_user)):
    with sync_engine.connect() as conn:
        lead = conn.execute(
            text("""
                SELECT l.id, l.external_id, l.name, l.status, l.price, l.crm_created_at, l.account_id,
                       p.name AS pipeline_name, u.name AS manager_name
                FROM leads l
                LEFT JOIN pipelines p ON p.id = l.pipeline_id
                LEFT JOIN amo_users u ON u.id = l.responsible_user_id
                WHERE l.id = :id
            """),
            {"id": lead_id}
        ).mappings().first()
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")

        acc_id = lead["account_id"]
        check_account_access(user, acc_id)

        history_sql = text("""
            SELECT
                h.id,
                h.stage_id AS "stageId",
                s.name AS "stageName",
                h.entered_at AS "enteredAt",
                h.exited_at AS "exitedAt",
                h.duration_seconds AS "durationSeconds"
            FROM lead_stage_history h
            JOIN stages s ON s.id = h.stage_id
            WHERE h.lead_id = :lead_id
            ORDER BY h.entered_at ASC
        """)
        h_rows = conn.execute(history_sql, {"lead_id": lead_id}).mappings().all()

        h_items = []
        for r in h_rows:
            d = dict(r)
            d["enteredAt"] = d["enteredAt"].isoformat() if d.get("enteredAt") else None
            d["exitedAt"] = d["exitedAt"].isoformat() if d.get("exitedAt") else None
            h_items.append(d)

        return {
            "lead": {
                "id": lead["id"],
                "externalId": lead["external_id"],
                "name": lead["name"],
                "status": lead["status"],
                "price": float(lead["price"]) if lead.get("price") is not None else None,
                "crmCreatedAt": lead["crm_created_at"].isoformat() if lead.get("crm_created_at") else None,
                "pipelineName": lead["pipeline_name"],
                "managerName": lead["manager_name"],
            },
            "history": h_items,
        }

@router.get("/leads/{lead_id}/skips")
def get_lead_skips(lead_id: int, user: dict = Depends(get_current_user)):
    with sync_engine.connect() as conn:
        lead = conn.execute(
            text("SELECT account_id FROM leads WHERE id = :id"),
            {"id": lead_id}
        ).mappings().first()
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")

        check_account_access(user, lead["account_id"])

        sql = text("""
            SELECT
                s.id,
                s.transition_at AS "transitionAt",
                s.direction,
                s_from.name AS "fromStageName",
                s_to.name AS "toStageName",
                s_skip.name AS "skippedStageName"
            FROM lead_stage_skips s
            LEFT JOIN stages s_from ON s_from.id = s.from_stage_id
            LEFT JOIN stages s_to ON s_to.id = s.to_stage_id
            LEFT JOIN stages s_skip ON s_skip.id = s.skipped_stage_id
            WHERE s.lead_id = :lead_id
            ORDER BY s.transition_at ASC
        """)
        rows = conn.execute(sql, {"lead_id": lead_id}).mappings().all()
        return {
            "items": [
                {
                    **dict(r),
                    "transitionAt": r["transitionAt"].isoformat() if r.get("transitionAt") else None
                }
                for r in rows
            ]
        }
