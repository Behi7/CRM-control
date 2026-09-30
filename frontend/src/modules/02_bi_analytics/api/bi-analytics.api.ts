import { baseApi } from '../../../shared/api/base-client';

export interface BiAnalyticsParams {
  pipelineId?: number | null;
  dateFrom?: string;
  dateTo?: string;
  managerIds?: number[];
  tagIds?: number[];
  sources?: string[];
}

export const biAnalyticsApi = {
  accounts: () => baseApi<any[]>('/py2/accounts'),
  analytics: (accountId: number, params: BiAnalyticsParams = {}) => {
    const p = new URLSearchParams();
    if (params.pipelineId) p.set('pipeline_id', String(params.pipelineId));
    if (params.dateFrom) p.set('date_from', params.dateFrom);
    if (params.dateTo) p.set('date_to', params.dateTo);
    if (params.managerIds?.length) p.set('manager_ids', params.managerIds.join(','));
    if (params.tagIds?.length) p.set('tag_ids', params.tagIds.join(','));
    if (params.sources?.length) p.set('sources', params.sources.join('||'));
    const qs = p.toString();
    return baseApi<any>(`/py2/analytics/${accountId}${qs ? `?${qs}` : ''}`);
  },
  triggerEnrich: (accountId: number) =>
    baseApi<{ ok: boolean; message: string }>(`/py2/analytics/${accountId}/enrich`, { method: 'POST' }),
};

// Alias for backwards compatibility
export const py2Api = biAnalyticsApi;
