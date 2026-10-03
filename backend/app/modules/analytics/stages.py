from collections import defaultdict
from typing import Any, Optional
from fastapi import HTTPException
from sqlalchemy import text
from app.core.database import sync_engine
from app.modules.analytics.common import (
    check_account_access,
    get_data_freshness,
    build_filter_clauses,
)


def _format_cohorts(row: Any) -> list[dict]:
    if not row:
        return _empty_cohorts()
    total = int(row.get("total_leads") or 0)
    cohort_defs = [
        ("under_1d", "< 1 дня", "< 1 kun", "c_under_1d"),
        ("2_3d", "2–3 дня", "2–3 kun", "c_2_3d"),
        ("4_7d", "4–7 дней", "4–7 kun", "c_4_7d"),
        ("8_14d", "8–14 дней", "8–14 kun", "c_8_14d"),
        ("15_30d", "15–30 дней", "15–30 kun", "c_15_30d"),
        ("over_30d", "> 30 дней", "> 30 kun", "c_over_30d"),
    ]
    cohorts = []
    for key, label_ru, label_uz, col in cohort_defs:
        cnt = int(row.get(col) or 0)
        share = round((cnt / total * 100.0), 1) if total > 0 else 0.0
        cohorts.append({
            "key": key,
            "label": label_ru,
            "labelUz": label_uz,
            "count": cnt,
            "share": share,
        })
    return cohorts


def _empty_cohorts() -> list[dict]:
    return [
        {"key": "under_1d", "label": "< 1 дня", "labelUz": "< 1 kun", "count": 0, "share": 0.0},
        {"key": "2_3d", "label": "2–3 дня", "labelUz": "2–3 kun", "count": 0, "share": 0.0},
        {"key": "4_7d", "label": "4–7 дней", "labelUz": "4–7 kun", "count": 0, "share": 0.0},
        {"key": "8_14d", "label": "8–14 дней", "labelUz": "8–14 kun", "count": 0, "share": 0.0},
        {"key": "15_30d", "label": "15–30 дней", "labelUz": "15–30 kun", "count": 0, "share": 0.0},
        {"key": "over_30d", "label": "> 30 дней", "labelUz": "> 30 kun", "count": 0, "share": 0.0},
    ]


def _empty_won_stats() -> dict:
    return {
        "total": 0,
        "avgDays": 0.0,
        "medianDays": 0.0,
        "cohorts": _empty_cohorts(),
        "stagesTime": [],
    }


def _empty_lost_stats() -> dict:
    return {
        "total": 0,
        "avgDays": 0.0,
        "medianDays": 0.0,
        "cohorts": _empty_cohorts(),
        "stagesTimeBeforeLoss": [],
    }



def get_pipelines(account_id: int, user: dict):
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


def get_tags(account_id: int, user: dict):
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


def get_managers(account_id: int, user: dict):
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


