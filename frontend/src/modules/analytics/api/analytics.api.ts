import { baseApi } from '../../../shared/api/base-client';

export interface FilterParams {
  tagIds?: number[];
  managerIds?: number[];
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}

export function buildFilterQS(f: FilterParams): string {
  const p = new URLSearchParams();
  if (f.tagIds?.length) p.set('tagIds', f.tagIds.join(','));
  if (f.managerIds?.length) p.set('managerIds', f.managerIds.join(','));
  if (f.dateFrom) p.set('dateFrom', f.dateFrom);
  if (f.dateTo) p.set('dateTo', f.dateTo);
  if (f.status && f.status !== 'all') p.set('status', f.status);
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

export interface AnalyticsParams {
  pipelineId?: number | null;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  managerIds?: number[];
  tagIds?: number[];
  sources?: string[];
}

export const analyticsApi = {
  accounts: () => baseApi<any[]>('/accounts'),
  analytics: (accountId: number, params: AnalyticsParams = {}) => {
    const p = new URLSearchParams();
    if (params.pipelineId) p.set('pipeline_id', String(params.pipelineId));
    if (params.dateFrom) p.set('date_from', params.dateFrom);
    if (params.dateTo) p.set('date_to', params.dateTo);
    if (params.status && params.status !== 'all') p.set('status', params.status);
    if (params.managerIds?.length) p.set('manager_ids', params.managerIds.join(','));
    if (params.tagIds?.length) p.set('tag_ids', params.tagIds.join(','));
    if (params.sources?.length) p.set('sources', params.sources.join('||'));
    const qs = p.toString();
    return baseApi<any>(`/analytics/${accountId}${qs ? `?${qs}` : ''}`);
  },
  triggerEnrich: (accountId: number) =>
    baseApi<{ ok: boolean; message: string }>(`/analytics/${accountId}/enrich`, { method: 'POST' }),
  pipelines: (accountId: number) =>
    baseApi<{ items: any[]; dataFreshness: any }>(`/accounts/${accountId}/pipelines`),
  tags: (accountId: number) =>
    baseApi<{ items: any[]; dataFreshness: any }>(`/accounts/${accountId}/tags`),
  managers: (accountId: number) =>
    baseApi<{ items: any[]; dataFreshness: any }>(`/accounts/${accountId}/managers`),
  stagesStats: (pipelineId: number, filters: FilterParams = {}) =>
    baseApi<{ items: any[]; dataFreshness: any }>(`/pipelines/${pipelineId}/stages-stats${buildFilterQS(filters)}`),
  allStagesStats: (accountId: number, filters: FilterParams = {}) =>
    baseApi<{
      pipelines: Array<{
        pipelineId: number;
        pipelineName: string;
        totalPassedLeads: number;
        totalActiveLeads: number;
        items: any[];
      }>;
      dataFreshness: any;
    }>(`/accounts/${accountId}/all-stages-stats${buildFilterQS(filters)}`),
  activeLeads: (stageId: number, page = 1, perPage = 50, filters: FilterParams = {}) => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('perPage', String(perPage));
    if (filters.tagIds?.length) p.set('tagIds', filters.tagIds.join(','));
    if (filters.managerIds?.length) p.set('managerIds', filters.managerIds.join(','));
    if (filters.dateFrom) p.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) p.set('dateTo', filters.dateTo);
    if (filters.status && filters.status !== 'all') p.set('status', filters.status);
    return baseApi(`/stages/${stageId}/leads?${p.toString()}`);
  },
  leadHistory: (leadId: number) => baseApi(`/leads/${leadId}/history`),
  leadSkips: (leadId: number) => baseApi(`/leads/${leadId}/skips`),
  searchLeads: (accountId: number, q: string, page = 1, perPage = 50, filters: FilterParams = {}) => {
    const p = new URLSearchParams();
    p.set('q', q);
    p.set('page', String(page));
    p.set('perPage', String(perPage));
    if (filters.tagIds?.length) p.set('tagIds', filters.tagIds.join(','));
    if (filters.managerIds?.length) p.set('managerIds', filters.managerIds.join(','));
    if (filters.dateFrom) p.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) p.set('dateTo', filters.dateTo);
    if (filters.status && filters.status !== 'all') p.set('status', filters.status);
    return baseApi(`/accounts/${accountId}/leads/search?${p.toString()}`);
  },
};

// Aliases for backwards compatibility
export const biAnalyticsApi = analyticsApi;
export const py2Api = analyticsApi;
export const timeAnalyticsApi = analyticsApi;
export type BiAnalyticsParams = AnalyticsParams;
