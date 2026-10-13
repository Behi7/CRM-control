from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user
from app.modules.anomaly_deals.schemas import AnomalySummaryDto
from app.modules.anomaly_deals.service import get_anomaly_summary

router = APIRouter(tags=["Anomaly Deals"])

def check_account_access(user: dict, account_id: int):
    if user.get("role") != "admin" and user.get("accountId") != account_id:
        raise HTTPException(status_code=403, detail="Access denied to this account")

@router.get("/accounts/{account_id}/anomaly-deals/summary", response_model=AnomalySummaryDto)
def anomaly_summary(
    account_id: int,
    user: dict = Depends(get_current_user),
):
    check_account_access(user, account_id)
    return get_anomaly_summary(account_id)
