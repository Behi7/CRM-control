import { AppError } from './errors';

let accessToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
export const setAccessToken = (t: string | null, refreshToken?: string | null) => {
  accessToken = t;
  if (t) localStorage.setItem('access_token', t);
  else localStorage.removeItem('access_token');
  if (refreshToken !== undefined) {
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    else localStorage.removeItem('refresh_token');
  }
};
export const getAccessToken = () => accessToken || localStorage.getItem('access_token');

let refreshPromise: Promise<string | null> | null = null;

async function refreshSession(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const storedRefresh = localStorage.getItem('refresh_token');
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefresh || undefined }),
      });
      if (!r.ok) return null;
      const data = await r.json();
      setAccessToken(data.accessToken, data.refreshToken);
      return data.accessToken;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as any) };
  const currentToken = getAccessToken(); if (currentToken) headers.Authorization = `Bearer ${currentToken}`;
  let resp = await fetch(`/api${path}`, { ...init, headers, credentials: 'include' });
  if (resp.status === 401 && !path.includes('/auth/')) {
    const newToken = await refreshSession();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      resp = await fetch(`/api${path}`, { ...init, headers, credentials: 'include' });
    } else {
      window.location.href = '/login';
      throw new AppError('UNAUTHORIZED', 'Session expired');
    }
  }
  if (!resp.ok) {
    let errData: any;
    try { errData = await resp.json(); } catch { errData = { error: { code: 'UNKNOWN', message: resp.statusText } }; }
    throw new AppError(errData?.error?.code || 'UNKNOWN', errData?.error?.message || 'Request failed');
  }
  if (resp.status === 204) return null as any;
  return resp.json();
}

export const authApi = {
  login: (email: string, password: string) =>
    api<{ accessToken: string; refreshToken?: string; role: string }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
  logout: () => api<void>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: localStorage.getItem('refresh_token') || undefined }) }),
  refresh: () => refreshSession(),
};

export const adminApi = {
  listAccounts: () => api<any[]>('/admin/accounts'),
  createAccount: (data: any) => api('/admin/accounts', { method: 'POST', body: JSON.stringify(data) }),
  patchAccount: (id: number, data: any) => api(`/admin/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAccount: (id: number) => api(`/admin/accounts/${id}`, { method: 'DELETE' }),
  retryBackfill: (id: number) => api(`/admin/accounts/${id}/retry-backfill`, { method: 'POST' }),
  stopSync: (id: number) => api(`/admin/accounts/${id}/stop-sync`, { method: 'POST' }),
  startSync: (id: number) => api(`/admin/accounts/${id}/start-sync`, { method: 'POST' }),
  listNotifications: (unreadOnly = false) => api<any[]>(`/admin/notifications?unreadOnly=${unreadOnly}`),
  readNotification: (id: number) => api(`/admin/notifications/${id}/read`, { method: 'POST' }),
  getAiSettings: (id: number) => api<{ accountId: number; aiEnabled: boolean; aiModel: string; hasToken: boolean; aiCompanyContext: string }>(`/admin/accounts/${id}/ai-settings`),
  patchAiSettings: (id: number, data: { aiEnabled?: boolean; aiModel?: string; aiToken?: string; aiCompanyContext?: string }) => api(`/admin/accounts/${id}/ai-settings`, { method: 'PATCH', body: JSON.stringify(data) }),
  testAi: (data: { model: string; token: string }) => api<{ ok: boolean; message: string }>('/admin/ai/test', { method: 'POST', body: JSON.stringify(data) }),
};

export interface FilterParams {
  tagIds?: number[];
  managerIds?: number[];
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}

function buildFilterQS(f: FilterParams): string {
  const p = new URLSearchParams();
  if (f.tagIds?.length) p.set('tagIds', f.tagIds.join(','));
  if (f.managerIds?.length) p.set('managerIds', f.managerIds.join(','));
  if (f.dateFrom) p.set('dateFrom', f.dateFrom);
  if (f.dateTo) p.set('dateTo', f.dateTo);
  if (f.status && f.status !== 'all') p.set('status', f.status);
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

export const userApi = {
  pipelines: (accountId: number) => api<{ items: any[]; dataFreshness: any }>(`/accounts/${accountId}/pipelines`),
  tags: (accountId: number) => api<{ items: any[]; dataFreshness: any }>(`/accounts/${accountId}/tags`),
  managers: (accountId: number) => api<{ items: any[]; dataFreshness: any }>(`/accounts/${accountId}/managers`),
  stagesStats: (pipelineId: number, filters: FilterParams = {}) =>
    api<{ items: any[]; dataFreshness: any }>(`/pipelines/${pipelineId}/stages-stats${buildFilterQS(filters)}`),
  activeLeads: (stageId: number, page = 1, perPage = 50, filters: FilterParams = {}) => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('perPage', String(perPage));
    if (filters.tagIds?.length) p.set('tagIds', filters.tagIds.join(','));
    if (filters.managerIds?.length) p.set('managerIds', filters.managerIds.join(','));
    if (filters.dateFrom) p.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) p.set('dateTo', filters.dateTo);
    if (filters.status && filters.status !== 'all') p.set('status', filters.status);
    return api(`/stages/${stageId}/active-leads?${p.toString()}`);
  },
  leadHistory: (leadId: number) => api(`/leads/${leadId}/history`),
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
    return api(`/accounts/${accountId}/leads/search?${p.toString()}`);
  },
  getAiStatus: (accountId: number) => api<{ enabled: boolean; configured: boolean; model: string }>(`/accounts/${accountId}/ai/status`),
  sendAiChat: (accountId: number, data: {
    message: string;
    history?: { role: 'user' | 'model'; text: string }[];
    pipelineId?: number;
    filters?: FilterParams;
    lang?: 'ru' | 'uz';
  }) => api<{ reply: string }>(`/accounts/${accountId}/ai/chat`, { method: 'POST', body: JSON.stringify(data) }),
};

export const py2Api = {
  accounts: () => api<any[]>('/py2/accounts'),
  analytics: (
    accountId: number,
    params: {
      pipelineId?: number | null;
      dateFrom?: string;
      dateTo?: string;
      managerIds?: number[];
      tagIds?: number[];
    } = {},
  ) => {
    const p = new URLSearchParams();
    if (params.pipelineId) p.set('pipeline_id', String(params.pipelineId));
    if (params.dateFrom) p.set('date_from', params.dateFrom);
    if (params.dateTo) p.set('date_to', params.dateTo);
    if (params.managerIds?.length) p.set('manager_ids', params.managerIds.join(','));
    if (params.tagIds?.length) p.set('tag_ids', params.tagIds.join(','));
    const qs = p.toString();
    return api<any>(`/py2/analytics/${accountId}${qs ? `?${qs}` : ''}`);
  },
  triggerEnrich: (accountId: number) =>
    api<{ ok: boolean; message: string }>(`/py2/analytics/${accountId}/enrich`, { method: 'POST' }),
};
