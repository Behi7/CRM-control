from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user
from app.modules.lead_generator.schemas import LeadGenStatsDto
from app.modules.lead_generator.service import get_lead_gen_stats

router = APIRouter(tags=["Lead Generator"])

def check_account_access(user: dict, account_id: int):
    if user.get("role") != "admin" and user.get("accountId") != account_id:
        raise HTTPException(status_code=403, detail="Access denied to this account")

@router.get("/accounts/{account_id}/lead-generator/stats", response_model=LeadGenStatsDto)
def lead_gen_stats(
    account_id: int,
    user: dict = Depends(get_current_user),
):
    check_account_access(user, account_id)
    return get_lead_gen_stats(account_id)
