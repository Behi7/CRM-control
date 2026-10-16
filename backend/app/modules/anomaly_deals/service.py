import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc, update
from sqlalchemy.dialects.postgresql import insert

from app.models import (
    Account, Lead, Pipeline, Stage, AmoUser,
    LeadStageHistory, LeadStageSkip, QcCallEvaluation, DealAnomalyAudit
)
from app.core.security import decrypt_token
from app.modules.anomaly_deals.schemas import (
    AnomalyStatsDto, AnomalyDealListItemDto, AnomalyDealListResponseDto,
    DealForensicDetailDto, TimelineStageDto, CallEvaluationSummaryDto
)
from app.modules.anomaly_deals.engine import (
    calculate_stage_benchmarks, audit_lead_math, generate_ai_forensic_verdict
)

logger = logging.getLogger("AnomalyService")

async def get_anomaly_stats(session: AsyncSession, account_id: int) -> AnomalyStatsDto:
    """Возвращает сводные KPI потерь и сливов для РОПа."""
    # 1. Общее количество закрытых в отказ сделок
    lost_count_stmt = select(func.count(Lead.id)).where(
        Lead.account_id == account_id,
        Lead.status == "lost"
    )
    total_lost = (await session.execute(lost_count_stmt)).scalar() or 0

    # 2. Количество проаудированных
    audits_count_stmt = select(func.count(DealAnomalyAudit.id)).where(
        DealAnomalyAudit.account_id == account_id
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
            DealAnomalyAudit.account_id == account_id,
            DealAnomalyAudit.anomaly_level == "critical"
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
        .where(DealAnomalyAudit.account_id == account_id)
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
            DealAnomalyAudit.account_id == account_id,
            DealAnomalyAudit.anomaly_level.in_(["critical", "warning"])
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
            DealAnomalyAudit.account_id == account_id,
            DealAnomalyAudit.anomaly_level == "critical"
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

    return AnomalyStatsDto(
        totalLostLeads=total_lost,
        totalAudited=total_audited,
        criticalSlippedLeads=crit_count,
        criticalLostBudget=crit_budget,
        criticalPercent=crit_pct,
        topStatedReasons=top_stated,
        topRealReasons=top_real,
        topSlipManagers=top_managers,
    )


async def get_anomaly_deals_list(
    session: AsyncSession,
    account_id: int,
    pipeline_id: Optional[int] = None,
    responsible_user_id: Optional[int] = None,
    anomaly_level: Optional[str] = None,
    min_price: Optional[float] = None,
    page: int = 1,
    page_size: int = 20,
) -> AnomalyDealListResponseDto:
    """Пагинированный список аномальных сделок с фильтрацией."""
    filters = [DealAnomalyAudit.account_id == account_id]

    if pipeline_id:
        filters.append(DealAnomalyAudit.pipeline_id == pipeline_id)
    if responsible_user_id:
        filters.append(DealAnomalyAudit.responsible_user_id == responsible_user_id)
    if anomaly_level:
        filters.append(DealAnomalyAudit.anomaly_level == anomaly_level)
    if min_price:
        filters.append(Lead.price >= min_price)

    # Общее число
    count_stmt = (
        select(func.count(DealAnomalyAudit.id))
        .join(Lead, DealAnomalyAudit.lead_id == Lead.id)
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
            desc(DealAnomalyAudit.anomaly_score),
            desc(Lead.price)
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
            model_name=acc_obj.ai_model if acc_obj else "gemini-2.5-flash",
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
        isReviewed=audit.is_reviewed,
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

    # Математический аудит с правилом усилий
    audit_math = audit_lead_math(
        lead=lead,
        stage_history=stage_history,
        skips=skips,
        calls=calls,
        stage_benchmarks=benchmarks,
        stage_names=stage_names,
    )

    # Smart AI Cost-Saver:
    # Если математический балл < 40 (сделка без грубых нарушений / честный отказ), не тратим токены LLM!
    # Вердикт формируется эвристикой за 0ms и 0 токенов.
    # В Gemini идем только при anomaly_score >= 40 (реальные нарушения) или если force_ai=True.
    effective_api_key = api_key if (audit_math["anomaly_score"] >= 40 or force_ai) else None

    # Генерация вердикта
    timeline_preview = [
        {
            "stage": stage_names.get(sh.stage_id, f"Этап #{sh.stage_id}"),
            "duration_hours": round((sh.duration_seconds or 0) / 3600.0, 1),
            "benchmark_hours": benchmarks.get(sh.stage_id, 24.0)
        }
        for sh in stage_history
    ]
    calls_preview = [
        {
            "date": c.call_date.strftime("%Y-%m-%d %H:%M") if c.call_date else "",
            "duration_sec": c.duration_seconds,
            "qc_score": c.overall_score,
            "errors": c.errors_list
        }
        for c in calls
    ]

    verdict = await generate_ai_forensic_verdict(
        lead_name=lead.name or f"Сделка #{lead.id}",
        price=float(lead.price or 0),
        stated_reason=stated_reason,
        audit_math=audit_math,
        stage_timeline=timeline_preview,
        calls_summary=calls_preview,
        api_key=effective_api_key,
        model_name=model_name,
        company_context=company_context,
    )

    # Применяем корректировку от ИИ
    final_score = max(0, min(100, audit_math["anomaly_score"] + verdict.get("score_adjustment", 0)))
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
    days_back: int = 30,
) -> int:
    """Пакетный запуск аудита по закрытым в отказ сделкам."""
    acc_stmt = select(Account).where(Account.id == account_id)
    acc = (await session.execute(acc_stmt)).scalar_one_or_none()
    if not acc:
        return 0

    # 1. Гейткипер админки: не запускаем, если интеграция выключена или на паузе
    if acc.status != "connected" or acc.sync_status != "active":
        logger.info(f"Account #{account_id}: Anomaly audit skipped (sync_status={acc.sync_status}, status={acc.status})")
        return 0

    # 2. Гейткипер бэкфила: не трогаем данные, пока идет первичная историческая синхронизация
    if acc.backfill_status != "completed":
        logger.info(f"Account #{account_id}: Anomaly audit skipped because backfill is not completed ({acc.backfill_status})")
        return 0

    api_key = decrypt_token(acc.ai_encrypted_token) if acc.ai_encrypted_token else None
    model_name = acc.ai_model or "gemini-2.5-flash"
    company_context = acc.ai_company_context

    # 3. Ищем сделки со статусом lost с ограничением по дате (защита от старого архива)
    query = select(Lead).where(Lead.account_id == account_id, Lead.status == "lost")
    if pipeline_id:
        query = query.where(Lead.pipeline_id == pipeline_id)

    effective_days_back = (acc.anomaly_settings or {}).get("days_back", days_back)
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=effective_days_back)
    query = query.where(Lead.crm_closed_at >= cutoff_date)

    if not force_reanalyze:
        # Исключаем уже проаудированные
        audited_leads = select(DealAnomalyAudit.lead_id).where(DealAnomalyAudit.account_id == account_id)
        query = query.where(Lead.id.not_in(audited_leads))

    query = query.order_by(desc(Lead.crm_closed_at), desc(Lead.id)).limit(limit)
    leads = (await session.execute(query)).scalars().all()

    if not leads:
        return 0

    benchmarks_cache: Dict[int, Dict[int, float]] = {}
    processed_count = 0

    for lead in leads:
        # 4. Защита синхронизации с контролем качества (QC Dependency Guard):
        # Если у сделки есть звонки в статусе 'pending', пропускаем сделку и ждем завершения аудита звонков в QC!
        pending_qc_stmt = select(func.count(QcCallEvaluation.id)).where(
            QcCallEvaluation.account_id == account_id,
            QcCallEvaluation.lead_id == lead.id,
            QcCallEvaluation.status == "pending"
        )
        pending_qc_count = (await session.execute(pending_qc_stmt)).scalar() or 0
        if pending_qc_count > 0:
            logger.info(f"Lead #{lead.id} has {pending_qc_count} pending QC call(s). Waiting for QC worker before anomaly audit.")
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

    return processed_count


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
