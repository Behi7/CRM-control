from typing import Optional, Dict, Any
from app.modules.lead_generator.schemas import LeadGenStatsDto

def get_lead_gen_stats(account_id: int) -> LeadGenStatsDto:
    return LeadGenStatsDto(
        status="ok",
        module="lead_generator",
        title="Генератор лидов и Атрибуция трафика",
        totalGeneratedLeads=0,
        campaigns=[],
    )
