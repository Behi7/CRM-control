import { baseApi } from '../../../shared/api/base-client';

export interface QcSettings {
  accountId: number;
  isEnabled: boolean;
  aiModel: string;
  minDurationSec: number;
  maxDurationSec: number;
  rescueThresholdScore: number;
  lastCallSyncedAt?: string | null;
}

export interface QcRule {
  id: number;
  accountId: number;
  pipelineId?: number | null;
  title: string;
  description?: string | null;
  penaltyPoints: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CallEvaluationItem {
  id: number;
  externalCallId: string;
  leadId?: number | null;
  leadName?: string | null;
  pipelineId?: number | null;
  pipelineName?: string | null;
  managerId?: number | null;
  managerName?: string | null;
  phone?: string | null;
  callDirection?: 'in' | 'out' | null;
  callDate: string;
  durationSeconds: number;
  recordingUrl?: string | null;
  status: string;
  skipReason?: string | null;
  overallScore?: number | null;
  rulesBreakdown?: Array<{
    rule_id?: number | null;
    rule_title?: string;
    passed?: boolean;
    penalty?: number;
    details?: string;
  }> | null;
  errorsList?: string[] | null;
  bottleneck?: string | null;
  summary?: string | null;
  anomalyPoints: number;
}

export interface CallEvaluationDetail extends CallEvaluationItem {
  transcript?: string | null;
  recommendation?: string | null;
}

export interface RescueDealItem {
  id: number;
  leadId: number;
  leadName?: string | null;
  leadPrice?: number | null;
  pipelineId?: number | null;
  pipelineName?: string | null;
  managerName?: string | null;
  lossReasonName?: string | null;
  totalRiskScore: number;
  rescueReason?: string | null;
  aiRescueScript?: string | null;
  callsCount: number;
  updatedAt: string;
}

export interface QcStats {
  totalCalls: number;
  analyzedCalls: number;
  avgScore: number;
  totalAnomalies: number;
  rescueDealsCount: number;
  topMistakes: Array<{ mistake: string; count: number }>;
}

export const qcApi = {
  getSettings: async (accountId: number): Promise<QcSettings> => {
    return baseApi<QcSettings>(`/accounts/${accountId}/qc/settings`);
  },

  updateSettings: async (accountId: number, data: Partial<QcSettings>): Promise<QcSettings> => {
    return baseApi<QcSettings>(`/accounts/${accountId}/qc/settings`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  listRules: async (accountId: number, pipelineId?: number): Promise<QcRule[]> => {
    const params = pipelineId ? `?pipeline_id=${pipelineId}` : '';
    return baseApi<QcRule[]>(`/accounts/${accountId}/qc/rules${params}`);
  },

  createRule: async (
    accountId: number,
    data: {
      pipelineId?: number | null;
      title: string;
      description?: string;
      penaltyPoints?: number;
      sortOrder?: number;
      isActive?: boolean;
    }
  ): Promise<QcRule> => {
    return baseApi<QcRule>(`/accounts/${accountId}/qc/rules`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateRule: async (accountId: number, ruleId: number, data: Partial<QcRule>): Promise<QcRule> => {
    return baseApi<QcRule>(`/accounts/${accountId}/qc/rules/${ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteRule: async (accountId: number, ruleId: number): Promise<{ ok: boolean }> => {
    return baseApi<{ ok: boolean }>(`/accounts/${accountId}/qc/rules/${ruleId}`, {
      method: 'DELETE',
    });
  },

  listCalls: async (
    accountId: number,
    params: {
      page?: number;
      limit?: number;
      scoreFilter?: string;
      managerId?: number;
      pipelineId?: number;
      status?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
    }
  ): Promise<{ items: CallEvaluationItem[]; total: number; page: number; limit: number }> => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.scoreFilter && params.scoreFilter !== 'all') qs.set('scoreFilter', params.scoreFilter);
    if (params.managerId) qs.set('managerId', String(params.managerId));
    if (params.pipelineId) qs.set('pipelineId', String(params.pipelineId));
    if (params.status) qs.set('status', params.status);
    if (params.search) qs.set('search', params.search);
    if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params.dateTo) qs.set('dateTo', params.dateTo);

    return baseApi(`/accounts/${accountId}/qc/calls?${qs.toString()}`);
  },

  getCallDetail: async (accountId: number, callId: number): Promise<CallEvaluationDetail> => {
    return baseApi<CallEvaluationDetail>(`/accounts/${accountId}/qc/calls/${callId}`);
  },

  listRescueDeals: async (accountId: number, pipelineId?: number): Promise<RescueDealItem[]> => {
    const params = pipelineId ? `?pipeline_id=${pipelineId}` : '';
    return baseApi<RescueDealItem[]>(`/accounts/${accountId}/qc/rescue-deals${params}`);
  },

  getStats: async (accountId: number, pipelineId?: number): Promise<QcStats> => {
    const params = pipelineId ? `?pipeline_id=${pipelineId}` : '';
    return baseApi<QcStats>(`/accounts/${accountId}/qc/stats${params}`);
  },
};
