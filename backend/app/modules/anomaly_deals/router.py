from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.core.database import get_db
from app.modules.anomaly_deals.schemas import (
    AnomalyStatsDto, AnomalyDealListResponseDto, DealForensicDetailDto,
    AnalyzeBatchRequestDto, ReviewAuditRequestDto
)
from app.modules.anomaly_deals.service import (
    get_anomaly_stats, get_anomaly_deals_list, get_deal_forensic_detail,
    run_batch_audit, set_audit_reviewed
)

router = APIRouter(tags=["Anomaly Deals"])

def check_account_access(user: dict, account_id: int):
    if user.get("role") != "admin" and user.get("accountId") != account_id:
        raise HTTPException(status_code=403, detail="Access denied to this account")

@router.get("/accounts/{account_id}/anomaly-deals/stats", response_model=AnomalyStatsDto)
async def anomaly_stats_endpoint(
    account_id: int,
    pipeline_id: Optional[int] = Query(None, alias="pipelineId"),
    session: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    check_account_access(user, account_id)
    return await get_anomaly_stats(session, account_id, pipeline_id=pipeline_id)

@router.get("/accounts/{account_id}/anomaly-deals/list", response_model=AnomalyDealListResponseDto)
async def anomaly_deals_list_endpoint(
    account_id: int,
    pipeline_id: Optional[int] = Query(None, alias="pipelineId"),
    responsible_user_id: Optional[int] = Query(None, alias="managerId"),
    anomaly_level: Optional[str] = Query(None, alias="level"),
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
        anomaly_level=anomaly_level,
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

@router.post("/accounts/{account_id}/anomaly-deals/batch-analyze")
async def batch_analyze_endpoint(
    account_id: int,
    payload: AnalyzeBatchRequestDto,
    session: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    check_account_access(user, account_id)
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
