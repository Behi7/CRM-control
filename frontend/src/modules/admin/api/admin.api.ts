import { baseApi } from '../../../shared/api/base-client';

export const adminApi = {
  listAccounts: () => baseApi<any[]>('/admin/accounts'),
  createAccount: (data: any) => baseApi('/admin/accounts', { method: 'POST', body: JSON.stringify(data) }),
  patchAccount: (id: number, data: any) => baseApi(`/admin/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAccount: (id: number) => baseApi(`/admin/accounts/${id}`, { method: 'DELETE' }),
  retryBackfill: (id: number) => baseApi(`/admin/accounts/${id}/retry-backfill`, { method: 'POST' }),
  stopSync: (id: number) => baseApi(`/admin/accounts/${id}/stop-sync`, { method: 'POST' }),
  startSync: (id: number) => baseApi(`/admin/accounts/${id}/start-sync`, { method: 'POST' }),
  listNotifications: (unreadOnly = false) => baseApi<any[]>(`/admin/notifications?unreadOnly=${unreadOnly}`),
  readNotification: (id: number) => baseApi(`/admin/notifications/${id}/read`, { method: 'POST' }),
  getAiSettings: (id: number) =>
    baseApi<{
      accountId: number;
      aiEnabled: boolean;
      aiModel: string;
      hasToken: boolean;
      aiCompanyContext: string;
      qcEnabled?: boolean;
      qcMinDurationSec?: number;
      qcMaxDurationSec?: number;
      qcRescueThresholdScore?: number;
      qcSystemPrompt?: string | null;
    }>(`/admin/accounts/${id}/ai-settings`),
  patchAiSettings: (
    id: number,
    data: {
      aiEnabled?: boolean;
      aiModel?: string;
      aiToken?: string;
      aiCompanyContext?: string;
      qcEnabled?: boolean;
      qcMinDurationSec?: number;
      qcMaxDurationSec?: number;
      qcRescueThresholdScore?: number;
      qcSystemPrompt?: string | null;
    }
  ) => baseApi(`/admin/accounts/${id}/ai-settings`, { method: 'PATCH', body: JSON.stringify(data) }),
  testAi: (data: { model: string; token: string }) =>
    baseApi<{ ok: boolean; message: string }>('/admin/ai/test', { method: 'POST', body: JSON.stringify(data) }),
};
