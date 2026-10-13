import { baseApi } from '../../../shared/api/base-client';

export const crmNodesApi = {
  getOverview: (accountId: number) =>
    baseApi<any>(`/accounts/${accountId}/crm-nodes/overview`),
};

