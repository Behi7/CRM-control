from typing import Optional, List
from fastapi import APIRouter, Depends, Header, Query
from app.core.security import get_current_user
from app.modules.analytics import bi, stages

router = APIRouter(tags=["Analytics"])


@router.get("/health")
def health():
    return {"status": "ok", "module": "analytics", "version": "2.0.0"}


@router.get("/accounts")
def list_accounts(user: dict = Depends(get_current_user)):
    return bi.list_accounts_bi(user)


@router.post("/analytics/{account_id}/enrich")
def trigger_enrichment(
    account_id: int,
    authorization: str | None = Header(default=None),
    user: dict = Depends(get_current_user),
):
    return bi.trigger_account_enrichment(account_id, authorization, user)


@router.get("/analytics/{account_id}")
def get_detailed_analytics(
    account_id: int,
    pipeline_id: Optional[int] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    manager_ids: Optional[str] = Query(default=None),
    tag_ids: Optional[str] = Query(default=None),
    sources: Optional[str] = Query(default=None),
    user: dict = Depends(get_current_user),
):
    return bi.get_detailed_analytics(
        account_id=account_id,
        pipeline_id=pipeline_id,
        date_from=date_from,
        date_to=date_to,
        status=status,
        manager_ids=manager_ids,
        tag_ids=tag_ids,
        sources=sources,
        user=user,
    )


@router.get("/accounts/{account_id}/pipelines")
def get_pipelines(account_id: int, user: dict = Depends(get_current_user)):
    return stages.get_pipelines(account_id, user)


@router.get("/accounts/{account_id}/tags")
def get_tags(account_id: int, user: dict = Depends(get_current_user)):
    return stages.get_tags(account_id, user)


@router.get("/accounts/{account_id}/managers")
def get_managers(account_id: int, user: dict = Depends(get_current_user)):
    return stages.get_managers(account_id, user)


@router.get("/accounts/{account_id}/all-stages-stats")
def get_all_stages_stats(
    account_id: int,
    tag_ids: list[int] = Query(default=[]),
    status: str | None = Query(default=None),
    manager_ids: list[int] = Query(default=[]),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    user: dict = Depends(get_current_user),
):
    return stages.get_all_pipelines_stages_stats(
        account_id=account_id,
        tag_ids=tag_ids,
        status=status,
        manager_ids=manager_ids,
        date_from=date_from,
        date_to=date_to,
        user=user,
    )


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
    return stages.get_stages_stats(
        pipeline_id=pipeline_id,
        tag_ids=tag_ids,
        status=status,
        manager_ids=manager_ids,
        date_from=date_from,
        date_to=date_to,
        user=user,
    )


@router.get("/stages/{stage_id}/leads")
@router.get("/stages/{stage_id}/active-leads")
def get_stage_leads(
    stage_id: int,
    tag_ids: list[int] = Query(default=[]),
    status: str | None = Query(default=None),
    manager_ids: list[int] = Query(default=[]),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    page: int | None = Query(default=None, ge=1),
    per_page: int | None = Query(default=None, ge=1, le=500),
    perPage: int | None = Query(default=None, ge=1, le=500),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(get_current_user),
):
    actual_limit = perPage or per_page or limit
    actual_offset = ((page - 1) * actual_limit) if page else offset
    return stages.get_stage_leads(
        stage_id=stage_id,
        tag_ids=tag_ids,
        status=status,
        manager_ids=manager_ids,
        date_from=date_from,
        date_to=date_to,
        limit=actual_limit,
        offset=actual_offset,
        user=user,
    )


@router.get("/leads/{lead_id}/history")
def get_lead_history(lead_id: int, user: dict = Depends(get_current_user)):
    return stages.get_lead_history(lead_id, user)


@router.get("/leads/{lead_id}/skips")
def get_lead_skips(lead_id: int, user: dict = Depends(get_current_user)):
    return stages.get_lead_skips(lead_id, user)


@router.get("/accounts/{account_id}/leads/search")
def search_leads(
    account_id: int,
    q: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    manager_ids: list[int] = Query(default=[]),
    tag_ids: list[int] = Query(default=[]),
    status: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    user: dict = Depends(get_current_user),
):
    return stages.search_leads(
        account_id=account_id,
        q=q,
        page=page,
        per_page=per_page,
        manager_ids=manager_ids,
        tag_ids=tag_ids,
        status=status,
        date_from=date_from,
        date_to=date_to,
        user=user,
    )
