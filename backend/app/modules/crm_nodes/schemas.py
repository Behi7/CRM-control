from typing import Optional, List, Dict, Any
from pydantic import BaseModel

class CrmNodeDto(BaseModel):
    id: str
    name: str
    type: str  # "pipeline", "stage", "channel", "action"
    status: str = "active"  # "active", "warning", "idle"
    dealsCount: int = 0
    totalAmount: float = 0.0

class CrmNodesOverviewDto(BaseModel):
    status: str = "ok"
    module: str = "crm_nodes"
    title: str = "CRM Ноды и Архитектура процессов"
    nodes: List[CrmNodeDto] = []
    totalPipelines: int = 0
    totalStages: int = 0
