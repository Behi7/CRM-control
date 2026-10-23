import asyncio
import logging
import httpx
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc, update, case
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm.attributes import flag_modified

from app.core.database import AsyncSessionLocal
from app.models import (
    Account, Lead, Pipeline, Stage, AmoUser, Tag, LeadTag,
    LeadStageHistory, LeadStageSkip, QcCallEvaluation, DealAnomalyAudit, LeadTask
)
from app.core.security import decrypt_token
from app.modules.anomaly_deals.schemas import (
    AnomalyStatsDto, AnomalyManagerStatDto, AnomalyDealListItemDto, AnomalyDealListResponseDto,
    DealForensicDetailDto, TimelineStageDto, CallEvaluationSummaryDto, LeadTaskSummaryDto
)
from app.modules.anomaly_deals.engine import (
    calculate_stage_benchmarks, audit_lead_math, generate_ai_forensic_verdict
)

logger = logging.getLogger("AnomalyService")


def parse_date_param(d_str: Optional[str], is_end: bool = False) -> Optional[datetime]:
    if not d_str:
        return None
    d_clean = d_str.strip()
    if not d_clean:
        return None
    try:
        if "T" in d_clean:
            dt = datetime.fromisoformat(d_clean.replace("Z", "+00:00"))
        else:
            time_part = "23:59:59+00:00" if is_end else "00:00:00+00:00"
            dt = datetime.fromisoformat(f"{d_clean}T{time_part}")
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def parse_ids_list(ids_str: Optional[str]) -> List[int]:
    if not ids_str:
        return []
    res = []
    for x in ids_str.split(","):
        x = x.strip()
        if x.isdigit():
            res.append(int(x))
    return res


