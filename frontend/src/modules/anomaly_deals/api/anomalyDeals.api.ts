import { baseApi } from '../../../shared/api/base-client';

export interface AnomalyManagerStat {
  managerId: number | null;
  managerName: string;
  totalLost: number;
  auditedCount: number;
  criticalCount: number;
  warningCount: number;
  fairCount: number;
  lostBudget: number;
  avgScore: number;
  compliancePercent: number;
  topFactor?: string;
}

export interface AnomalyStats {
  totalLostLeads: number;
  totalAudited: number;
  criticalSlippedLeads: number;
  criticalLostBudget: number;
  criticalPercent: number;
  topStatedReasons: Array<{ reason: string; count: number; budget: number }>;
  topRealReasons: Array<{ reason: string; count: number; budget: number }>;
  topSlipManagers: Array<{ name: string; criticalCount: number; lostBudget: number }>;
  managersStats?: AnomalyManagerStat[];
}

export interface AnomalyDealItem {
  id: number;
  leadId: number;
  leadExternalId: string;
  leadName: string;
  price: number;
  pipelineId?: number;
  pipelineName?: string;
  responsibleUserId?: number;
  responsibleUserName?: string;
  closedAt?: string;
  statedLossReason?: string;
  realLossReason?: string;
  anomalyScore: number;
  anomalyLevel: 'critical' | 'warning' | 'fair';
  managerFault: 'high' | 'medium' | 'none';
  keyFactor: string;
  hasAiVerdict: boolean;
  isReviewed: boolean;
  auditedAt?: string;
}

export interface AnomalyDealListResponse {
  items: AnomalyDealItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TimelineStage {
  stageId: number;
  stageName: string;
  sortOrder: number;
  durationHours: number;
  benchmarkHours: number;
  isStagnant: boolean;
  isSkipped: boolean;
  enteredAt: string;
  exitedAt?: string;
}

export interface CallEvaluationSummary {
  id: number;
  externalCallId: string;
  callDate: string;
  durationSeconds: number;
  qcScore?: number;
  errorsList?: string[];
  bottleneck?: string;
  summary?: string;
}

export interface LeadTaskSummary {
  id: number;
  externalTaskId: string;
  text?: string;
  isCompleted: boolean;
  taskCreatedAt: string;
  completeTill?: string;
  taskClosedAt?: string;
}

export interface DealForensicDetail {
  auditId: number;
  leadId: number;
  leadExternalId: string;
  leadName: string;
  price: number;
  pipelineId?: number;
  pipelineName?: string;
  responsibleUserId?: number;
  responsibleUserName?: string;
  crmCreatedAt: string;
  crmClosedAt?: string;
  statedLossReason?: string;
  realLossReason?: string;
  anomalyScore: number;
  anomalyLevel: 'critical' | 'warning' | 'fair';
  managerFault: 'high' | 'medium' | 'none';
  pivotPoint?: string;
  forensicSummary?: string;
  ropRecommendation?: string;
  scoreBreakdown?: Record<string, any>;
  stagesTimeline: TimelineStage[];
  calls: CallEvaluationSummary[];
  tasks?: LeadTaskSummary[];
  isReviewed: boolean;
  auditedAt?: string;
}

export const anomalyDealsApi = {
  getStats: (accountId: number, pipelineId?: number) => {
    const qs = pipelineId ? `?pipelineId=${pipelineId}` : '';
    return baseApi<AnomalyStats>(`/accounts/${accountId}/anomaly-deals/stats${qs}`);
  },

  getList: (
    accountId: number,
    params: {
      pipelineId?: number;
      managerId?: number;
      level?: string;
      minPrice?: number;
      search?: string;
      page?: number;
      pageSize?: number;
    } = {}
  ) => {
    const query = new URLSearchParams();
    if (params.pipelineId) query.set('pipelineId', String(params.pipelineId));
    if (params.managerId) query.set('managerId', String(params.managerId));
    if (params.level && params.level !== 'all') query.set('level', params.level);
    if (params.minPrice) query.set('minPrice', String(params.minPrice));
    if (params.search && params.search.trim()) query.set('search', params.search.trim());
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));

    const qs = query.toString();
    return baseApi<AnomalyDealListResponse>(
      `/accounts/${accountId}/anomaly-deals/list${qs ? `?${qs}` : ''}`
    );
  },

  getForensic: (accountId: number, leadId: number) =>
    baseApi<DealForensicDetail>(
      `/accounts/${accountId}/anomaly-deals/leads/${leadId}/forensic`
    ),

  batchAnalyze: (
    accountId: number,
    data: { pipelineId?: number; limit?: number; forceReanalyze?: boolean }
  ) =>
    baseApi<{ status: string; processed: number }>(
      `/accounts/${accountId}/anomaly-deals/batch-analyze`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  reviewLead: (accountId: number, leadId: number, isReviewed: boolean = true) =>
    baseApi<{ status: string; isReviewed: boolean }>(
      `/accounts/${accountId}/anomaly-deals/leads/${leadId}/review`,
      {
        method: 'POST',
        body: JSON.stringify({ isReviewed }),
      }
    ),
};
