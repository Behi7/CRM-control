import { baseApi } from '../../../shared/api/base-client';

export const leadGeneratorApi = {
  getStats: (accountId: number) =>
    baseApi<any>(`/accounts/${accountId}/lead-generator/stats`),
};