async def get_anomaly_stats(
    session: AsyncSession,
    account_id: int,
    pipeline_id: Optional[int] = None,
    managers: Optional[str] = None,
    manager_id: Optional[int] = None,
    tags: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> AnomalyStatsDto:
    """Возвращает сводные KPI потерь и сливов для РОПа с учетом фильтров."""
    m_ids = parse_ids_list(managers)
    if not m_ids and manager_id:
        m_ids = [manager_id]
    t_ids = parse_ids_list(tags)
    d_from = parse_date_param(date_from, is_end=False)
    d_to = parse_date_param(date_to, is_end=True)

    lead_filters = [Lead.account_id == account_id, Lead.status == "lost"]
    audit_filters = [DealAnomalyAudit.account_id == account_id]

    if pipeline_id:
        lead_filters.append(Lead.pipeline_id == pipeline_id)
        audit_filters.append(DealAnomalyAudit.pipeline_id == pipeline_id)

    if m_ids:
        lead_filters.append(Lead.responsible_user_id.in_(m_ids))
        audit_filters.append(DealAnomalyAudit.responsible_user_id.in_(m_ids))

    if t_ids:
        tag_subq = select(LeadTag.lead_id).where(LeadTag.tag_id.in_(t_ids))
        lead_filters.append(Lead.id.in_(tag_subq))
        audit_filters.append(DealAnomalyAudit.lead_id.in_(tag_subq))

    if d_from:
        lead_filters.append(func.coalesce(Lead.crm_closed_at, Lead.crm_created_at) >= d_from)
        audit_filters.append(func.coalesce(Lead.crm_closed_at, DealAnomalyAudit.created_at) >= d_from)
    if d_to:
        lead_filters.append(func.coalesce(Lead.crm_closed_at, Lead.crm_created_at) <= d_to)
        audit_filters.append(func.coalesce(Lead.crm_closed_at, DealAnomalyAudit.created_at) <= d_to)

    # 1. Общее количество закрытых в отказ сделок
    lost_count_stmt = select(func.count(Lead.id)).where(and_(*lead_filters))
    total_lost = (await session.execute(lost_count_stmt)).scalar() or 0

    # 2. Количество проаудированных
    audits_count_stmt = (
        select(func.count(DealAnomalyAudit.id))
        .join(Lead, DealAnomalyAudit.lead_id == Lead.id)
        .where(and_(*audit_filters))
    )
    total_audited = (await session.execute(audits_count_stmt)).scalar() or 0

    # 3. Критические сливы
    crit_stmt = (
        select(
            func.count(DealAnomalyAudit.id),
            func.coalesce(func.sum(Lead.price), 0)
        )
        .join(Lead, DealAnomalyAudit.lead_id == Lead.id)
        .where(
            and_(
                *audit_filters,
                DealAnomalyAudit.anomaly_level == "critical"
            )
        )
    )
    crit_res = (await session.execute(crit_stmt)).one_or_none()
    crit_count = crit_res[0] if crit_res else 0
    crit_budget = float(crit_res[1]) if crit_res else 0.0

    crit_pct = round((crit_count / total_audited * 100), 1) if total_audited > 0 else 0.0

    # 4. Топ заявленных причин (отмазки менеджеров)
    stated_reasons_stmt = (
        select(
            func.coalesce(DealAnomalyAudit.stated_loss_reason, "Не указана").label("reason"),
            func.count(DealAnomalyAudit.id).label("cnt"),
            func.coalesce(func.sum(Lead.price), 0).label("budget")
        )
        .join(Lead, DealAnomalyAudit.lead_id == Lead.id)
        .where(and_(*audit_filters))
        .group_by("reason")
        .order_by(desc("cnt"))
        .limit(5)
    )
    stated_rows = (await session.execute(stated_reasons_stmt)).all()
    top_stated = [
        {"reason": r[0], "count": r[1], "budget": float(r[2])}
        for r in stated_rows
    ]

    # 5. Топ реальных причин (выявленных ИИ/алгоритмом)
    real_reasons_stmt = (
        select(
            func.coalesce(DealAnomalyAudit.real_loss_reason, "Не определена").label("reason"),
            func.count(DealAnomalyAudit.id).label("cnt"),
            func.coalesce(func.sum(Lead.price), 0).label("budget")
        )
        .join(Lead, DealAnomalyAudit.lead_id == Lead.id)
        .where(
            and_(
                *audit_filters,
                DealAnomalyAudit.anomaly_level.in_(["critical", "warning"])
            )
        )
        .group_by("reason")
        .order_by(desc("cnt"))
        .limit(5)
    )
    real_rows = (await session.execute(real_reasons_stmt)).all()
    top_real = [
        {"reason": r[0], "count": r[1], "budget": float(r[2])}
        for r in real_rows
    ]

    # 6. Топ менеджеров по слитому бюджету
    managers_stmt = (
        select(
            AmoUser.name,
            func.count(DealAnomalyAudit.id).label("crit_count"),
            func.coalesce(func.sum(Lead.price), 0).label("lost_budget")
        )
        .join(DealAnomalyAudit, DealAnomalyAudit.responsible_user_id == AmoUser.id)
        .join(Lead, DealAnomalyAudit.lead_id == Lead.id)
        .where(
            and_(
                *audit_filters,
                DealAnomalyAudit.anomaly_level == "critical"
            )
        )
        .group_by(AmoUser.id, AmoUser.name)
        .order_by(desc("lost_budget"))
        .limit(5)
    )
    mgr_rows = (await session.execute(managers_stmt)).all()
    top_managers = [
        {"name": r[0], "criticalCount": r[1], "lostBudget": float(r[2])}
        for r in mgr_rows
    ]

    # 7. Детальная статистика по каждому менеджеру (для карточек в стиле Контроля Качества)
    lost_by_mgr_stmt = (
        select(Lead.responsible_user_id, func.count(Lead.id))
        .where(and_(*lead_filters))
        .group_by(Lead.responsible_user_id)
    )
    lost_by_mgr = dict((await session.execute(lost_by_mgr_stmt)).all())

    top_factors_stmt = (
        select(
            DealAnomalyAudit.responsible_user_id,
            func.coalesce(DealAnomalyAudit.real_loss_reason, "Нарушение регламента").label("reason"),
            func.count(DealAnomalyAudit.id).label("cnt")
        )
        .join(Lead, DealAnomalyAudit.lead_id == Lead.id)
        .where(
            and_(
                *audit_filters,
                DealAnomalyAudit.anomaly_level.in_(["critical", "warning"])
            )
        )
        .group_by(DealAnomalyAudit.responsible_user_id, "reason")
        .order_by(DealAnomalyAudit.responsible_user_id, desc("cnt"))
    )
    factor_rows = (await session.execute(top_factors_stmt)).all()
    top_factor_by_mgr: Dict[Optional[int], str] = {}
    for r in factor_rows:
        if r.responsible_user_id not in top_factor_by_mgr:
            top_factor_by_mgr[r.responsible_user_id] = r.reason

    mgr_stats_stmt = (
        select(
            DealAnomalyAudit.responsible_user_id,
            func.coalesce(AmoUser.name, "Не назначен").label("manager_name"),
            func.count(DealAnomalyAudit.id).label("audited_count"),
            func.count(case((DealAnomalyAudit.anomaly_level == "critical", 1))).label("crit_count"),
            func.count(case((DealAnomalyAudit.anomaly_level == "warning", 1))).label("warn_count"),
            func.count(case((DealAnomalyAudit.anomaly_level == "fair", 1))).label("fair_count"),
            func.coalesce(func.sum(case((DealAnomalyAudit.anomaly_level == "critical", Lead.price), else_=0)), 0).label("lost_budget"),
            func.coalesce(func.avg(DealAnomalyAudit.anomaly_score), 0).label("avg_score")
        )
        .select_from(DealAnomalyAudit)
        .join(Lead, DealAnomalyAudit.lead_id == Lead.id)
        .outerjoin(AmoUser, DealAnomalyAudit.responsible_user_id == AmoUser.id)
        .where(and_(*audit_filters))
        .group_by(DealAnomalyAudit.responsible_user_id, AmoUser.name)
        .order_by(desc("lost_budget"), desc("crit_count"))
    )
    mgr_stats_res = await session.execute(mgr_stats_stmt)
    managers_stats = []
    for row in mgr_stats_res.all():
        audited = row.audited_count or 0
        crit = row.crit_count or 0
        fair = row.fair_count or 0
        warn = row.warn_count or 0
        comp_pct = round((fair / audited * 100), 1) if audited > 0 else 0.0

        top_f = top_factor_by_mgr.get(
            row.responsible_user_id,
            "Обоснованный отказ" if fair > 0 else "—"
        )

        managers_stats.append(AnomalyManagerStatDto(
            managerId=row.responsible_user_id,
            managerName=row.manager_name or "Не назначен",
            totalLost=lost_by_mgr.get(row.responsible_user_id, audited),
            auditedCount=audited,
            criticalCount=crit,
            warningCount=warn,
            fairCount=fair,
            lostBudget=float(row.lost_budget or 0),
            avgScore=round(float(row.avg_score or 0), 1),
            compliancePercent=comp_pct,
            topFactor=top_f
        ))

    return AnomalyStatsDto(
        totalLostLeads=total_lost,
        totalAudited=total_audited,
        criticalSlippedLeads=crit_count,
        criticalLostBudget=crit_budget,
        criticalPercent=crit_pct,
        topStatedReasons=top_stated,
        topRealReasons=top_real,
        topSlipManagers=top_managers,
        managersStats=managers_stats,
    )


async def get_anomaly_deals_list(
    session: AsyncSession,
    account_id: int,
    pipeline_id: Optional[int] = None,
    responsible_user_id: Optional[int] = None,
    managers: Optional[str] = None,
    tags: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    anomaly_level: Optional[str] = None,
    min_price: Optional[float] = None,
    search: Optional[str] = None,
    sort_by: Optional[str] = "newest",
    page: int = 1,
    page_size: int = 20,
) -> AnomalyDealListResponseDto:
    """Пагинированный список аномальных сделок с фильтрацией и поиском."""
    filters = [DealAnomalyAudit.account_id == account_id]

    if pipeline_id:
        filters.append(DealAnomalyAudit.pipeline_id == pipeline_id)

    m_ids = parse_ids_list(managers)
    if not m_ids and responsible_user_id:
        m_ids = [responsible_user_id]
    if m_ids:
        filters.append(DealAnomalyAudit.responsible_user_id.in_(m_ids))

    t_ids = parse_ids_list(tags)
    if t_ids:
        tag_subq = select(LeadTag.lead_id).where(LeadTag.tag_id.in_(t_ids))
        filters.append(Lead.id.in_(tag_subq))

    d_from = parse_date_param(date_from, is_end=False)
    if d_from:
        filters.append(func.coalesce(Lead.crm_closed_at, DealAnomalyAudit.created_at) >= d_from)

    d_to = parse_date_param(date_to, is_end=True)
    if d_to:
        filters.append(func.coalesce(Lead.crm_closed_at, DealAnomalyAudit.created_at) <= d_to)

    if anomaly_level:
        filters.append(DealAnomalyAudit.anomaly_level == anomaly_level)
    if min_price:
        filters.append(Lead.price >= min_price)
    if search and search.strip():
        q = search.strip()
        search_terms = [
            Lead.name.ilike(f"%{q}%"),
            Lead.external_id.ilike(f"%{q}%"),
            AmoUser.name.ilike(f"%{q}%"),
            DealAnomalyAudit.stated_loss_reason.ilike(f"%{q}%"),
            DealAnomalyAudit.real_loss_reason.ilike(f"%{q}%"),
        ]
        if q.isdigit():
            search_terms.append(DealAnomalyAudit.lead_id == int(q))
        filters.append(or_(*search_terms))

    # Общее число
    count_stmt = (
        select(func.count(DealAnomalyAudit.id))
        .join(Lead, DealAnomalyAudit.lead_id == Lead.id)
        .outerjoin(AmoUser, DealAnomalyAudit.responsible_user_id == AmoUser.id)
        .where(and_(*filters))
    )
    total = (await session.execute(count_stmt)).scalar() or 0

    # Данные
    offset = (page - 1) * page_size
    stmt = (
        select(
            DealAnomalyAudit,
            Lead.name.label("lead_name"),
            Lead.external_id.label("lead_external_id"),
            Lead.price.label("lead_price"),
            Lead.crm_closed_at.label("lead_closed_at"),
            Pipeline.name.label("pipeline_name"),
            AmoUser.name.label("manager_name")
        )
        .join(Lead, DealAnomalyAudit.lead_id == Lead.id)
        .outerjoin(Pipeline, DealAnomalyAudit.pipeline_id == Pipeline.id)
        .outerjoin(AmoUser, DealAnomalyAudit.responsible_user_id == AmoUser.id)
        .where(and_(*filters))
        .order_by(
            *(
                [desc(DealAnomalyAudit.anomaly_score), desc(Lead.price), desc(DealAnomalyAudit.id)]
                if sort_by == "score"
                else (
                    [desc(Lead.price), desc(DealAnomalyAudit.anomaly_score), desc(DealAnomalyAudit.id)]
                    if sort_by == "price"
                    else [
                        desc(func.coalesce(DealAnomalyAudit.updated_at, DealAnomalyAudit.created_at)),
                        desc(DealAnomalyAudit.id)
                    ]
                )
            )
        )
        .offset(offset)
        .limit(page_size)
    )

    rows = (await session.execute(stmt)).all()
    items = []

    for r in rows:
        audit = r[0]
        lead_name = r[1] or f"Сделка #{audit.lead_id}"
        ext_id = r[2] or str(audit.lead_id)
        price = float(r[3] or 0)
        closed_at = r[4].isoformat() if r[4] else None
        p_name = r[5]
        mgr_name = r[6]

        breakdown = audit.score_breakdown or {}
        key_factor = breakdown.get("key_factor") or audit.real_loss_reason or "Требует проверки РОПа"
        audited_dt = audit.updated_at or audit.created_at

        items.append(
            AnomalyDealListItemDto(
                id=audit.id,
                leadId=audit.lead_id,
                leadExternalId=ext_id,
                leadName=lead_name,
                price=price,
                pipelineId=audit.pipeline_id,
                pipelineName=p_name,
                responsibleUserId=audit.responsible_user_id,
                responsibleUserName=mgr_name,
                closedAt=closed_at,
                statedLossReason=audit.stated_loss_reason,
                realLossReason=audit.real_loss_reason,
                anomalyScore=audit.anomaly_score,
                anomalyLevel=audit.anomaly_level,
                managerFault=audit.manager_fault,
                keyFactor=key_factor,
                hasAiVerdict=bool(audit.ai_verdict),
                isReviewed=audit.is_reviewed,
                auditedAt=audited_dt.isoformat() if audited_dt else None,
            )
        )

    total_pages = max(1, (total + page_size - 1) // page_size)

    return AnomalyDealListResponseDto(
        items=items,
        total=total,
        page=page,
        pageSize=page_size,
        totalPages=total_pages,
    )


async def ensure_lead_calls_synced(
    session: AsyncSession,
    account_id: int,
    lead: Lead
) -> None:
    """
    On-Demand подгрузка звонков по конкретной сделке из AmoCRM,
    если в локальной БД пока 0 звонков.
    """
    if not lead or not lead.external_id:
        return

    try:
        acc_stmt = select(Account).where(Account.id == account_id)
        acc = (await session.execute(acc_stmt)).scalar_one_or_none()
        if not acc or not acc.encrypted_token or acc.status != "connected":
            return

        token = decrypt_token(acc.encrypted_token)
        if not token:
            return

        headers = {"Authorization": f"Bearer {token}"}
        url = f"https://{acc.subdomain}.{acc.base_domain}/api/v4/leads/{lead.external_id}/notes"

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                url,
                headers=headers,
                params={"filter[note_type]": "call_in,call_out", "limit": 250}
            )
            if resp.status_code != 200 or not resp.text:
                return

            notes = resp.json().get("_embedded", {}).get("notes", [])
            if not notes:
                return

            call_notes = [n for n in notes if n.get("note_type") in ("call_in", "call_out")]
            if not call_notes:
                return

            now_utc = datetime.now(timezone.utc)
            records = []
            for n in call_notes:
                note_id = str(n.get("id"))
                params = n.get("params") or {}
                duration = int(params.get("duration") or 0)
                raw_link = params.get("link")
                link = raw_link.strip() if isinstance(raw_link, str) and raw_link.strip().startswith("http") else None
                phone = str(params.get("phone") or "")
                direction = "in" if n.get("note_type") == "call_in" else "out"
                ts = n.get("created_at") or int(now_utc.timestamp())
                call_date = datetime.fromtimestamp(ts, tz=timezone.utc)
                call_status = params.get("call_status")

                status = "skipped_historical"
                skip_reason = "Архивный звонок"
                if call_status is not None:
                    try:
                        cs_int = int(call_status)
                        if cs_int != 4:
                            status = "skipped_not_answered"
                            skip_reason = "Разговор не состоялся"
                    except (ValueError, TypeError):
                        pass
                if status != "skipped_not_answered" and not link:
                    status = "skipped_no_audio"
                    skip_reason = "Нет ссылки на аудиозапись"

                records.append({
                    "account_id": account_id,
                    "external_call_id": note_id,
                    "lead_id": lead.id,
                    "pipeline_id": lead.pipeline_id,
                    "amo_user_id": lead.responsible_user_id,
                    "phone": phone,
                    "call_direction": direction,
                    "call_date": call_date,
                    "duration_seconds": duration,
                    "recording_url": link,
                    "status": status,
                    "skip_reason": skip_reason,
                    "created_at": now_utc,
                })

            if records:
                insert_stmt = insert(QcCallEvaluation).values(records).on_conflict_do_nothing(
                    index_elements=["account_id", "external_call_id"]
                )
                await session.execute(insert_stmt)
                await session.commit()
                logger.info(f"On-demand synced {len(records)} calls for lead #{lead.id} ({lead.name})")

    except Exception as e:
        logger.warning(f"Failed on-demand call sync for lead #{lead.id}: {e}")


async def get_deal_forensic_detail(
    session: AsyncSession,
    account_id: int,
    lead_id: int,
) -> Optional[DealForensicDetailDto]:
    """Возвращает полное досье расследования по конкретной сделке."""
    # Проверяем наличие аудита
    stmt = (
        select(
            DealAnomalyAudit,
            Lead,
            Pipeline.name.label("pipeline_name"),
            AmoUser.name.label("manager_name")
        )
        .join(Lead, DealAnomalyAudit.lead_id == Lead.id)
        .outerjoin(Pipeline, DealAnomalyAudit.pipeline_id == Pipeline.id)
        .outerjoin(AmoUser, DealAnomalyAudit.responsible_user_id == AmoUser.id)
        .where(
            DealAnomalyAudit.account_id == account_id,
            DealAnomalyAudit.lead_id == lead_id
        )
    )
    row = (await session.execute(stmt)).first()

    # Если сделка еще не аудировалась — аудируем ее на лету с глубоким вердиктом ИИ!
    if not row:
        lead_stmt = select(Lead).where(Lead.account_id == account_id, Lead.id == lead_id)
        lead_obj = (await session.execute(lead_stmt)).scalar_one_or_none()
        if not lead_obj:
            return None
        acc_stmt = select(Account).where(Account.id == account_id)
        acc_obj = (await session.execute(acc_stmt)).scalar_one_or_none()
        api_k = decrypt_token(acc_obj.ai_encrypted_token) if acc_obj and acc_obj.ai_encrypted_token else None
        await run_single_deal_audit(
            session=session,
            account_id=account_id,
            lead=lead_obj,
            api_key=api_k,
            model_name=(acc_obj.anomaly_settings or {}).get("ai_model") or acc_obj.ai_model if acc_obj else "gemini-2.5-flash",
            company_context=acc_obj.ai_company_context if acc_obj else None,
            anomaly_settings=acc_obj.anomaly_settings if acc_obj else None,
            force_ai=True,
        )
        row = (await session.execute(stmt)).first()
        if not row:
            return None

    audit, lead, pipeline_name, manager_name = row[0], row[1], row[2], row[3]

    # Загружаем этапы и историю
    sh_stmt = (
        select(LeadStageHistory, Stage.name, Stage.sort_order)
        .join(Stage, LeadStageHistory.stage_id == Stage.id)
        .where(LeadStageHistory.lead_id == lead_id)
        .order_by(LeadStageHistory.entered_at.asc())
    )
    sh_rows = (await session.execute(sh_stmt)).all()

    # Загружаем бенчмарки этапов воронки
    benchmarks = await get_pipeline_stage_benchmarks(session, account_id, lead.pipeline_id)

    stages_timeline = []
    for sh, s_name, s_order in sh_rows:
        dur_hrs = round((sh.duration_seconds or 0) / 3600.0, 1)
        bench_hrs = benchmarks.get(sh.stage_id, 24.0)
        is_stag = dur_hrs > 2 * bench_hrs and dur_hrs >= 24
        stages_timeline.append(
            TimelineStageDto(
                stageId=sh.stage_id,
                stageName=s_name,
                sortOrder=s_order or 0,
                durationHours=dur_hrs,
                benchmarkHours=bench_hrs,
                isStagnant=is_stag,
                isSkipped=False,
                enteredAt=sh.entered_at.isoformat() if sh.entered_at else "",
                exitedAt=sh.exited_at.isoformat() if sh.exited_at else None,
            )
        )

    # Загружаем звонки из Quality Control
    calls_stmt = (
        select(QcCallEvaluation)
        .where(QcCallEvaluation.account_id == account_id, QcCallEvaluation.lead_id == lead_id)
        .order_by(QcCallEvaluation.call_date.asc())
    )
    calls_rows = (await session.execute(calls_stmt)).scalars().all()
    if not calls_rows:
        await ensure_lead_calls_synced(session, account_id, lead)
        calls_rows = (await session.execute(calls_stmt)).scalars().all()
    calls_summary = [
        CallEvaluationSummaryDto(
            id=c.id,
            externalCallId=c.external_call_id,
            callDate=c.call_date.isoformat(),
            durationSeconds=c.duration_seconds,
            qcScore=c.overall_score,
            errorsList=c.errors_list if isinstance(c.errors_list, list) else None,
            bottleneck=c.bottleneck,
            summary=c.summary,
        )
        for c in calls_rows
    ]

    # Загружаем задачи
    tasks_stmt = (
        select(LeadTask)
        .where(LeadTask.account_id == account_id, LeadTask.lead_id == lead_id)
        .order_by(LeadTask.task_created_at.asc())
    )
    tasks_rows = (await session.execute(tasks_stmt)).scalars().all()
    tasks_summary = [
        LeadTaskSummaryDto(
            id=t.id,
            externalTaskId=t.external_task_id,
            text=t.text,
            isCompleted=t.is_completed,
            taskCreatedAt=t.task_created_at.isoformat() if t.task_created_at else "",
            completeTill=t.complete_till.isoformat() if t.complete_till else None,
            taskClosedAt=t.task_closed_at.isoformat() if t.task_closed_at else None,
        )
        for t in tasks_rows
    ]

    return DealForensicDetailDto(
        auditId=audit.id,
        leadId=lead.id,
        leadExternalId=lead.external_id,
        leadName=lead.name or f"Сделка #{lead.id}",
        price=float(lead.price or 0),
        pipelineId=lead.pipeline_id,
        pipelineName=pipeline_name,
        responsibleUserId=lead.responsible_user_id,
        responsibleUserName=manager_name,
        crmCreatedAt=lead.crm_created_at.isoformat() if lead.crm_created_at else "",
        crmClosedAt=lead.crm_closed_at.isoformat() if lead.crm_closed_at else None,
        statedLossReason=audit.stated_loss_reason,
        realLossReason=audit.real_loss_reason,
        anomalyScore=audit.anomaly_score,
        anomalyLevel=audit.anomaly_level,
        managerFault=audit.manager_fault,
        pivotPoint=audit.pivot_point,
        forensicSummary=audit.forensic_summary,
        ropRecommendation=audit.rop_recommendation,
        scoreBreakdown=audit.score_breakdown,
        stagesTimeline=stages_timeline,
        calls=calls_summary,
        tasks=tasks_summary,
        isReviewed=audit.is_reviewed,
        auditedAt=audit.created_at.isoformat() if audit.created_at else None,
    )


async def get_pipeline_stage_benchmarks(
    session: AsyncSession,
    account_id: int,
    pipeline_id: Optional[int]
) -> Dict[int, float]:
    """Возвращает медианное время прохождения этапов для успешных сделок."""
    if not pipeline_id:
        return {}

    won_history_stmt = (
        select(LeadStageHistory)
        .join(Lead, LeadStageHistory.lead_id == Lead.id)
        .where(
            Lead.account_id == account_id,
            Lead.pipeline_id == pipeline_id,
            Lead.status == "won"
        )
    )
    won_hist = (await session.execute(won_history_stmt)).scalars().all()
    return calculate_stage_benchmarks(won_hist)


def extract_loss_reason(lead: Lead, loss_field_id: Optional[str | int] = None) -> Optional[str]:
    """Извлекает причину отказа из настроенного кастомного поля amoCRM или системного поля."""
    # 1. Сначала проверяем настроенное кастомное поле (по external_id)
    if loss_field_id and lead.custom_fields and isinstance(lead.custom_fields, list):
        target_id_str = str(loss_field_id).strip()
        for cf in lead.custom_fields:
            if isinstance(cf, dict) and str(cf.get("id")) == target_id_str:
                vals = cf.get("values")
                if vals and isinstance(vals, list) and len(vals) > 0:
                    v = vals[0]
                    if isinstance(v, dict):
                        val_str = str(v.get("value") or v.get("name") or "").strip()
                    else:
                        val_str = str(v).strip()
                    if val_str:
                        return val_str

    # 2. Если значение не найдено, пробуем автопоиск по названию поля (rad, sabab, отказ, причина)
    if lead.custom_fields and isinstance(lead.custom_fields, list):
        for cf in lead.custom_fields:
            if isinstance(cf, dict):
                cname = (cf.get("name") or "").lower()
                if any(k in cname for k in ["rad", "sabab", "отказ", "причин"]):
                    vals = cf.get("values")
                    if vals and isinstance(vals, list) and len(vals) > 0:
                        v = vals[0]
                        val_str = str(v.get("value") or v.get("name") or "") if isinstance(v, dict) else str(v)
                        if val_str.strip():
                            return val_str.strip()

    # 3. Резервный вариант — стандартное поле amoCRM loss_reason_name
    if lead.loss_reason_name and lead.loss_reason_name.strip():
        return lead.loss_reason_name.strip()

    return None


def is_reason_ignored(stated_reason: Optional[str], ignored_reasons: Optional[List[str]]) -> bool:
    """Проверяет, входит ли указанная причина отказа в список исключенных (дубли, тесты, нецелевые)."""
    if not stated_reason or not ignored_reasons:
        return False
    norm_stated = stated_reason.strip().lower()
    for ign in ignored_reasons:
        if ign and ign.strip().lower() == norm_stated:
            return True
    return False


async def run_single_deal_audit(
    session: AsyncSession,
    account_id: int,
    lead: Lead,
    benchmarks: Optional[Dict[int, float]] = None,
    api_key: Optional[str] = None,
    model_name: Optional[str] = "gemini-2.5-flash",
    company_context: Optional[str] = None,
    anomaly_settings: Optional[Dict[str, Any]] = None,
    force_ai: bool = False,
) -> DealAnomalyAudit:
    """Аудирует одну сделку (математический скоринг + вердикт ИИ)."""
    if anomaly_settings is None:
        acc_stmt = select(Account.anomaly_settings).where(Account.id == account_id)
        anomaly_settings = (await session.execute(acc_stmt)).scalar_one_or_none() or {}

    loss_field_id = anomaly_settings.get("loss_reason_field_id")
    ignored_reasons = anomaly_settings.get("ignored_reasons", [])

    stated_reason = extract_loss_reason(lead, loss_field_id)

    # Защита от дублей и технических отказов:
    # Если причина отказа входит в черный список (Dubl, sifatsiz, xodim и т.д.) —
    # мгновенно признаем сделку штатной (0 баллов), не штрафуем менеджера и не тратим токены ИИ!
    if is_reason_ignored(stated_reason, ignored_reasons):
        final_score = 0
        final_level = "fair"
        manager_guilt = "none"
        real_reason = f"Технический отказ ({stated_reason})"
        pivot = "Технический отказ / Нецелевой лид"
        summary = (
            f"Сделка закрыта с причиной отказа «{stated_reason}». "
            f"Данная причина исключена в настройках аккаунта как технический отказ/дубль. "
            f"Нарушений регламента со стороны менеджера нет."
        )
        rop_rec = "Действий РОПа не требуется. Технический отказ / дубль."
        breakdown = {
            "technical_ignored": True,
            "stated_reason": stated_reason,
            "anomaly_score": 0,
            "time_penalty": 0,
            "calls_penalty": 0,
            "skips_penalty": 0,
            "price_penalty": 0,
        }
        verdict = {
            "real_loss_reason": real_reason,
            "manager_guilt": "none",
            "pivot_point": pivot,
            "forensic_summary": summary,
            "rop_recommendation": rop_rec,
            "score_adjustment": 0,
            "technical_ignored": True,
        }

        stmt = insert(DealAnomalyAudit).values(
            account_id=account_id,
            lead_id=lead.id,
            pipeline_id=lead.pipeline_id,
            responsible_user_id=lead.responsible_user_id,
            anomaly_score=final_score,
            anomaly_level=final_level,
            manager_fault=manager_guilt,
            stated_loss_reason=stated_reason,
            real_loss_reason=real_reason,
            pivot_point=pivot,
            forensic_summary=summary,
            rop_recommendation=rop_rec,
            score_breakdown=breakdown,
            ai_verdict=verdict,
            is_reviewed=False,
            updated_at=datetime.now(timezone.utc),
        ).on_conflict_do_update(
            index_elements=["lead_id"],
            set_={
                "anomaly_score": final_score,
                "anomaly_level": final_level,
                "manager_fault": manager_guilt,
                "stated_loss_reason": stated_reason,
                "real_loss_reason": real_reason,
                "pivot_point": pivot,
                "forensic_summary": summary,
                "rop_recommendation": rop_rec,
                "score_breakdown": breakdown,
                "ai_verdict": verdict,
                "updated_at": datetime.now(timezone.utc),
            }
        ).returning(DealAnomalyAudit)

        res = await session.execute(stmt)
        await session.commit()
        return res.scalar_one()

    if benchmarks is None:
        benchmarks = await get_pipeline_stage_benchmarks(session, account_id, lead.pipeline_id)

    # Загружаем этапы
    sh_stmt = select(LeadStageHistory).where(LeadStageHistory.lead_id == lead.id).order_by(LeadStageHistory.entered_at.asc())
    stage_history = (await session.execute(sh_stmt)).scalars().all()

    # Загружаем названия этапов
    stages_stmt = select(Stage.id, Stage.name).where(Stage.pipeline_id == lead.pipeline_id) if lead.pipeline_id else None
    stage_names = {}
    if stages_stmt is not None:
        for s_id, s_name in (await session.execute(stages_stmt)).all():
            stage_names[s_id] = s_name

    # Загружаем пропуски
    skips_stmt = select(LeadStageSkip).where(LeadStageSkip.lead_id == lead.id)
    skips = (await session.execute(skips_stmt)).scalars().all()

    # Загружаем звонки
    calls_stmt = select(QcCallEvaluation).where(QcCallEvaluation.account_id == account_id, QcCallEvaluation.lead_id == lead.id)
    calls = (await session.execute(calls_stmt)).scalars().all()
    if not calls:
        await ensure_lead_calls_synced(session, account_id, lead)
        calls = (await session.execute(calls_stmt)).scalars().all()

    # Загружаем задачи по сделке
    tasks_stmt = (
        select(LeadTask)
        .where(LeadTask.account_id == account_id, LeadTask.lead_id == lead.id)
        .order_by(LeadTask.task_created_at.asc())
    )
    tasks = (await session.execute(tasks_stmt)).scalars().all()

    # Математический аудит с правилом усилий и дисциплиной задач
    audit_math = audit_lead_math(
        lead=lead,
        stage_history=stage_history,
        skips=skips,
        calls=calls,
        stage_benchmarks=benchmarks,
        stage_names=stage_names,
        tasks=tasks,
    )

    # Smart AI Cost-Saver:
    # Если математический балл < 40 (сделка без грубых нарушений / честный отказ), не тратим токены LLM!
    # Вердикт формируется эвристикой за 0ms и 0 токенов.
    # В Gemini идем только при anomaly_score >= 40 (реальные нарушения) или если force_ai=True.
    effective_api_key = api_key if (audit_math["anomaly_score"] >= 40 or force_ai) else None

    # Извлекаем содержательные инсайты из Контроля Качества (QC)
    qc_insights = []
    for c in calls:
        if c.summary or c.bottleneck or c.errors_list:
            item = {
                "date": c.call_date.strftime("%Y-%m-%d %H:%M") if c.call_date else "",
                "duration_sec": c.duration_seconds,
            }
            if c.summary:
                item["summary"] = c.summary
            if c.bottleneck:
                item["bottleneck"] = c.bottleneck
            if c.errors_list:
                item["errors"] = c.errors_list
            qc_insights.append(item)
        elif c.duration_seconds and c.duration_seconds >= 30:
            qc_insights.append({
                "date": c.call_date.strftime("%Y-%m-%d %H:%M") if c.call_date else "",
                "duration_sec": c.duration_seconds,
                "status": "Разговор состоялся, но не анализировался нейросетью в КК"
            })
        if len(qc_insights) >= 5:
            break

    custom_system_prompt = (anomaly_settings or {}).get("system_prompt")

    verdict = await generate_ai_forensic_verdict(
        stated_reason=stated_reason,
        audit_math=audit_math,
        qc_insights=qc_insights,
        api_key=effective_api_key,
        model_name=model_name,
        company_context=company_context,
        custom_system_prompt=custom_system_prompt,
    )

    # Детерминированная математика Python (корректировка балла по степени вины менеджера):
    ai_fault = verdict.get("manager_guilt") or audit_math.get("manager_fault", "medium")
    if ai_fault == "none":
        # Менеджер старался, отказ объективен со стороны клиента / внешних обстоятельств
        score_adjustment = -25
    elif ai_fault == "high":
        # Грубый обман или прямая халатность менеджера
        score_adjustment = 20
    else:
        # Средняя степень (упущение, затягивание сроков без злого умысла)
        score_adjustment = 0

    verdict["score_adjustment"] = score_adjustment
    final_score = max(0, min(100, audit_math["anomaly_score"] + score_adjustment))
    if final_score >= 80:
        final_level = "critical"
    elif final_score >= 50:
        final_level = "warning"
    else:
        final_level = "fair"

    # Сохраняем/обновляем в БД
    stmt = insert(DealAnomalyAudit).values(
        account_id=account_id,
        lead_id=lead.id,
        pipeline_id=lead.pipeline_id,
        responsible_user_id=lead.responsible_user_id,
        anomaly_score=final_score,
        anomaly_level=final_level,
        manager_fault=verdict.get("manager_guilt") or audit_math["manager_fault"],
        stated_loss_reason=stated_reason,
        real_loss_reason=verdict.get("real_loss_reason"),
        pivot_point=verdict.get("pivot_point"),
        forensic_summary=verdict.get("forensic_summary"),
        rop_recommendation=verdict.get("rop_recommendation"),
        score_breakdown=audit_math["breakdown"],
        ai_verdict=verdict,
        is_reviewed=False,
        updated_at=datetime.now(timezone.utc),
    ).on_conflict_do_update(
        index_elements=["lead_id"],
        set_={
            "anomaly_score": final_score,
            "anomaly_level": final_level,
            "manager_fault": verdict.get("manager_guilt") or audit_math["manager_fault"],
            "stated_loss_reason": stated_reason,
            "real_loss_reason": verdict.get("real_loss_reason"),
            "pivot_point": verdict.get("pivot_point"),
            "forensic_summary": verdict.get("forensic_summary"),
            "rop_recommendation": verdict.get("rop_recommendation"),
            "score_breakdown": audit_math["breakdown"],
            "ai_verdict": verdict,
            "updated_at": datetime.now(timezone.utc),
        }
    ).returning(DealAnomalyAudit)

    res = await session.execute(stmt)
    await session.commit()
    return res.scalar_one()


async def run_batch_audit(
    session: AsyncSession,
    account_id: int,
    pipeline_id: Optional[int] = None,
    limit: int = 25,
    force_reanalyze: bool = False,
) -> int:
    """Пакетный запуск аудита по закрытым в отказ сделкам (строго после бэкфила и вне периода 'Стоп')."""
    acc_stmt = select(Account).where(Account.id == account_id)
    acc = (await session.execute(acc_stmt)).scalar_one_or_none()
    if not acc:
        return 0

    # 1. Гейткипер админки: не запускаем, если интеграция выключена или на паузе ("Стоп")
    if acc.status != "connected" or acc.sync_status != "active":
        logger.info(f"Account #{account_id}: Anomaly audit skipped (sync_status={acc.sync_status}, status={acc.status})")
        return 0

    # 2. Гейткипер бэкфила: не трогаем данные, пока идет первичная историческая синхронизация
    if acc.backfill_status not in ("done", "completed"):
        logger.info(f"Account #{account_id}: Anomaly audit skipped because backfill is not completed ({acc.backfill_status})")
        return 0

    # 3. Базовый курсор времени (как в контроле качества):
    now_utc = datetime.now(timezone.utc)
    anomaly_cfg = dict(acc.anomaly_settings or {})
    cursor_str = anomaly_cfg.get("last_anomaly_audited_at")

    if not cursor_str:
        # Первичная инициализация курсора сразу после бэкфила или после нажатия "Старт" в админке.
        # Фиксируем точку отсчета на текущее время. Старый архив и период "Стоп" полностью отсекаются!
        anomaly_cfg["last_anomaly_audited_at"] = now_utc.isoformat()
        acc.anomaly_settings = anomaly_cfg
        flag_modified(acc, "anomaly_settings")
        await session.commit()
        logger.info(f"Account #{account_id}: Anomaly baseline cursor initialized to {now_utc.isoformat()}. Past archive and stop-period skipped.")
        return 0

    try:
        cursor_dt = datetime.fromisoformat(cursor_str)
        if cursor_dt.tzinfo is None:
            cursor_dt = cursor_dt.replace(tzinfo=timezone.utc)
    except Exception as e:
        logger.warning(f"Account #{account_id}: invalid cursor '{cursor_str}', resetting to now. Error: {e}")
        cursor_dt = now_utc
        anomaly_cfg["last_anomaly_audited_at"] = now_utc.isoformat()
        acc.anomaly_settings = anomaly_cfg
        flag_modified(acc, "anomaly_settings")
        await session.commit()
        return 0

    api_key = decrypt_token(acc.ai_encrypted_token) if acc.ai_encrypted_token else None
    model_name = (anomaly_cfg.get("ai_model") if anomaly_cfg else None) or acc.ai_model or "gemini-2.5-flash"
    company_context = acc.ai_company_context

    # 4. Ищем сделки со статусом lost, закрытые ПОСЛЕ курсора (строго после бэкфила и вне периода "Стоп")
    query = select(Lead).where(
        Lead.account_id == account_id,
        Lead.status == "lost",
        Lead.crm_closed_at >= cursor_dt
    )
    if pipeline_id:
        query = query.where(Lead.pipeline_id == pipeline_id)

    if not force_reanalyze:
        # Исключаем уже проаудированные
        audited_leads = select(DealAnomalyAudit.lead_id).where(DealAnomalyAudit.account_id == account_id)
        query = query.where(Lead.id.not_in(audited_leads))

    # Сортируем последовательно от более старых к новым в пределах активного окна
    query = query.order_by(Lead.crm_closed_at.asc(), Lead.id.asc()).limit(limit)
    leads = (await session.execute(query)).scalars().all()

    if not leads:
        # Все сделки в окне проаудированы — продвигаем курсор на текущее время
        anomaly_cfg["last_anomaly_audited_at"] = now_utc.isoformat()
        acc.anomaly_settings = anomaly_cfg
        flag_modified(acc, "anomaly_settings")
        await session.commit()
        return 0

    benchmarks_cache: Dict[int, Dict[int, float]] = {}
    processed_count = 0
    earliest_pending_qc_time: Optional[datetime] = None

    for lead in leads:
        # 5. Защита синхронизации с контролем качества (QC Dependency Guard):
        # Если у сделки есть звонки в статусе 'pending', пропускаем сделку и ждем завершения аудита звонков в QC!
        pending_qc_stmt = select(func.count(QcCallEvaluation.id)).where(
            QcCallEvaluation.account_id == account_id,
            QcCallEvaluation.lead_id == lead.id,
            QcCallEvaluation.status == "pending"
        )
        pending_qc_count = (await session.execute(pending_qc_stmt)).scalar() or 0
        if pending_qc_count > 0:
            logger.info(f"Lead #{lead.id} has {pending_qc_count} pending QC call(s). Waiting for QC worker before anomaly audit.")
            if lead.crm_closed_at:
                if earliest_pending_qc_time is None or lead.crm_closed_at < earliest_pending_qc_time:
                    earliest_pending_qc_time = lead.crm_closed_at
            continue

        p_id = lead.pipeline_id or 0
        if p_id not in benchmarks_cache:
            benchmarks_cache[p_id] = await get_pipeline_stage_benchmarks(session, account_id, lead.pipeline_id)

        await run_single_deal_audit(
            session=session,
            account_id=account_id,
            lead=lead,
            benchmarks=benchmarks_cache[p_id],
            api_key=api_key,
            model_name=model_name,
            company_context=company_context,
            anomaly_settings=acc.anomaly_settings,
            force_ai=False,
        )
        processed_count += 1

    # Продвижение курсора:
    # Если какие-то сделки ждали QC, курсор ставим на время самой ранней ожидающей сделки, чтобы не потерять её.
    # Если все обработаны без ожидания, сдвигаем курсор на now_utc.
    if earliest_pending_qc_time:
        anomaly_cfg["last_anomaly_audited_at"] = earliest_pending_qc_time.isoformat()
    elif processed_count > 0:
        anomaly_cfg["last_anomaly_audited_at"] = now_utc.isoformat()

    acc.anomaly_settings = anomaly_cfg
    flag_modified(acc, "anomaly_settings")
    await session.commit()

    return processed_count


async def anomaly_background_worker():
    """Фоновый воркер бэкенда для автоматического аудита аномалий по закрытым сделкам активных клиентов."""
    logger.info("🚀 Anomaly Deals Background Worker started in Backend.")
    while True:
        try:
            async with AsyncSessionLocal() as session:
                acc_stmt = select(Account.id).where(
                    Account.status == "connected",
                    Account.sync_status == "active",
                    Account.backfill_status.in_(["done", "completed"]),
                )
                acc_ids = (await session.execute(acc_stmt)).scalars().all()
                for acc_id in acc_ids:
                    try:
                        processed = await run_batch_audit(session, acc_id, limit=10)
                        if processed > 0:
                            logger.info(f"Anomaly Worker: Account #{acc_id} audited {processed} deal(s).")
                    except Exception as e:
                        logger.error(f"Anomaly Worker error for account #{acc_id}: {e}")
        except asyncio.CancelledError:
            logger.info("Anomaly Deals Background Worker stopped.")
            break
        except Exception as e:
            logger.error(f"Anomaly Deals Background Worker iteration error: {e}")

        await asyncio.sleep(30)


async def set_audit_reviewed(
    session: AsyncSession,
    account_id: int,
    lead_id: int,
    is_reviewed: bool = True
) -> bool:
    """Отмечает сделку как разобранную РОПом."""
    stmt = (
        update(DealAnomalyAudit)
        .where(
            DealAnomalyAudit.account_id == account_id,
            DealAnomalyAudit.lead_id == lead_id
        )
        .values(is_reviewed=is_reviewed, updated_at=datetime.now(timezone.utc))
    )
    res = await session.execute(stmt)
    await session.commit()
    return res.rowcount > 0
