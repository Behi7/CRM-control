import os
from datetime import datetime, timezone
from typing import Any, Optional
from fastapi import HTTPException
from sqlalchemy import text
from app.config import settings


def check_account_access(user: dict, account_id: int):
    if user.get("role") != "admin" and user.get("accountId") != account_id:
        raise HTTPException(status_code=403, detail="Access denied to this account")


def get_data_freshness(conn, account_id: int) -> dict:
    row = conn.execute(
        text("SELECT last_synced_at, backfill_status FROM accounts WHERE id = :id"),
        {"id": account_id},
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
        if len(d) == 10 and d[4] == "-" and d[7] == "-":
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
