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

export async function refreshSession(): Promise<string | null> {
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

export async function baseApi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as any) };
  const currentToken = getAccessToken();
  if (currentToken) headers.Authorization = `Bearer ${currentToken}`;

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
    try {
      errData = await resp.json();
    } catch {
      errData = { error: { code: 'UNKNOWN', message: resp.statusText } };
    }
    throw new AppError(errData?.error?.code || 'UNKNOWN', errData?.error?.message || 'Request failed');
  }
  if (resp.status === 204) return null as any;
  return resp.json();
}
