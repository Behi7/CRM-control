from typing import Optional, List, Dict, Any
from pydantic import BaseModel

class AnomalyStatsDto(BaseModel):
    totalLostLeads: int = 0
    totalAudited: int = 0
    criticalSlippedLeads: int = 0
    criticalLostBudget: float = 0.0
    criticalPercent: float = 0.0
    topStatedReasons: List[Dict[str, Any]] = []
    topRealReasons: List[Dict[str, Any]] = []
    topSlipManagers: List[Dict[str, Any]] = []

class AnomalyDealListItemDto(BaseModel):
    id: int
    leadId: int
    leadExternalId: str
    leadName: str
    price: float
    pipelineId: Optional[int] = None
    pipelineName: Optional[str] = None
    responsibleUserId: Optional[int] = None
    responsibleUserName: Optional[str] = None
    closedAt: Optional[str] = None
    statedLossReason: Optional[str] = None
    realLossReason: Optional[str] = None
    anomalyScore: int
    anomalyLevel: str
    managerFault: str
    keyFactor: str
    hasAiVerdict: bool
    isReviewed: bool

class AnomalyDealListResponseDto(BaseModel):
    items: List[AnomalyDealListItemDto]
    total: int
    page: int
    pageSize: int
    totalPages: int

class TimelineStageDto(BaseModel):
    stageId: int
    stageName: str
    sortOrder: int
    durationHours: float
    benchmarkHours: float
    isStagnant: bool
    isSkipped: bool
    enteredAt: str
    exitedAt: Optional[str] = None

class CallEvaluationSummaryDto(BaseModel):
    id: int
    externalCallId: str
    callDate: str
    durationSeconds: int
    qcScore: Optional[int] = None
    errorsList: Optional[List[str]] = None
    bottleneck: Optional[str] = None
    summary: Optional[str] = None

class DealForensicDetailDto(BaseModel):
    auditId: int
    leadId: int
    leadExternalId: str
    leadName: str
    price: float
    pipelineId: Optional[int] = None
    pipelineName: Optional[str] = None
    responsibleUserId: Optional[int] = None
    responsibleUserName: Optional[str] = None
    crmCreatedAt: str
    crmClosedAt: Optional[str] = None
    statedLossReason: Optional[str] = None
    realLossReason: Optional[str] = None
    anomalyScore: int
    anomalyLevel: str
    managerFault: str
    pivotPoint: Optional[str] = None
    forensicSummary: Optional[str] = None
    ropRecommendation: Optional[str] = None
    scoreBreakdown: Optional[Dict[str, Any]] = None
    stagesTimeline: List[TimelineStageDto] = []
    calls: List[CallEvaluationSummaryDto] = []
    isReviewed: bool

class AnalyzeBatchRequestDto(BaseModel):
    pipelineId: Optional[int] = None
    limit: Optional[int] = 25
    forceReanalyze: Optional[bool] = False

class ReviewAuditRequestDto(BaseModel):
    isReviewed: bool = True
