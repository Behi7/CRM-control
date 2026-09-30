import { baseApi, refreshSession } from '../../../shared/api/base-client';

export const authApi = {
  login: (email: string, password: string) =>
    baseApi<{ accessToken: string; refreshToken?: string; role: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () =>
    baseApi<void>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: localStorage.getItem('refresh_token') || undefined }),
    }),
  refresh: () => refreshSession(),
};