def get_stages_stats(
    pipeline_id: int,
    tag_ids: list[int],
    status: str | None,
    manager_ids: list[int],
    date_from: str | None,
    date_to: str | None,
    user: dict,
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

        status_totals_sql = text(f"""
            SELECT l.status, COUNT(l.id) AS cnt
            FROM leads l
            WHERE l.pipeline_id = :pipe_id
              AND l.status IN ('won', 'lost')
              {filter_clause}
            GROUP BY l.status
        """)
        status_totals = {
            r["status"]: r["cnt"]
            for r in conn.execute(status_totals_sql, params).mappings().all()
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
            s_ext = str(s["externalId"])
            st = stats_map.get(s_id, {})
            avg_actual = float(st["avg_duration"]) if st.get("avg_duration") is not None else None
            if s_ext == "142":
                active_cnt = int(status_totals.get("won") or 0)
                passed_cnt = int(status_totals.get("won") or 0)
            elif s_ext == "143":
                active_cnt = int(status_totals.get("lost") or 0)
                passed_cnt = int(status_totals.get("lost") or 0)
            else:
                active_cnt = int(active_map.get(s_id) or 0)
                passed_cnt = int(st.get("passed_leads_count") or 0)

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

        # Won & Lost Cycle Cohorts
        cohorts_sql = text(f"""
            SELECT
                l.status,
                COUNT(*) AS total_leads,
                ROUND(AVG(EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0)::numeric, 1) AS avg_days,
                ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0)::numeric, 1) AS median_days,
                COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 <= 1) AS c_under_1d,
                COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 > 1 AND EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 <= 3) AS c_2_3d,
                COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 > 3 AND EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 <= 7) AS c_4_7d,
                COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 > 7 AND EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 <= 14) AS c_8_14d,
                COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 > 14 AND EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 <= 30) AS c_15_30d,
                COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 > 30) AS c_over_30d
            FROM leads l
            WHERE l.pipeline_id = :pipe_id
              AND l.status IN ('won', 'lost')
              AND l.crm_closed_at IS NOT NULL
              AND l.crm_created_at IS NOT NULL
              AND l.crm_closed_at >= l.crm_created_at
              {filter_clause}
            GROUP BY l.status
        """)
        cohorts_rows = conn.execute(cohorts_sql, params).mappings().all()
        cohorts_by_status = {r["status"]: r for r in cohorts_rows}

        # Stage durations for won leads
        won_stages_sql = text(f"""
            SELECT
                s.id AS stage_id,
                s.name AS stage_name,
                COUNT(DISTINCT h.lead_id) AS won_leads_count,
                ROUND(AVG(h.duration_seconds)::numeric, 0) AS avg_seconds
            FROM lead_stage_history h
            JOIN leads l ON l.id = h.lead_id
            JOIN stages s ON s.id = h.stage_id
            WHERE l.pipeline_id = :pipe_id
              AND s.pipeline_id = :pipe_id
              AND l.status = 'won'
              AND h.duration_seconds IS NOT NULL
              AND s.is_archived = false
              AND s.external_id NOT IN ('142', '143')
              {filter_clause}
            GROUP BY s.id, s.name, s.sort_order
            ORDER BY s.sort_order ASC, s.id ASC
        """)
        won_stages_rows = conn.execute(won_stages_sql, params).mappings().all()
        won_stages_time = [
            {
                "stageId": r["stage_id"],
                "stageName": r["stage_name"],
                "leadsCount": int(r["won_leads_count"] or 0),
                "avgSeconds": int(r["avg_seconds"] or 0),
                "avgDays": round(float(r["avg_seconds"] or 0) / 86400.0, 1),
            }
            for r in won_stages_rows
        ]

        # Stage time before loss for lost leads
        lost_stages_sql = text(f"""
            WITH last_stages AS (
                SELECT
                    h.stage_id,
                    s.name AS stage_name,
                    h.duration_seconds,
                    ROW_NUMBER() OVER (PARTITION BY l.id ORDER BY h.id DESC) AS rn
                FROM leads l
                JOIN lead_stage_history h ON h.lead_id = l.id
                JOIN stages s ON s.id = h.stage_id
                WHERE l.pipeline_id = :pipe_id
                  AND s.pipeline_id = :pipe_id
                  AND l.status = 'lost'
                  AND s.is_archived = false
                  AND s.external_id NOT IN ('142', '143')
                  {filter_clause}
            )
            SELECT
                stage_id,
                stage_name,
                COUNT(*) AS dropped_count,
                ROUND(AVG(duration_seconds)::numeric, 0) AS avg_seconds
            FROM last_stages
            WHERE rn = 1
            GROUP BY stage_id, stage_name
            ORDER BY dropped_count DESC
            LIMIT 10
        """)
        lost_stages_rows = conn.execute(lost_stages_sql, params).mappings().all()
        lost_total_count = int(cohorts_by_status.get("lost", {}).get("total_leads") or 0)
        lost_stages_time = [
            {
                "stageId": r["stage_id"],
                "stageName": r["stage_name"],
                "droppedCount": int(r["dropped_count"] or 0),
                "avgSeconds": int(r["avg_seconds"] or 0),
                "avgDays": round(float(r["avg_seconds"] or 0) / 86400.0, 1),
                "share": round(int(r["dropped_count"] or 0) / lost_total_count * 100.0, 1) if lost_total_count > 0 else 0.0,
            }
            for r in lost_stages_rows
        ]

        won_row = cohorts_by_status.get("won")
        won_stats = {
            "total": int(won_row["total_leads"]) if won_row else 0,
            "avgDays": float(won_row["avg_days"]) if won_row and won_row["avg_days"] is not None else 0.0,
            "medianDays": float(won_row["median_days"]) if won_row and won_row["median_days"] is not None else 0.0,
            "cohorts": _format_cohorts(won_row) if won_row else _empty_cohorts(),
            "stagesTime": won_stages_time,
        }

        lost_row = cohorts_by_status.get("lost")
        lost_stats = {
            "total": int(lost_row["total_leads"]) if lost_row else 0,
            "avgDays": float(lost_row["avg_days"]) if lost_row and lost_row["avg_days"] is not None else 0.0,
            "medianDays": float(lost_row["median_days"]) if lost_row and lost_row["median_days"] is not None else 0.0,
            "cohorts": _format_cohorts(lost_row) if lost_row else _empty_cohorts(),
            "stagesTimeBeforeLoss": lost_stages_time,
        }

        return {
            **freshness,
            "items": items,
            "wonStats": won_stats,
            "lostStats": lost_stats,
        }



def get_all_pipelines_stages_stats(
    account_id: int,
    tag_ids: list[int],
    status: str | None,
    manager_ids: list[int],
    date_from: str | None,
    date_to: str | None,
    user: dict,
):
    check_account_access(user, account_id)
    with sync_engine.connect() as conn:
        freshness = get_data_freshness(conn, account_id)

        filter_clause, filter_params = build_filter_clauses(
            tag_ids, status, manager_ids, date_from, date_to
        )

        stages_sql = text("""
            SELECT
                p.id AS "pipelineId",
                p.name AS "pipelineName",
                s.id AS "stageId",
                s.external_id AS "externalId",
                s.name AS "stageName",
                s.sort_order AS "sortOrder"
            FROM stages s
            JOIN pipelines p ON p.id = s.pipeline_id
            WHERE p.account_id = :acc_id
              AND p.is_archived = false
              AND s.is_archived = false
            ORDER BY p.id ASC, s.sort_order ASC, s.id ASC
        """)
        stage_rows = conn.execute(stages_sql, {"acc_id": account_id}).mappings().all()

        if not stage_rows:
            return {**freshness, "pipelines": []}

        stats_sql = text(f"""
            SELECT
                h.stage_id,
                AVG(h.duration_seconds)::numeric(12,2) AS avg_duration,
                COUNT(DISTINCT h.lead_id) AS passed_leads_count
            FROM lead_stage_history h
            JOIN leads l ON l.id = h.lead_id
            WHERE l.account_id = :acc_id
              AND h.duration_seconds IS NOT NULL
              {filter_clause}
            GROUP BY h.stage_id
        """)
        params = {"acc_id": account_id, **filter_params}
        stats_map = {
            r["stage_id"]: r
            for r in conn.execute(stats_sql, params).mappings().all()
        }

        status_totals_sql = text(f"""
            SELECT l.pipeline_id, l.status, COUNT(l.id) AS cnt
            FROM leads l
            WHERE l.account_id = :acc_id
              AND l.status IN ('won', 'lost')
              {filter_clause}
            GROUP BY l.pipeline_id, l.status
        """)
        status_totals = {
            (r["pipeline_id"], r["status"]): r["cnt"]
            for r in conn.execute(status_totals_sql, params).mappings().all()
        }

        active_sql = text(f"""
            SELECT l.current_stage_id, COUNT(l.id) AS active_leads_count
            FROM leads l
            WHERE l.account_id = :acc_id
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
            WHERE l.account_id = :acc_id
              {filter_clause}
            GROUP BY s.skipped_stage_id
        """)
        skips_map = {
            r["skipped_stage_id"]: r["skips_count"]
            for r in conn.execute(skips_sql, params).mappings().all()
        }

        # Won & Lost Cycle Cohorts for all pipelines
        cohorts_sql = text(f"""
            SELECT
                l.pipeline_id,
                l.status,
                COUNT(*) AS total_leads,
                ROUND(AVG(EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0)::numeric, 1) AS avg_days,
                ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0)::numeric, 1) AS median_days,
                COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 <= 1) AS c_under_1d,
                COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 > 1 AND EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 <= 3) AS c_2_3d,
                COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 > 3 AND EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 <= 7) AS c_4_7d,
                COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 > 7 AND EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 <= 14) AS c_8_14d,
                COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 > 14 AND EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 <= 30) AS c_15_30d,
                COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at)) / 86400.0 > 30) AS c_over_30d
            FROM leads l
            WHERE l.account_id = :acc_id
              AND l.status IN ('won', 'lost')
              AND l.crm_closed_at IS NOT NULL
              AND l.crm_created_at IS NOT NULL
              AND l.crm_closed_at >= l.crm_created_at
              {filter_clause}
            GROUP BY l.pipeline_id, l.status
        """)
        cohorts_rows = conn.execute(cohorts_sql, params).mappings().all()
        cohorts_by_pipe_status = {(r["pipeline_id"], r["status"]): r for r in cohorts_rows}

        # Stage durations for won leads across pipelines
        won_stages_sql = text(f"""
            SELECT
                l.pipeline_id,
                s.id AS stage_id,
                s.name AS stage_name,
                COUNT(DISTINCT h.lead_id) AS won_leads_count,
                ROUND(AVG(h.duration_seconds)::numeric, 0) AS avg_seconds
            FROM lead_stage_history h
            JOIN leads l ON l.id = h.lead_id
            JOIN stages s ON s.id = h.stage_id
            WHERE l.account_id = :acc_id
              AND s.pipeline_id = l.pipeline_id
              AND l.status = 'won'
              AND h.duration_seconds IS NOT NULL
              AND s.is_archived = false
              AND s.external_id NOT IN ('142', '143')
              {filter_clause}
            GROUP BY l.pipeline_id, s.id, s.name, s.sort_order
            ORDER BY l.pipeline_id ASC, s.sort_order ASC, s.id ASC
        """)
        won_stages_by_pipe: dict[int, list[dict]] = defaultdict(list)
        for r in conn.execute(won_stages_sql, params).mappings().all():
            won_stages_by_pipe[r["pipeline_id"]].append({
                "stageId": r["stage_id"],
                "stageName": r["stage_name"],
                "leadsCount": int(r["won_leads_count"] or 0),
                "avgSeconds": int(r["avg_seconds"] or 0),
                "avgDays": round(float(r["avg_seconds"] or 0) / 86400.0, 1),
            })

        # Stage time before loss for lost leads across pipelines
        lost_stages_sql = text(f"""
            WITH last_stages AS (
                SELECT
                    l.pipeline_id,
                    h.stage_id,
                    s.name AS stage_name,
                    h.duration_seconds,
                    ROW_NUMBER() OVER (PARTITION BY l.id ORDER BY h.id DESC) AS rn
                FROM leads l
                JOIN lead_stage_history h ON h.lead_id = l.id
                JOIN stages s ON s.id = h.stage_id
                WHERE l.account_id = :acc_id
                  AND s.pipeline_id = l.pipeline_id
                  AND l.status = 'lost'
                  AND s.is_archived = false
                  AND s.external_id NOT IN ('142', '143')
                  {filter_clause}
            )
            SELECT
                pipeline_id,
                stage_id,
                stage_name,
                COUNT(*) AS dropped_count,
                ROUND(AVG(duration_seconds)::numeric, 0) AS avg_seconds
            FROM last_stages
            WHERE rn = 1
            GROUP BY pipeline_id, stage_id, stage_name
            ORDER BY pipeline_id ASC, dropped_count DESC
        """)
        lost_stages_by_pipe: dict[int, list[dict]] = defaultdict(list)
        for r in conn.execute(lost_stages_sql, params).mappings().all():
            p_id = r["pipeline_id"]
            p_lost_total = int(cohorts_by_pipe_status.get((p_id, "lost"), {}).get("total_leads") or 0)
            if len(lost_stages_by_pipe[p_id]) < 10:
                lost_stages_by_pipe[p_id].append({
                    "stageId": r["stage_id"],
                    "stageName": r["stage_name"],
                    "droppedCount": int(r["dropped_count"] or 0),
                    "avgSeconds": int(r["avg_seconds"] or 0),
                    "avgDays": round(float(r["avg_seconds"] or 0) / 86400.0, 1),
                    "share": round(int(r["dropped_count"] or 0) / p_lost_total * 100.0, 1) if p_lost_total > 0 else 0.0,
                })

        pipelines_map = {}
        for r in stage_rows:
            p_id = r["pipelineId"]
            if p_id not in pipelines_map:
                pipelines_map[p_id] = {
                    "pipelineId": p_id,
                    "pipelineName": r["pipelineName"],
                    "totalPassedLeads": 0,
                    "totalActiveLeads": 0,
                    "items": [],
                }

            s_id = r["stageId"]
            s_ext = str(r["externalId"])
            st = stats_map.get(s_id, {})
            avg_actual = float(st["avg_duration"]) if st.get("avg_duration") is not None else None
            if s_ext == "142":
                active_cnt = int(status_totals.get((p_id, "won")) or 0)
                passed_cnt = int(status_totals.get((p_id, "won")) or 0)
            elif s_ext == "143":
                active_cnt = int(status_totals.get((p_id, "lost")) or 0)
                passed_cnt = int(status_totals.get((p_id, "lost")) or 0)
            else:
                active_cnt = int(active_map.get(s_id) or 0)
                passed_cnt = int(st.get("passed_leads_count") or 0)

            skips_cnt = int(skips_map.get(s_id) or 0)

            total_including_skips = passed_cnt + skips_cnt
            if total_including_skips > 0 and avg_actual is not None:
                avg_skips = round((avg_actual * passed_cnt) / total_including_skips, 2)
            else:
                avg_skips = avg_actual

            pipelines_map[p_id]["totalPassedLeads"] += passed_cnt
            if s_ext not in ("142", "143"):
                pipelines_map[p_id]["totalActiveLeads"] += active_cnt
            pipelines_map[p_id]["items"].append({
                "stageId": s_id,
                "externalId": r["externalId"],
                "name": r["stageName"],
                "avgSecondsActual": avg_actual,
                "avgSecondsIncludingSkips": avg_skips,
                "skipsCount": skips_cnt,
                "leadsCount": passed_cnt,
                "activeLeadsCount": active_cnt,
            })

        for p_id, p_data in pipelines_map.items():
            won_row = cohorts_by_pipe_status.get((p_id, "won"))
            p_data["wonStats"] = {
                "total": int(won_row["total_leads"]) if won_row else 0,
                "avgDays": float(won_row["avg_days"]) if won_row and won_row["avg_days"] is not None else 0.0,
                "medianDays": float(won_row["median_days"]) if won_row and won_row["median_days"] is not None else 0.0,
                "cohorts": _format_cohorts(won_row) if won_row else _empty_cohorts(),
                "stagesTime": won_stages_by_pipe.get(p_id, []),
            }
            lost_row = cohorts_by_pipe_status.get((p_id, "lost"))
            p_data["lostStats"] = {
                "total": int(lost_row["total_leads"]) if lost_row else 0,
                "avgDays": float(lost_row["avg_days"]) if lost_row and lost_row["avg_days"] is not None else 0.0,
                "medianDays": float(lost_row["median_days"]) if lost_row and lost_row["median_days"] is not None else 0.0,
                "cohorts": _format_cohorts(lost_row) if lost_row else _empty_cohorts(),
                "stagesTimeBeforeLoss": lost_stages_by_pipe.get(p_id, []),
            }

        return {
            **freshness,
            "pipelines": list(pipelines_map.values()),
        }


def get_stage_leads(
    stage_id: int,
    tag_ids: list[int],
    status: str | None,
    manager_ids: list[int],
    date_from: str | None,
    date_to: str | None,
    limit: int,
    offset: int,
    user: dict,
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

        stage_ext_id = str(stage["external_id"])
        if stage_ext_id == "142":
            stage_condition = "l.pipeline_id = :pipe_id AND l.status = 'won'"
        elif stage_ext_id == "143":
            stage_condition = "l.pipeline_id = :pipe_id AND l.status = 'lost'"
        else:
            stage_condition = "l.current_stage_id = :stage_id AND l.status = 'open'"

        sql = text(f"""
            SELECT
                l.id,
                l.external_id,
                l.external_id AS "externalId",
                l.name,
                l.status,
                l.price,
                l.crm_created_at,
                l.crm_created_at AS "crmCreatedAt",
                u.name AS "managerName",
                u.name AS responsible_name,
                COALESCE(h.entered_at, l.crm_created_at) AS entered_at,
                COALESCE(h.entered_at, l.crm_created_at) AS "enteredAt",
                h.exited_at,
                h.exited_at AS "exitedAt",
                h.duration_seconds,
                h.duration_seconds AS "durationSeconds"
            FROM leads l
            LEFT JOIN LATERAL (
                SELECT entered_at, exited_at, duration_seconds
                FROM lead_stage_history
                WHERE lead_id = l.id AND stage_id = :stage_id
                ORDER BY entered_at DESC
                LIMIT 1
            ) h ON true
            LEFT JOIN amo_users u ON u.id = l.responsible_user_id
            WHERE {stage_condition}
              {filter_clause}
            ORDER BY COALESCE(h.entered_at, l.crm_created_at) DESC
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

        count_sql = text(f"""
            SELECT COUNT(*)
            FROM leads l
            WHERE {stage_condition}
              {filter_clause}
        """)
        total = conn.execute(count_sql, {
            "stage_id": stage_id,
            "pipe_id": stage["pipeline_id"],
            **filter_params,
        }).scalar() or 0

        items = []
        for r in rows:
            d = dict(r)
            d["price"] = float(d["price"]) if d.get("price") is not None else None
            crm_iso = d["crm_created_at"].isoformat() if d.get("crm_created_at") else None
            d["crm_created_at"] = crm_iso
            d["crmCreatedAt"] = crm_iso
            entered_iso = d["entered_at"].isoformat() if d.get("entered_at") else None
            d["entered_at"] = entered_iso
            d["enteredAt"] = entered_iso
            exited_iso = d["exited_at"].isoformat() if d.get("exited_at") else None
            d["exited_at"] = exited_iso
            d["exitedAt"] = exited_iso
            items.append(d)

        return {
            "items": items,
            "total": total,
            "stage": {
                "id": stage["id"],
                "name": stage["name"],
                "externalId": stage["external_id"],
                "pipelineId": stage["pipeline_id"],
            },
        }


def get_lead_history(lead_id: int, user: dict):
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
                h.stage_id,
                h.stage_id AS "stageId",
                s.name AS stage_name,
                s.name AS "stageName",
                h.entered_at,
                h.entered_at AS "enteredAt",
                h.exited_at,
                h.exited_at AS "exitedAt",
                h.duration_seconds,
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
            entered_iso = d["entered_at"].isoformat() if d.get("entered_at") else None
            exited_iso = d["exited_at"].isoformat() if d.get("exited_at") else None
            d["entered_at"] = entered_iso
            d["enteredAt"] = entered_iso
            d["exited_at"] = exited_iso
            d["exitedAt"] = exited_iso
            h_items.append(d)

        # Skips
        skips_sql = text("""
            SELECT
                s.id,
                s.transition_at,
                s.transition_at AS "transitionAt",
                s.direction,
                s_from.name AS from_stage_name,
                s_from.name AS "fromStageName",
                s_to.name AS to_stage_name,
                s_to.name AS "toStageName",
                s_skip.name AS skipped_stage_name,
                s_skip.name AS "skippedStageName"
            FROM lead_stage_skips s
            LEFT JOIN stages s_from ON s_from.id = s.from_stage_id
            LEFT JOIN stages s_to ON s_to.id = s.to_stage_id
            LEFT JOIN stages s_skip ON s_skip.id = s.skipped_stage_id
            WHERE s.lead_id = :lead_id
            ORDER BY s.transition_at ASC
        """)
        s_rows = conn.execute(skips_sql, {"lead_id": lead_id}).mappings().all()
        skips_items = []
        for r in s_rows:
            d = dict(r)
            trans_iso = d["transition_at"].isoformat() if d.get("transition_at") else None
            d["transition_at"] = trans_iso
            d["transitionAt"] = trans_iso
            skips_items.append(d)

        # Tags
        tags_sql = text("""
            SELECT t.id, t.name, t.external_id
            FROM tags t
            JOIN lead_tags lt ON lt.tag_id = t.id
            WHERE lt.lead_id = :lead_id
            ORDER BY t.name ASC
        """)
        t_rows = conn.execute(tags_sql, {"lead_id": lead_id}).mappings().all()
        lead_tags = [
            {
                "tagId": r["id"],
                "tag_id": r["id"],
                "id": r["id"],
                "name": r["name"],
                "tag": {"id": r["id"], "name": r["name"], "external_id": r["external_id"]},
            }
            for r in t_rows
        ]

        lead_created_iso = lead["crm_created_at"].isoformat() if lead.get("crm_created_at") else None
        manager_name = lead.get("manager_name")

        return {
            "lead": {
                "id": lead["id"],
                "external_id": lead["external_id"],
                "externalId": lead["external_id"],
                "name": lead["name"],
                "status": lead["status"],
                "price": float(lead["price"]) if lead.get("price") is not None else None,
                "crm_created_at": lead_created_iso,
                "crmCreatedAt": lead_created_iso,
                "pipeline_name": lead["pipeline_name"],
                "pipelineName": lead["pipeline_name"],
                "manager_name": manager_name,
                "managerName": manager_name,
                "responsible_name": manager_name,
                "responsibleName": manager_name,
                "responsibleUser": {"name": manager_name} if manager_name else None,
                "leadTags": lead_tags,
                "tags": lead_tags,
            },
            "history": h_items,
            "skips": skips_items,
        }


def get_lead_skips(lead_id: int, user: dict):
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
                s.transition_at,
                s.transition_at AS "transitionAt",
                s.direction,
                s_from.name AS from_stage_name,
                s_from.name AS "fromStageName",
                s_to.name AS to_stage_name,
                s_to.name AS "toStageName",
                s_skip.name AS skipped_stage_name,
                s_skip.name AS "skippedStageName"
            FROM lead_stage_skips s
            LEFT JOIN stages s_from ON s_from.id = s.from_stage_id
            LEFT JOIN stages s_to ON s_to.id = s.to_stage_id
            LEFT JOIN stages s_skip ON s_skip.id = s.skipped_stage_id
            WHERE s.lead_id = :lead_id
            ORDER BY s.transition_at ASC
        """)
        rows = conn.execute(sql, {"lead_id": lead_id}).mappings().all()
        items = []
        for r in rows:
            d = dict(r)
            trans_iso = d["transition_at"].isoformat() if d.get("transition_at") else None
            d["transition_at"] = trans_iso
            d["transitionAt"] = trans_iso
            items.append(d)
        return {"items": items}


def search_leads(
    account_id: int,
    q: str,
    page: int,
    per_page: int,
    manager_ids: list[int],
    tag_ids: list[int],
    status: str | None,
    date_from: str | None,
    date_to: str | None,
    user: dict,
):
    check_account_access(user, account_id)
    with sync_engine.connect() as conn:
        where_parts = ["l.account_id = :acc_id"]
        params: dict[str, Any] = {"acc_id": account_id}

        clean_q = q.strip()
        if clean_q:
            if clean_q.isdigit():
                where_parts.append("(l.external_id = :ext_id OR l.name ILIKE :q_like)")
                params["ext_id"] = int(clean_q)
                params["q_like"] = f"%{clean_q}%"
            else:
                where_parts.append("l.name ILIKE :q_like")
                params["q_like"] = f"%{clean_q}%"

        filter_clause, filter_params = build_filter_clauses(
            tag_ids, status, manager_ids, date_from, date_to
        )
        if filter_clause:
            where_parts.append(filter_clause.removeprefix("AND ").strip())
            params.update(filter_params)

        where_sql = " AND ".join(where_parts)
        offset = (page - 1) * per_page
        params["limit"] = per_page
        params["offset"] = offset

        count_sql = text(f"SELECT COUNT(*) FROM leads l WHERE {where_sql}")
        total = conn.execute(count_sql, params).scalar() or 0

        leads_sql = text(f"""
            SELECT
                l.id,
                l.external_id,
                l.external_id AS "externalId",
                l.name,
                l.status,
                l.price,
                l.crm_created_at,
                l.crm_created_at AS "crmCreatedAt",
                s.name AS stage_name,
                s.name AS "stageName",
                u.name AS manager_name,
                u.name AS "managerName",
                u.name AS responsible_name,
                u.name AS "responsibleName"
            FROM leads l
            LEFT JOIN stages s ON s.id = l.current_stage_id
            LEFT JOIN amo_users u ON u.id = l.responsible_user_id
            WHERE {where_sql}
            ORDER BY l.crm_created_at DESC
            LIMIT :limit OFFSET :offset
        """)
        rows = conn.execute(leads_sql, params).mappings().all()

        items = []
        for r in rows:
            d = dict(r)
            d["price"] = float(d["price"]) if d.get("price") is not None else None
            crm_iso = d["crm_created_at"].isoformat() if d.get("crm_created_at") else None
            d["crm_created_at"] = crm_iso
            d["crmCreatedAt"] = crm_iso
            items.append(d)

        return {
            "items": items,
            "total": total,
            "page": page,
            "perPage": per_page,
        }
