/**
 * Legacy API client facade (Re-exports from modular services)
 */
import { timeAnalyticsApi } from '../modules/01_time_analytics/api/time-analytics.api';
import { aiChatApi } from '../modules/ai_chat/api/ai-chat.api';

export { setAccessToken, getAccessToken, refreshSession, baseApi as api } from '../shared/api/base-client';
export { AppError } from '../shared/api/errors';
export { authApi } from '../modules/auth/api/auth.api';
export { adminApi } from '../modules/admin/api/admin.api';
export { type FilterParams } from '../modules/01_time_analytics/api/time-analytics.api';
export { biAnalyticsApi as py2Api, type BiAnalyticsParams } from '../modules/02_bi_analytics/api/bi-analytics.api';
export { predictionsApi as py3Api, type PredictionParams } from '../modules/03_ai_predictions/api/predictions.api';
export { aiChatApi } from '../modules/ai_chat/api/ai-chat.api';

export const userApi = {
  ...timeAnalyticsApi,
  getAiStatus: (accountId: number) => aiChatApi.getStatus(accountId),
  sendAiChat: (accountId: number, data: any) => aiChatApi.sendMessage(accountId, data),
};
