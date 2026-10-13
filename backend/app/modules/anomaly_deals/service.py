from typing import Optional, Dict, Any
from app.modules.anomaly_deals.schemas import AnomalySummaryDto

def get_anomaly_summary(account_id: int) -> AnomalySummaryDto:
    return AnomalySummaryDto(
        status="ok",
        module="anomaly_deals",
        title="Аномальные сделки и Аудит рисков",
        totalAnomalies=0,
        items=[],
    )
