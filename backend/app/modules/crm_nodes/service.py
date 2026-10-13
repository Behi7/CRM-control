from typing import Optional, Dict, Any
from app.modules.crm_nodes.schemas import CrmNodesOverviewDto

def get_crm_nodes_overview(account_id: int) -> CrmNodesOverviewDto:
    return CrmNodesOverviewDto(
        status="ok",
        module="crm_nodes",
        title="CRM Ноды и Архитектура процессов",
        nodes=[],
        totalPipelines=0,
        totalStages=0,
    )
