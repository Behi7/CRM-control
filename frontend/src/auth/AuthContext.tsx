import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi, setAccessToken } from '../api/client';
import { decodeJwt } from '../lib/jwt';

interface AuthState {
  role: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<string | null>(() => {
    const existing = localStorage.getItem('access_token');
    if (existing) {
      const payload = decodeJwt(existing);
      if (payload?.role && (!payload.exp || payload.exp * 1000 > Date.now())) {
        return payload.role;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const existing = localStorage.getItem('access_token');
    if (existing) {
      const payload = decodeJwt(existing);
      if (payload?.role && (!payload.exp || payload.exp * 1000 > Date.now())) {
        setAccessToken(existing);
        return false;
      }
    }
    return true;
  });

  useEffect(() => {
    (async () => {
      const existing = localStorage.getItem('access_token');
      if (existing) {
        const payload = decodeJwt(existing);
        if (payload?.role && (!payload.exp || payload.exp * 1000 > Date.now())) {
          setAccessToken(existing);
          setRole(payload.role);
          setLoading(false);
          return;
        }
      }
      const token = await authApi.refresh();
      if (token) {
        const payload = decodeJwt(token);
        setRole(payload?.role || null);
      } else {
        setAccessToken(null, null);
        setRole(null);
      }
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setAccessToken(res.accessToken, res.refreshToken || null);
    setRole(res.role);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore logout error
    }
    setAccessToken(null, null);
    setRole(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ role, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
