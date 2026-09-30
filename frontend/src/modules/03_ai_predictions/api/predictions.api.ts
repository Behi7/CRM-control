import { baseApi } from '../../../shared/api/base-client';

export interface PredictionParams {
  pipelineId?: number | null;
  period?: 'month' | 'quarter' | 'year';
}

export const predictionsApi = {
  getForecasts: (accountId: number, params: PredictionParams = {}) => {
    const p = new URLSearchParams();
    if (params.pipelineId) p.set('pipeline_id', String(params.pipelineId));
    if (params.period) p.set('period', params.period);
    const qs = p.toString();
    return baseApi<any>(`/py3/forecasts/${accountId}${qs ? `?${qs}` : ''}`);
  },
  getChurnRisk: (accountId: number) =>
    baseApi<any>(`/py3/churn-risk/${accountId}`),
};

// Alias for backwards compatibility
export const py3Api = predictionsApi;
