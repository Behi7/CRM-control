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

export const timeAnalyticsApi = {
  pipelines: (accountId: number) =>
    baseApi<{ items: any[]; dataFreshness: any }>(`/accounts/${accountId}/pipelines`),
  tags: (accountId: number) =>
    baseApi<{ items: any[]; dataFreshness: any }>(`/accounts/${accountId}/tags`),
  managers: (accountId: number) =>
    baseApi<{ items: any[]; dataFreshness: any }>(`/accounts/${accountId}/managers`),
  stagesStats: (pipelineId: number, filters: FilterParams = {}) =>
    baseApi<{ items: any[]; dataFreshness: any }>(`/pipelines/${pipelineId}/stages-stats${buildFilterQS(filters)}`),
  activeLeads: (stageId: number, page = 1, perPage = 50, filters: FilterParams = {}) => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('perPage', String(perPage));
    if (filters.tagIds?.length) p.set('tagIds', filters.tagIds.join(','));
    if (filters.managerIds?.length) p.set('managerIds', filters.managerIds.join(','));
    if (filters.dateFrom) p.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) p.set('dateTo', filters.dateTo);
    if (filters.status && filters.status !== 'all') p.set('status', filters.status);
    return baseApi(`/stages/${stageId}/active-leads?${p.toString()}`);
  },
  leadHistory: (leadId: number) => baseApi(`/leads/${leadId}/history`),
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

// Alias for backwards compatibility
export const userApi = timeAnalyticsApi;
