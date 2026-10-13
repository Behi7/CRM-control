from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user
from app.modules.crm_nodes.schemas import CrmNodesOverviewDto
from app.modules.crm_nodes.service import get_crm_nodes_overview

router = APIRouter(tags=["CRM Nodes"])

def check_account_access(user: dict, account_id: int):
    if user.get("role") != "admin" and user.get("accountId") != account_id:
        raise HTTPException(status_code=403, detail="Access denied to this account")

@router.get("/accounts/{account_id}/crm-nodes/overview", response_model=CrmNodesOverviewDto)
def nodes_overview(
    account_id: int,
    user: dict = Depends(get_current_user),
):
    check_account_access(user, account_id)
    return get_crm_nodes_overview(account_id)
