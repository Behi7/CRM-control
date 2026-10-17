from typing import Optional, List, Dict, Any
from pydantic import BaseModel

class AnomalyManagerStatDto(BaseModel):
    managerId: Optional[int] = None
    managerName: str = "Не назначен"
    totalLost: int = 0
    auditedCount: int = 0
    criticalCount: int = 0
    warningCount: int = 0
    fairCount: int = 0
    lostBudget: float = 0.0
    avgScore: float = 0.0
    compliancePercent: float = 0.0
    topFactor: Optional[str] = None

class AnomalyStatsDto(BaseModel):
    totalLostLeads: int = 0
    totalAudited: int = 0
    criticalSlippedLeads: int = 0
    criticalLostBudget: float = 0.0
    criticalPercent: float = 0.0
    topStatedReasons: List[Dict[str, Any]] = []
    topRealReasons: List[Dict[str, Any]] = []
    topSlipManagers: List[Dict[str, Any]] = []
    managersStats: List[AnomalyManagerStatDto] = []

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

class LeadTaskSummaryDto(BaseModel):
    id: int
    externalTaskId: str
    text: Optional[str] = None
    isCompleted: bool
    taskCreatedAt: str
    completeTill: Optional[str] = None
    taskClosedAt: Optional[str] = None

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
    tasks: List[LeadTaskSummaryDto] = []
    isReviewed: bool

class AnalyzeBatchRequestDto(BaseModel):
    pipelineId: Optional[int] = None
    limit: Optional[int] = 25
    forceReanalyze: Optional[bool] = False

class ReviewAuditRequestDto(BaseModel):
    isReviewed: bool = True
