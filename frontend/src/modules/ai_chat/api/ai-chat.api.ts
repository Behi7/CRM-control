import { baseApi } from '../../../shared/api/base-client';
import { FilterParams } from '../../analytics/api/analytics.api';

export interface SendAiChatPayload {
  message: string;
  history?: { role: 'user' | 'model'; text: string }[];
  pipelineId?: number;
  filters?: FilterParams;
  lang?: 'ru' | 'uz';
  biData?: any;
  biSelectedBlocks?: string[];
  stagePipelineChoice?: number | 'all';
}

export const aiChatApi = {
  getStatus: (accountId: number) =>
    baseApi<{ enabled: boolean; configured: boolean; model: string }>(`/accounts/${accountId}/ai-status`),
  sendMessage: (accountId: number, data: SendAiChatPayload) =>
    baseApi<{ reply: string }>(`/accounts/${accountId}/ai-chat`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
