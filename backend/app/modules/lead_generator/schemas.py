from typing import Optional, List
from pydantic import BaseModel

class LeadCampaignDto(BaseModel):
    id: str
    sourceName: str
    leadsCount: int = 0

class LeadGenStatsDto(BaseModel):
    status: str = "ok"
    module: str = "lead_generator"
    title: str = "Генератор лидов и Атрибуция трафика"
    totalGeneratedLeads: int = 0
    campaigns: List[LeadCampaignDto] = []
