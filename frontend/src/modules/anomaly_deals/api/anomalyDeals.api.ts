import { baseApi } from '../../../shared/api/base-client';

export const anomalyDealsApi = {
  getSummary: (accountId: number) =>
    baseApi<any>(`/accounts/${accountId}/anomaly-deals/summary`),
};

