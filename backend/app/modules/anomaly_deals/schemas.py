from typing import Optional, List
from pydantic import BaseModel

class AnomalyDealItemDto(BaseModel):
    id: int
    name: str
    anomalyType: str
    anomalySeverity: str

class AnomalySummaryDto(BaseModel):
    status: str = "ok"
    module: str = "anomaly_deals"
    title: str = "Аномальные сделки и Аудит рисков"
    totalAnomalies: int = 0
    items: List[AnomalyDealItemDto] = []
