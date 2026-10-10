from typing import Optional, List, Any, Dict
from pydantic import BaseModel
from datetime import datetime

class QcSettingsDto(BaseModel):
    accountId: int
    isEnabled: bool
    aiModel: str
    minDurationSec: int
    maxDurationSec: int
    rescueThresholdScore: int
    systemPrompt: Optional[str] = None
    lastCallSyncedAt: Optional[datetime] = None

class UpdateQcSettingsDto(BaseModel):
    isEnabled: Optional[bool] = None
    aiModel: Optional[str] = None
    minDurationSec: Optional[int] = None
    maxDurationSec: Optional[int] = None
    rescueThresholdScore: Optional[int] = None
    systemPrompt: Optional[str] = None

class QcRuleDto(BaseModel):
    id: int
    accountId: int
    pipelineId: Optional[int] = None
    title: str
    description: Optional[str] = None
    penaltyPoints: int = 10
    sortOrder: int = 0
    isActive: bool = True
    createdAt: datetime
    updatedAt: datetime

class CreateQcRuleDto(BaseModel):
    pipelineId: Optional[int] = None
    title: str
    description: Optional[str] = None
    penaltyPoints: int = 10
    sortOrder: int = 0
    isActive: bool = True

class UpdateQcRuleDto(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    penaltyPoints: Optional[int] = None
    sortOrder: Optional[int] = None
    isActive: Optional[bool] = None

class CallEvaluationItemDto(BaseModel):
    id: int
    externalCallId: str
    leadId: Optional[int] = None
    leadName: Optional[str] = None
    pipelineId: Optional[int] = None
    pipelineName: Optional[str] = None
    managerId: Optional[int] = None
    managerName: Optional[str] = None
    phone: Optional[str] = None
    callDirection: Optional[str] = None
    callDate: datetime
    durationSeconds: int
    recordingUrl: Optional[str] = None
    status: str
    skipReason: Optional[str] = None
    overallScore: Optional[int] = None
    rulesBreakdown: Optional[List[Dict[str, Any]]] = None
    errorsList: Optional[List[str]] = None
    bottleneck: Optional[str] = None
    summary: Optional[str] = None
    anomalyPoints: int = 0

class CallEvaluationDetailDto(CallEvaluationItemDto):
    transcript: Optional[str] = None
    recommendation: Optional[str] = None

class RescueDealItemDto(BaseModel):
    id: int
    leadId: int
    leadName: Optional[str] = None
    leadPrice: Optional[float] = None
    pipelineId: Optional[int] = None
    pipelineName: Optional[str] = None
    managerName: Optional[str] = None
    lossReasonName: Optional[str] = None
    totalRiskScore: int
    rescueReason: Optional[str] = None
    aiRescueScript: Optional[str] = None
    callsCount: int = 0
    updatedAt: datetime

class QcManagerStatDto(BaseModel):
    managerId: Optional[int] = None
    managerName: str
    totalCalls: int
    analyzedCalls: int
    totalDurationSec: int
    avgDurationSec: int
    avgScore: float
    lowScoreCalls: int
    highScoreCalls: int
    compliancePercent: float

class QcStatsDto(BaseModel):
    totalCalls: int
    analyzedCalls: int
    avgScore: float
    totalAnomalies: int = 0
    lowScoreCalls: int = 0
    highScoreCalls: int = 0
    rescueDealsCount: int
    topMistakes: List[Dict[str, Any]]
    managersStats: List[QcManagerStatDto] = []

