from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import get_current_user
from app.core.database import get_db
from app.models import Account
from app.modules.anomaly_deals.schemas import (
    AnomalyStatsDto, AnomalyDealListResponseDto, DealForensicDetailDto,
    AnalyzeBatchRequestDto, ReviewAuditRequestDto
)
from app.modules.anomaly_deals.service import (
    get_anomaly_stats, get_anomaly_deals_list, get_deal_forensic_detail,
    run_batch_audit, set_audit_reviewed, reanalyze_single_deal
)

router = APIRouter(tags=["Anomaly Deals"])

def check_account_access(user: dict, account_id: int):
    if user.get("role") != "admin" and user.get("accountId") != account_id:
        raise HTTPException(status_code=403, detail="Access denied to this account")

@router.get("/accounts/{account_id}/anomaly-deals/stats", response_model=AnomalyStatsDto)
async def anomaly_stats_endpoint(
    account_id: int,
    pipeline_id: Optional[int] = Query(None, alias="pipelineId"),
    managers: Optional[str] = Query(None),
    manager_id: Optional[int] = Query(None, alias="managerId"),
    tags: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None, alias="dateFrom"),
    date_to: Optional[str] = Query(None, alias="dateTo"),
    session: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    check_account_access(user, account_id)
    return await get_anomaly_stats(
        session=session,
        account_id=account_id,
        pipeline_id=pipeline_id,
        managers=managers,
        manager_id=manager_id,
        tags=tags,
        date_from=date_from,
        date_to=date_to,
    )

@router.get("/accounts/{account_id}/anomaly-deals/list", response_model=AnomalyDealListResponseDto)
async def anomaly_deals_list_endpoint(
    account_id: int,
    pipeline_id: Optional[int] = Query(None, alias="pipelineId"),
    responsible_user_id: Optional[int] = Query(None, alias="managerId"),
    managers: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None, alias="dateFrom"),
    date_to: Optional[str] = Query(None, alias="dateTo"),
    anomaly_level: Optional[str] = Query(None, alias="level"),
    fault: Optional[str] = Query(None),
    is_reviewed: Optional[bool] = Query(None, alias="isReviewed"),
    min_price: Optional[float] = Query(None, alias="minPrice"),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("newest", alias="sortBy"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    session: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    check_account_access(user, account_id)
    return await get_anomaly_deals_list(
        session=session,
        account_id=account_id,
        pipeline_id=pipeline_id,
        responsible_user_id=responsible_user_id,
        managers=managers,
        tags=tags,
        date_from=date_from,
        date_to=date_to,
        anomaly_level=anomaly_level,
        manager_fault=fault,
        is_reviewed=is_reviewed,
        min_price=min_price,
        search=search,
        sort_by=sort_by,
        page=page,
        page_size=page_size,
    )

@router.get("/accounts/{account_id}/anomaly-deals/leads/{lead_id}/forensic", response_model=DealForensicDetailDto)
async def deal_forensic_endpoint(
    account_id: int,
    lead_id: int,
    session: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    check_account_access(user, account_id)
    detail = await get_deal_forensic_detail(session, account_id, lead_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Lead not found or not closed in loss")
    return detail

@router.post("/accounts/{account_id}/anomaly-deals/leads/{lead_id}/reanalyze", response_model=DealForensicDetailDto)
async def reanalyze_deal_endpoint(
    account_id: int,
    lead_id: int,
    session: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    check_account_access(user, account_id)
    detail = await reanalyze_single_deal(session, account_id, lead_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Lead not found")
    return detail

@router.post("/accounts/{account_id}/anomaly-deals/batch-analyze")
async def batch_analyze_endpoint(
    account_id: int,
    payload: AnalyzeBatchRequestDto,
    session: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    check_account_access(user, account_id)
    acc_stmt = select(Account).where(Account.id == account_id)
    acc = (await session.execute(acc_stmt)).scalar_one_or_none()
    anomaly_cfg = dict(acc.anomaly_settings or {}) if acc else {}
    if not acc or not acc.ai_enabled or not anomaly_cfg.get("is_enabled", True):
        raise HTTPException(status_code=403, detail="Модуль Аномальные сделки отключен")

    processed = await run_batch_audit(
        session=session,
        account_id=account_id,
        pipeline_id=payload.pipelineId,
        limit=payload.limit or 25,
        force_reanalyze=payload.forceReanalyze or False,
    )
    return {"status": "ok", "processed": processed}

@router.post("/accounts/{account_id}/anomaly-deals/leads/{lead_id}/review")
async def review_audit_endpoint(
    account_id: int,
    lead_id: int,
    payload: ReviewAuditRequestDto,
    session: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    check_account_access(user, account_id)
    success = await set_audit_reviewed(session, account_id, lead_id, payload.isReviewed)
    if not success:
        raise HTTPException(status_code=404, detail="Audit record not found")
    return {"status": "ok", "isReviewed": payload.isReviewed}
