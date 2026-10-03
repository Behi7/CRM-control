/**
 * API client facade (Re-exports from modular services)
 */
import { analyticsApi, FilterParams } from '../modules/analytics/api/analytics.api';
import { aiChatApi } from '../modules/ai_chat/api/ai-chat.api';

export { setAccessToken, getAccessToken, refreshSession, baseApi as api } from '../shared/api/base-client';
export { AppError } from '../shared/api/errors';
export { authApi } from '../modules/auth/api/auth.api';
export { adminApi } from '../modules/admin/api/admin.api';
export {
  analyticsApi,
  biAnalyticsApi as py2Api,
  timeAnalyticsApi,
  type FilterParams,
  type AnalyticsParams,
  type BiAnalyticsParams,
} from '../modules/analytics/api/analytics.api';
export { predictionsApi as py3Api, type PredictionParams } from '../modules/03_ai_predictions/api/predictions.api';
export { aiChatApi } from '../modules/ai_chat/api/ai-chat.api';

export const userApi = {
  ...analyticsApi,
  getAiStatus: (accountId: number) => aiChatApi.getStatus(accountId),
  sendAiChat: (accountId: number, data: any) => aiChatApi.sendMessage(accountId, data),
};
