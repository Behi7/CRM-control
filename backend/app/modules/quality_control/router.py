from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, desc, and_, or_, case
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.core.security import get_current_user
from app.models import (
    Account, Lead, Pipeline, AmoUser, Tag, LeadTag,
    QcSettings, QcRule, QcCallEvaluation, QcLeadRiskScore
)
from app.modules.quality_control.schemas import (
    QcSettingsDto, UpdateQcSettingsDto,
    QcRuleDto, CreateQcRuleDto, UpdateQcRuleDto,
    CallEvaluationItemDto, CallEvaluationDetailDto,
    RescueDealItemDto, QcStatsDto
)

router = APIRouter(prefix="", tags=["Quality Control"])

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

def check_account_access(user: dict, account_id: int):
    if user.get("role") != "admin" and user.get("accountId") != account_id:
        raise HTTPException(status_code=403, detail="Access denied to this account")

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

# ==========================================
# 1. SETTINGS
# ==========================================

@router.get("/accounts/{account_id}/qc/settings", response_model=QcSettingsDto)
async def get_qc_settings(
    account_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    check_account_access(user, account_id)
    stmt = select(QcSettings).where(QcSettings.account_id == account_id)
    res = await db.execute(stmt)
    qc = res.scalar_one_or_none()

    if not qc:
        qc = QcSettings(
            account_id=account_id,
            is_enabled=False,
            ai_model="gemini-2.5-flash",
            min_duration_sec=20,
            max_duration_sec=600,
            rescue_threshold_score=40,
        )
        db.add(qc)
        await db.commit()
        await db.refresh(qc)

    return QcSettingsDto(
        accountId=qc.account_id,
        isEnabled=qc.is_enabled,
        aiModel=qc.ai_model,
        minDurationSec=qc.min_duration_sec,
        maxDurationSec=qc.max_duration_sec,
        rescueThresholdScore=qc.rescue_threshold_score,
        systemPrompt=qc.system_prompt,
        lastCallSyncedAt=qc.last_call_synced_at,
    )

@router.patch("/accounts/{account_id}/qc/settings", response_model=QcSettingsDto)
async def update_qc_settings(
    account_id: int,
    dto: UpdateQcSettingsDto,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    check_account_access(user, account_id)
    stmt = select(QcSettings).where(QcSettings.account_id == account_id)
    res = await db.execute(stmt)
    qc = res.scalar_one_or_none()

    if not qc:
        qc = QcSettings(account_id=account_id)
        db.add(qc)

    if dto.isEnabled is not None:
        qc.is_enabled = dto.isEnabled
    if dto.aiModel is not None:
        qc.ai_model = dto.aiModel.strip()
    if dto.minDurationSec is not None:
        qc.min_duration_sec = max(5, dto.minDurationSec)
    if dto.maxDurationSec is not None:
        qc.max_duration_sec = max(qc.min_duration_sec + 10, dto.maxDurationSec)
    if dto.rescueThresholdScore is not None:
        qc.rescue_threshold_score = max(5, dto.rescueThresholdScore)
    if dto.systemPrompt is not None:
        qc.system_prompt = dto.systemPrompt.strip() if dto.systemPrompt else None

    qc.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(qc)

    return QcSettingsDto(
        accountId=qc.account_id,
        isEnabled=qc.is_enabled,
        aiModel=qc.ai_model,
        minDurationSec=qc.min_duration_sec,
        maxDurationSec=qc.max_duration_sec,
        rescueThresholdScore=qc.rescue_threshold_score,
        systemPrompt=qc.system_prompt,
        lastCallSyncedAt=qc.last_call_synced_at,
    )

# ==========================================
# 2. RULES (ЗАКОНЫ ПРОВЕРКИ)
# ==========================================

@router.get("/accounts/{account_id}/qc/rules", response_model=List[QcRuleDto])
async def list_qc_rules(
    account_id: int,
    pipeline_id: Optional[int] = Query(default=None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    check_account_access(user, account_id)
    stmt = select(QcRule).where(QcRule.account_id == account_id)
    if pipeline_id is not None:
        stmt = stmt.where(or_(QcRule.pipeline_id == pipeline_id, QcRule.pipeline_id.is_(None)))
    stmt = stmt.order_by(QcRule.sort_order.asc(), QcRule.id.asc())

    res = await db.execute(stmt)
    rules = res.scalars().all()

    return [
        QcRuleDto(
            id=r.id,
            accountId=r.account_id,
            pipelineId=r.pipeline_id,
            title=r.title,
            description=r.description,
            penaltyPoints=r.penalty_points,
            sortOrder=r.sort_order,
            isActive=r.is_active,
            createdAt=r.created_at,
            updatedAt=r.updated_at,
        )
        for r in rules
    ]

@router.post("/accounts/{account_id}/qc/rules", response_model=QcRuleDto)
async def create_qc_rule(
    account_id: int,
    dto: CreateQcRuleDto,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    check_account_access(user, account_id)
    if not dto.title.strip():
        raise HTTPException(status_code=400, detail="Название правила не может быть пустым")

    rule = QcRule(
        account_id=account_id,
        pipeline_id=dto.pipelineId,
        title=dto.title.strip(),
        description=dto.description.strip() if dto.description else None,
        penalty_points=dto.penaltyPoints,
        sort_order=dto.sortOrder,
        is_active=dto.isActive,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)

    return QcRuleDto(
        id=rule.id,
        accountId=rule.account_id,
        pipelineId=rule.pipeline_id,
        title=rule.title,
        description=rule.description,
        penaltyPoints=rule.penalty_points,
        sortOrder=rule.sort_order,
        isActive=rule.is_active,
        createdAt=rule.created_at,
        updatedAt=rule.updated_at,
    )

@router.patch("/accounts/{account_id}/qc/rules/{rule_id}", response_model=QcRuleDto)
async def update_qc_rule(
    account_id: int,
    rule_id: int,
    dto: UpdateQcRuleDto,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    check_account_access(user, account_id)
    stmt = select(QcRule).where(QcRule.id == rule_id, QcRule.account_id == account_id)
    res = await db.execute(stmt)
    rule = res.scalar_one_or_none()

    if not rule:
        raise HTTPException(status_code=404, detail="Правило не найдено")

    if dto.title is not None:
        rule.title = dto.title.strip()
    if dto.description is not None:
        rule.description = dto.description.strip() if dto.description else None
    if dto.penaltyPoints is not None:
        rule.penalty_points = dto.penaltyPoints
    if dto.sortOrder is not None:
        rule.sort_order = dto.sortOrder
    if dto.isActive is not None:
        rule.is_active = dto.isActive

    rule.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(rule)

    return QcRuleDto(
        id=rule.id,
        accountId=rule.account_id,
        pipelineId=rule.pipeline_id,
        title=rule.title,
        description=rule.description,
        penaltyPoints=rule.penalty_points,
        sortOrder=rule.sort_order,
        isActive=rule.is_active,
        createdAt=rule.created_at,
        updatedAt=rule.updated_at,
    )

@router.delete("/accounts/{account_id}/qc/rules/{rule_id}")
async def delete_qc_rule(
    account_id: int,
    rule_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    check_account_access(user, account_id)
    stmt = select(QcRule).where(QcRule.id == rule_id, QcRule.account_id == account_id)
    res = await db.execute(stmt)
    rule = res.scalar_one_or_none()

    if not rule:
        raise HTTPException(status_code=404, detail="Правило не найдено")

    await db.delete(rule)
    await db.commit()
    return {"ok": True}

# ==========================================
# 3. CALLS FEED & EVALUATIONS
# ==========================================

@router.get("/accounts/{account_id}/qc/calls")
async def list_qc_calls(
    account_id: int,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    scoreFilter: Optional[str] = Query(default=None),
    managerId: Optional[int] = Query(default=None),
    managers: Optional[str] = Query(default=None),
    pipelineId: Optional[int] = Query(default=None),
    status: Optional[str] = Query(default=None),
    dealStatus: Optional[str] = Query(default=None),
    tags: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    check_account_access(user, account_id)

    # Base query joined with Lead, Pipeline, AmoUser
    stmt = (
        select(
            QcCallEvaluation,
            Lead.name.label("lead_name"),
            Pipeline.name.label("pipeline_name"),
            AmoUser.name.label("manager_name"),
        )
        .outerjoin(Lead, QcCallEvaluation.lead_id == Lead.id)
        .outerjoin(Pipeline, QcCallEvaluation.pipeline_id == Pipeline.id)
        .outerjoin(AmoUser, QcCallEvaluation.amo_user_id == AmoUser.id)
        .where(QcCallEvaluation.account_id == account_id)
    )

    count_stmt = (
        select(func.count(QcCallEvaluation.id))
        .select_from(QcCallEvaluation)
        .outerjoin(Lead, QcCallEvaluation.lead_id == Lead.id)
        .where(QcCallEvaluation.account_id == account_id)
    )

    # Filters
    if scoreFilter == "low":
        stmt = stmt.where(QcCallEvaluation.overall_score < 50)
        count_stmt = count_stmt.where(QcCallEvaluation.overall_score < 50)
    elif scoreFilter == "med":
        stmt = stmt.where(and_(QcCallEvaluation.overall_score >= 50, QcCallEvaluation.overall_score < 75))
        count_stmt = count_stmt.where(and_(QcCallEvaluation.overall_score >= 50, QcCallEvaluation.overall_score < 75))
    elif scoreFilter == "high":
        stmt = stmt.where(QcCallEvaluation.overall_score >= 75)
        count_stmt = count_stmt.where(QcCallEvaluation.overall_score >= 75)

    m_ids = parse_ids_list(managers)
    if m_ids:
        stmt = stmt.where(QcCallEvaluation.amo_user_id.in_(m_ids))
        count_stmt = count_stmt.where(QcCallEvaluation.amo_user_id.in_(m_ids))
    elif managerId:
        stmt = stmt.where(QcCallEvaluation.amo_user_id == managerId)
        count_stmt = count_stmt.where(QcCallEvaluation.amo_user_id == managerId)

    if pipelineId:
        p_cond = or_(QcCallEvaluation.pipeline_id == pipelineId, Lead.pipeline_id == pipelineId)
        stmt = stmt.where(p_cond)
        count_stmt = count_stmt.where(p_cond)

    if status and status != "all":
        stmt = stmt.where(QcCallEvaluation.status == status)
        count_stmt = count_stmt.where(QcCallEvaluation.status == status)

    if dealStatus and dealStatus != "all":
        statuses = [s.strip() for s in dealStatus.split(",") if s.strip() in ("open", "won", "lost")]
        if statuses:
            stmt = stmt.where(Lead.status.in_(statuses))
            count_stmt = count_stmt.where(Lead.status.in_(statuses))

    t_ids = parse_ids_list(tags)
    if t_ids:
        tag_subq = select(LeadTag.lead_id).where(LeadTag.tag_id.in_(t_ids))
        stmt = stmt.where(Lead.id.in_(tag_subq))
        count_stmt = count_stmt.where(Lead.id.in_(tag_subq))

    if search and search.strip():
        s_term = f"%{search.strip()}%"
        stmt = stmt.where(or_(QcCallEvaluation.phone.ilike(s_term), Lead.name.ilike(s_term)))
        count_stmt = count_stmt.where(or_(QcCallEvaluation.phone.ilike(s_term), Lead.name.ilike(s_term)))

    d_from = parse_date_param(dateFrom, is_end=False)
    if d_from:
        stmt = stmt.where(QcCallEvaluation.call_date >= d_from)
        count_stmt = count_stmt.where(QcCallEvaluation.call_date >= d_from)

    d_to = parse_date_param(dateTo, is_end=True)
    if d_to:
        stmt = stmt.where(QcCallEvaluation.call_date <= d_to)
        count_stmt = count_stmt.where(QcCallEvaluation.call_date <= d_to)

    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(QcCallEvaluation.call_date.desc()).offset((page - 1) * limit).limit(limit)
    res = await db.execute(stmt)
    rows = res.all()

    items = []
    for call, lead_name, pipeline_name, manager_name in rows:
        items.append(
            CallEvaluationItemDto(
                id=call.id,
                externalCallId=call.external_call_id,
                leadId=call.lead_id,
                leadName=lead_name,
                pipelineId=call.pipeline_id,
                pipelineName=pipeline_name,
                managerId=call.amo_user_id,
                managerName=manager_name,
                phone=call.phone,
                callDirection=call.call_direction,
                callDate=call.call_date,
                durationSeconds=call.duration_seconds,
                recordingUrl=call.recording_url,
                status=call.status,
                skipReason=call.skip_reason,
                overallScore=call.overall_score,
                rulesBreakdown=call.rules_breakdown,
                errorsList=call.errors_list,
                bottleneck=call.bottleneck,
                summary=call.summary,
                anomalyPoints=call.anomaly_points,
            )
        )

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
    }

@router.get("/accounts/{account_id}/qc/calls/{call_id}", response_model=CallEvaluationDetailDto)
async def get_qc_call_detail(
    account_id: int,
    call_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    check_account_access(user, account_id)
    stmt = (
        select(
            QcCallEvaluation,
            Lead.name.label("lead_name"),
            Pipeline.name.label("pipeline_name"),
            AmoUser.name.label("manager_name"),
        )
        .outerjoin(Lead, QcCallEvaluation.lead_id == Lead.id)
        .outerjoin(Pipeline, QcCallEvaluation.pipeline_id == Pipeline.id)
        .outerjoin(AmoUser, QcCallEvaluation.amo_user_id == AmoUser.id)
        .where(QcCallEvaluation.id == call_id, QcCallEvaluation.account_id == account_id)
    )
    res = await db.execute(stmt)
    row = res.first()

    if not row:
        raise HTTPException(status_code=404, detail="Запись звонка не найдена")

    call, lead_name, pipeline_name, manager_name = row

    return CallEvaluationDetailDto(
        id=call.id,
        externalCallId=call.external_call_id,
        leadId=call.lead_id,
        leadName=lead_name,
        pipelineId=call.pipeline_id,
        pipelineName=pipeline_name,
        managerId=call.amo_user_id,
        managerName=manager_name,
        phone=call.phone,
        callDirection=call.call_direction,
        callDate=call.call_date,
        durationSeconds=call.duration_seconds,
        recordingUrl=call.recording_url,
        status=call.status,
        skipReason=call.skip_reason,
        overallScore=call.overall_score,
        rulesBreakdown=call.rules_breakdown,
        errorsList=call.errors_list,
        bottleneck=call.bottleneck,
        summary=call.summary,
        transcript=call.transcript,
        recommendation=call.recommendation,
        anomalyPoints=call.anomaly_points,
    )

# ==========================================
# 4. RESCUE DEALS (СПАСЕНИЕ СДЕЛОК)
# ==========================================

@router.get("/accounts/{account_id}/qc/rescue-deals", response_model=List[RescueDealItemDto])
async def list_rescue_deals(
    account_id: int,
    pipeline_id: Optional[int] = Query(default=None),
    pipelineId: Optional[int] = Query(default=None),
    managers: Optional[str] = Query(default=None),
    tags: Optional[str] = Query(default=None),
    dealStatus: Optional[str] = Query(default=None),
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    check_account_access(user, account_id)

    # Получаем порог из настроек
    qc_stmt = select(QcSettings.rescue_threshold_score).where(QcSettings.account_id == account_id)
    threshold = (await db.execute(qc_stmt)).scalar() or 40

    stmt = (
        select(
            QcLeadRiskScore,
            Lead.name.label("lead_name"),
            Lead.price.label("lead_price"),
            Lead.pipeline_id.label("lead_pipeline_id"),
            Lead.loss_reason_name.label("loss_reason_name"),
            Pipeline.name.label("pipeline_name"),
            AmoUser.name.label("manager_name"),
            func.count(QcCallEvaluation.id).label("calls_count"),
        )
        .join(Lead, QcLeadRiskScore.lead_id == Lead.id)
        .outerjoin(Pipeline, Lead.pipeline_id == Pipeline.id)
        .outerjoin(AmoUser, Lead.responsible_user_id == AmoUser.id)
        .outerjoin(QcCallEvaluation, QcCallEvaluation.lead_id == Lead.id)
        .where(
            QcLeadRiskScore.account_id == account_id,
            or_(
                QcLeadRiskScore.is_rescue_candidate == True,
                QcLeadRiskScore.total_risk_score >= threshold,
            ),
        )
    )

    eff_pipeline_id = pipeline_id or pipelineId
    if eff_pipeline_id:
        stmt = stmt.where(Lead.pipeline_id == eff_pipeline_id)

    m_ids = parse_ids_list(managers)
    if m_ids:
        stmt = stmt.where(Lead.responsible_user_id.in_(m_ids))

    t_ids = parse_ids_list(tags)
    if t_ids:
        tag_subq = select(LeadTag.lead_id).where(LeadTag.tag_id.in_(t_ids))
        stmt = stmt.where(Lead.id.in_(tag_subq))

    if dealStatus and dealStatus != "all":
        statuses = [s.strip() for s in dealStatus.split(",") if s.strip() in ("won", "lost", "open")]
        if statuses:
            stmt = stmt.where(Lead.status.in_(statuses))

    d_from = parse_date_param(dateFrom, is_end=False)
    if d_from:
        stmt = stmt.where(or_(Lead.crm_closed_at >= d_from, QcLeadRiskScore.updated_at >= d_from))

    d_to = parse_date_param(dateTo, is_end=True)
    if d_to:
        stmt = stmt.where(or_(Lead.crm_closed_at <= d_to, QcLeadRiskScore.updated_at <= d_to))

    stmt = (
        stmt.group_by(
            QcLeadRiskScore.id, Lead.id, Pipeline.id, AmoUser.id
        )
        .order_by(QcLeadRiskScore.total_risk_score.desc())
        .limit(100)
    )

    res = await db.execute(stmt)
    rows = res.all()

    items = []
    for r, lead_name, lead_price, lead_p_id, loss_reason, p_name, manager_name, calls_cnt in rows:
        items.append(
            RescueDealItemDto(
                id=r.id,
                leadId=r.lead_id,
                leadName=lead_name or f"Сделка #{r.lead_id}",
                leadPrice=float(lead_price) if lead_price is not None else None,
                pipelineId=lead_p_id,
                pipelineName=p_name,
                managerName=manager_name,
                lossReasonName=loss_reason,
                totalRiskScore=r.total_risk_score,
                rescueReason=r.rescue_reason or f"Накоплено {r.total_risk_score} штрафных баллов при закрытии",
                aiRescueScript=r.ai_rescue_script or "Рекомендация РОПу: поручить звонок старшему менеджеру для уточнения причин отказа.",
                callsCount=calls_cnt or 0,
                updatedAt=r.updated_at,
            )
        )

    return items

# ==========================================
# 5. STATS & KPIS
# ==========================================

@router.get("/accounts/{account_id}/qc/stats", response_model=QcStatsDto)
async def get_qc_stats(
    account_id: int,
    pipeline_id: Optional[int] = Query(default=None),
    pipelineId: Optional[int] = Query(default=None),
    managers: Optional[str] = Query(default=None),
    tags: Optional[str] = Query(default=None),
    dealStatus: Optional[str] = Query(default=None),
    dateFrom: Optional[str] = Query(default=None),
    dateTo: Optional[str] = Query(default=None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    check_account_access(user, account_id)

    eff_pipeline_id = pipeline_id or pipelineId
    m_ids = parse_ids_list(managers)
    t_ids = parse_ids_list(tags)
    statuses = [s.strip() for s in dealStatus.split(",") if s.strip() in ("won", "lost", "open")] if (dealStatus and dealStatus != "all") else []
    d_from = parse_date_param(dateFrom, is_end=False)
    d_to = parse_date_param(dateTo, is_end=True)

    base_conditions = [QcCallEvaluation.account_id == account_id]
    if eff_pipeline_id:
        base_conditions.append(or_(QcCallEvaluation.pipeline_id == eff_pipeline_id, Lead.pipeline_id == eff_pipeline_id))
    if m_ids:
        base_conditions.append(QcCallEvaluation.amo_user_id.in_(m_ids))
    if statuses:
        base_conditions.append(Lead.status.in_(statuses))
    if t_ids:
        base_conditions.append(Lead.id.in_(select(LeadTag.lead_id).where(LeadTag.tag_id.in_(t_ids))))
    if d_from:
        base_conditions.append(QcCallEvaluation.call_date >= d_from)
    if d_to:
        base_conditions.append(QcCallEvaluation.call_date <= d_to)

    # 1. Total & Analyzed calls
    t_stmt = (
        select(func.count(QcCallEvaluation.id))
        .select_from(QcCallEvaluation)
        .outerjoin(Lead, QcCallEvaluation.lead_id == Lead.id)
        .where(*base_conditions)
    )
    total_calls = (await db.execute(t_stmt)).scalar() or 0

    a_stmt = (
        select(
            func.count(QcCallEvaluation.id),
            func.avg(QcCallEvaluation.overall_score),
            func.sum(QcCallEvaluation.anomaly_points)
        )
        .select_from(QcCallEvaluation)
        .outerjoin(Lead, QcCallEvaluation.lead_id == Lead.id)
        .where(*base_conditions, QcCallEvaluation.status == "completed")
    )
    a_res = await db.execute(a_stmt)
    analyzed_calls, avg_score, sum_anomalies = a_res.first() or (0, 0, 0)

    # 2. Low score (<50) and High score (>=75) calls
    low_stmt = (
        select(func.count(QcCallEvaluation.id))
        .select_from(QcCallEvaluation)
        .outerjoin(Lead, QcCallEvaluation.lead_id == Lead.id)
        .where(*base_conditions, QcCallEvaluation.status == "completed", QcCallEvaluation.overall_score < 50)
    )
    low_score_calls = (await db.execute(low_stmt)).scalar() or 0

    high_stmt = (
        select(func.count(QcCallEvaluation.id))
        .select_from(QcCallEvaluation)
        .outerjoin(Lead, QcCallEvaluation.lead_id == Lead.id)
        .where(*base_conditions, QcCallEvaluation.status == "completed", QcCallEvaluation.overall_score >= 75)
    )
    high_score_calls = (await db.execute(high_stmt)).scalar() or 0

    # 3. Rescue deals count
    r_stmt = (
        select(func.count(QcLeadRiskScore.id))
        .select_from(QcLeadRiskScore)
        .join(Lead, QcLeadRiskScore.lead_id == Lead.id)
        .where(
            QcLeadRiskScore.account_id == account_id,
            QcLeadRiskScore.is_rescue_candidate == True,
        )
    )
    if eff_pipeline_id:
        r_stmt = r_stmt.where(Lead.pipeline_id == eff_pipeline_id)
    if m_ids:
        r_stmt = r_stmt.where(Lead.responsible_user_id.in_(m_ids))
    if t_ids:
        r_stmt = r_stmt.where(Lead.id.in_(select(LeadTag.lead_id).where(LeadTag.tag_id.in_(t_ids))))
    if statuses:
        r_stmt = r_stmt.where(Lead.status.in_(statuses))
    if d_from:
        r_stmt = r_stmt.where(or_(Lead.crm_closed_at >= d_from, QcLeadRiskScore.updated_at >= d_from))
    if d_to:
        r_stmt = r_stmt.where(or_(Lead.crm_closed_at <= d_to, QcLeadRiskScore.updated_at <= d_to))

    rescue_cnt = (await db.execute(r_stmt)).scalar() or 0

    # 4. Top mistakes
    mistakes_stmt = (
        select(QcCallEvaluation.errors_list)
        .select_from(QcCallEvaluation)
        .outerjoin(Lead, QcCallEvaluation.lead_id == Lead.id)
        .where(*base_conditions, QcCallEvaluation.status == "completed", QcCallEvaluation.errors_list.isnot(None))
        .limit(100)
    )
    m_res = await db.execute(mistakes_stmt)
    m_rows = m_res.scalars().all()

    from collections import Counter
    mistakes_counter = Counter()
    for err_list in m_rows:
        if isinstance(err_list, list):
            for err in err_list:
                if isinstance(err, str) and err.strip():
                    mistakes_counter[err.strip()] += 1

    top_mistakes = [
        {"mistake": m, "count": cnt}
        for m, cnt in mistakes_counter.most_common(5)
    ]

    # 5. Manager-by-manager stats
    mgr_stmt = (
        select(
            QcCallEvaluation.amo_user_id,
            func.coalesce(AmoUser.name, "Не назначен").label("manager_name"),
            func.count(QcCallEvaluation.id).label("total_calls"),
            func.count(case((QcCallEvaluation.status == "completed", 1))).label("analyzed_calls"),
            func.coalesce(func.sum(QcCallEvaluation.duration_seconds), 0).label("total_duration_sec"),
            func.coalesce(func.avg(QcCallEvaluation.duration_seconds), 0).label("avg_duration_sec"),
            func.coalesce(func.avg(case((QcCallEvaluation.status == "completed", QcCallEvaluation.overall_score))), 0).label("avg_score"),
            func.count(case((and_(QcCallEvaluation.status == "completed", QcCallEvaluation.overall_score < 50), 1))).label("low_score_calls"),
            func.count(case((and_(QcCallEvaluation.status == "completed", QcCallEvaluation.overall_score >= 75), 1))).label("high_score_calls"),
        )
        .select_from(QcCallEvaluation)
        .outerjoin(Lead, QcCallEvaluation.lead_id == Lead.id)
        .outerjoin(AmoUser, QcCallEvaluation.amo_user_id == AmoUser.id)
        .where(*base_conditions)
        .group_by(QcCallEvaluation.amo_user_id, AmoUser.name)
        .order_by(func.count(QcCallEvaluation.id).desc())
    )
    mgr_res = await db.execute(mgr_stmt)
    managers_stats = []
    for row in mgr_res.all():
        m_total = row.total_calls or 0
        m_analyzed = row.analyzed_calls or 0
        m_high = row.high_score_calls or 0
        comp_pct = round((m_high / m_analyzed * 100), 1) if m_analyzed > 0 else 0.0
        managers_stats.append({
            "managerId": row.amo_user_id,
            "managerName": row.manager_name or "Не назначен",
            "totalCalls": m_total,
            "analyzedCalls": m_analyzed,
            "totalDurationSec": int(row.total_duration_sec or 0),
            "avgDurationSec": int(row.avg_duration_sec or 0),
            "avgScore": round(float(row.avg_score or 0), 1),
            "lowScoreCalls": row.low_score_calls or 0,
            "highScoreCalls": m_high,
            "compliancePercent": comp_pct,
        })

    return QcStatsDto(
        totalCalls=total_calls,
        analyzedCalls=analyzed_calls or 0,
        avgScore=round(float(avg_score or 0), 1),
        totalAnomalies=0,
        lowScoreCalls=low_score_calls,
        highScoreCalls=high_score_calls,
        rescueDealsCount=rescue_cnt,
        topMistakes=top_mistakes,
        managersStats=managers_stats,
    )


# ==========================================
# 6. ON-DEMAND ANALYSIS & SCORE RECALCULATION
# ==========================================

@router.post("/accounts/{account_id}/qc/calls/{call_id}/analyze")
async def trigger_call_analysis(
    account_id: int,
    call_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    check_account_access(user, account_id)
    from app.modules.quality_control.service import process_call_evaluation
    ok = await process_call_evaluation(db, call_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Не удалось проанализировать звонок (проверьте наличие аудио и настройки ИИ)")
    return {"ok": True, "message": "Звонок успешно проанализирован"}


@router.post("/accounts/{account_id}/qc/recalculate-scores")
async def recalculate_scores(
    account_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Пересчитывает оценки всех завершенных звонков по новой математической формуле процентов."""
    check_account_access(user, account_id)
    from app.modules.quality_control.service import calculate_score_and_anomalies, get_active_rules

    stmt = select(QcCallEvaluation).where(
        QcCallEvaluation.account_id == account_id,
        QcCallEvaluation.status == "completed",
        QcCallEvaluation.rules_breakdown.is_not(None),
    )
    res = await db.execute(stmt)
    calls = res.scalars().all()
    updated = 0
    for c in calls:
        rules = await get_active_rules(db, account_id, c.pipeline_id)
        new_score, new_anomalies = calculate_score_and_anomalies(c.rules_breakdown or [], rules)
        c.overall_score = new_score
        c.anomaly_points = new_anomalies
        updated += 1
    await db.commit()
    return {"ok": True, "updatedCount": updated}

