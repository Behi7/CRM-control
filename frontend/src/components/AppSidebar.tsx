import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  BarChart3,
  Search,
  Users,
  Bell,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Building2,
  Cpu,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { adminApi, py2Api } from '../api/client';
import { decodeJwt } from '../lib/jwt';
import ThemeToggle from './ThemeToggle';
import LanguageSwitcher from './LanguageSwitcher';

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppSidebarLayout({ children }: AppShellProps) {
  const { role, logout } = useAuth();
  const { lang } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ accountId?: string }>();
  const [searchParams] = useSearchParams();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar_collapsed', String(next));
  };

  const decodedAccountId = (() => {
    const token = localStorage.getItem('access_token');
    return decodeJwt(token)?.accountId ?? null;
  })();

  const accountsQuery = useQuery({
    queryKey: ['sidebar-accounts', role],
    queryFn: () => (role === 'admin' ? adminApi.listAccounts() : py2Api.accounts()),
    enabled: !!role,
    staleTime: 60_000,
  });

  const notifsQuery = useQuery({
    queryKey: ['notifs-unread'],
    queryFn: () => adminApi.listNotifications(true),
    enabled: role === 'admin',
    refetchInterval: 60_000,
  });

  const accounts = accountsQuery.data || [];

  const routeAccountId = params.accountId ? parseInt(params.accountId, 10) : null;
  const storedAccountId = Number(localStorage.getItem('active_account_id')) || null;
  const fallbackAccountId =
    role === 'viewer'
      ? decodedAccountId
      : accounts.find((a: any) => a.status === 'connected')?.id || accounts[0]?.id || 1;

  const activeAccountId = routeAccountId || storedAccountId || fallbackAccountId || 1;

  useEffect(() => {
    if (routeAccountId && !isNaN(routeAccountId)) {
      localStorage.setItem('active_account_id', String(routeAccountId));
    }
  }, [routeAccountId]);

  const buildSharedQuery = () => {
    const next = new URLSearchParams();
    ['preset', 'dateFrom', 'dateTo'].forEach((k) => {
      const v = searchParams.get(k);
      if (v) next.set(k, v);
    });
    const str = next.toString();
    return str ? `?${str}` : '';
  };

  const handleAccountChange = (newAccId: number) => {
    localStorage.setItem('active_account_id', String(newAccId));
    const p = location.pathname;
    const qs = buildSharedQuery();
    if (p.includes('/search')) {
      navigate(`/admin/search/${newAccId}${qs}`);
    } else {
      navigate(`/admin/bi/${newAccId}${qs}`);
    }
  };

  const isPathActive = (prefix: string) => location.pathname.startsWith(prefix);

  const analyticsUrl =
    role === 'admin' ? `/admin/bi/${activeAccountId}${buildSharedQuery()}` : `/bi${buildSharedQuery()}`;
  const searchUrl =
    role === 'admin' ? `/admin/search/${activeAccountId}` : `/search`;

  const isAnalyticsActive =
    isPathActive('/admin/bi') ||
    isPathActive('/bi') ||
    isPathActive('/admin/analytics') ||
    isPathActive('/analytics') ||
    isPathActive('/admin/stats') ||
    isPathActive('/stats') ||
    isPathActive('/admin/stage') ||
    isPathActive('/stage') ||
    isPathActive('/admin/lead') ||
    isPathActive('/lead');

  const isSearchActive = isPathActive('/admin/search') || isPathActive('/search');
  const isClientsActive = isPathActive('/admin/clients');
  const isNotifsActive = isPathActive('/admin/notifications');

  const currentAccObj = accounts.find((a: any) => a.id === activeAccountId);

  const labels = {
    appAnalytics: lang === 'uz' ? 'AmoCRM Tahlil Markazi' : 'Аналитика продаж',
    appAnalyticsSub: lang === 'uz' ? 'Moliya, Vaqt, Voronka, UTM' : 'Финансы, Время, Воронка, UTM',
    search: lang === 'uz' ? 'Bitimlarni qidirish' : 'Поиск сделок',
    app03: lang === 'uz' ? 'AI Prognoz (Tez kunda)' : 'AI-Прогнозы',
    clients: lang === 'uz' ? 'AmoCRM Mijozlar' : 'Клиенты AmoCRM',
    notifs: lang === 'uz' ? 'Bildirishnomalar' : 'Уведомления',
    activeAccount: lang === 'uz' ? 'Faol AmoCRM hisobi' : 'Активный аккаунт AmoCRM',
    appsSection: lang === 'uz' ? 'Tahlil ilovalari' : 'Приложения аналитики',
    adminSection: lang === 'uz' ? 'Boshqaruv' : 'Администрирование',
    logout: lang === 'uz' ? 'Chiqish' : 'Выйти',
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 border-r border-slate-800 select-none">
      {/* Brand header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800/80">
        {!collapsed && (
          <div className="font-bold text-base tracking-tight text-white leading-tight truncate">
            Аналитика
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          className={`hidden lg:flex p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer ${
            collapsed ? 'mx-auto' : ''
          }`}
          title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* Account Switcher */}
      {accounts.length > 0 && (
        <div className="p-3 border-b border-slate-800/80">
          {!collapsed ? (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5 flex items-center gap-1">
                <Building2 size={12} className="text-blue-400" />
                {labels.activeAccount}
              </label>
              {role === 'admin' ? (
                <select
                  value={activeAccountId}
                  onChange={(e) => handleAccountChange(Number(e.target.value))}
                  className="w-full bg-slate-800/90 hover:bg-slate-800 text-slate-100 text-xs font-medium rounded-lg px-2.5 py-2 border border-slate-700 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
                >
                  {accounts.map((acc: any) => (
                    <option key={acc.id} value={acc.id}>
                      #{acc.id} • {acc.subdomain}.{acc.baseDomain || 'amocrm.ru'}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="bg-slate-800/70 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 truncate border border-slate-700/60">
                  {currentAccObj ? `${currentAccObj.subdomain}.${currentAccObj.baseDomain}` : `Account #${activeAccountId}`}
                </div>
              )}

              {currentAccObj && (() => {
                const lastSync = currentAccObj.lastSyncedAt;
                const isStale = !lastSync || (Date.now() - new Date(lastSync).getTime() > 30 * 60 * 1000);
                const syncDateStr = lastSync
                  ? new Date(lastSync).toLocaleString(lang === 'uz' ? 'uz-UZ' : 'ru-RU')
                  : (lang === 'uz' ? 'hech qachon' : 'никогда');
                return (
                  <div
                    className={`mt-2.5 p-2.5 rounded-xl text-[11px] leading-snug border ${
                      isStale
                        ? 'bg-yellow-500/10 text-yellow-200 border-yellow-500/30'
                        : 'bg-emerald-500/10 text-emerald-200 border-emerald-500/30'
                    }`}
                  >
                    <div className="font-semibold">
                      {isStale
                        ? (lang === 'uz' ? "⚠️ Ma'lumotlar eskirgan." : '⚠️ Данные устарели.')
                        : (lang === 'uz' ? '✓ Maʼlumotlar yangi' : '✓ Данные актуальны')}
                    </div>
                    <div className="mt-0.5 text-[10px] opacity-90">
                      {lang === 'uz' ? 'Oxirgi sinxronizatsiya: ' : 'Последняя синхронизация: '}
                      <span className="font-medium">{syncDateStr}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="w-10 h-10 mx-auto rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-blue-400"
                title={currentAccObj ? `${currentAccObj.subdomain}.${currentAccObj.baseDomain}` : `Account #${activeAccountId}`}
              >
                #{activeAccountId}
              </div>
              {currentAccObj && (() => {
                const lastSync = currentAccObj.lastSyncedAt;
                const isStale = !lastSync || (Date.now() - new Date(lastSync).getTime() > 30 * 60 * 1000);
                const syncDateStr = lastSync
                  ? new Date(lastSync).toLocaleString(lang === 'uz' ? 'uz-UZ' : 'ru-RU')
                  : (lang === 'uz' ? 'hech qachon' : 'никогда');
                const tip = `${isStale ? '⚠️ Данные устарели. ' : '✓ '}Последняя синхронизация: ${syncDateStr}`;
                return (
                  <div
                    className={`w-10 py-1 rounded-md text-center text-[11px] border ${
                      isStale
                        ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30'
                        : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    }`}
                    title={tip}
                  >
                    {isStale ? '⚠️' : '✓'}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Navigation links */}
      <div className="flex-1 overflow-y-auto py-4 px-2.5 space-y-6">
        <div>
          {!collapsed && (
            <div className="px-2.5 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {labels.appsSection}
            </div>
          )}
          <nav className="space-y-1.5">
            <button
              onClick={() => {
                setMobileOpen(false);
                navigate(analyticsUrl);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                isAnalyticsActive
                  ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-950/50'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
              title={labels.appAnalytics}
            >
              <BarChart3 size={20} className="shrink-0" />
              {!collapsed && (
                <div className="overflow-hidden flex-1">
                  <span className="text-xs font-semibold truncate">{labels.appAnalytics}</span>
                </div>
              )}
            </button>



            <div
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-slate-500 cursor-not-allowed opacity-75"
              title={labels.app03}
            >
              <Cpu size={18} className="shrink-0" />
              {!collapsed && <span className="text-xs truncate">{labels.app03}</span>}
            </div>
          </nav>
        </div>

        {role === 'admin' && (
          <div>
            {!collapsed && (
              <div className="px-2.5 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {labels.adminSection}
              </div>
            )}
            <nav className="space-y-1">
              <button
                onClick={() => {
                  setMobileOpen(false);
                  navigate('/admin/clients');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                  isClientsActive
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
                title={labels.clients}
              >
                <Users size={18} className="shrink-0" />
                {!collapsed && <span className="text-xs truncate">{labels.clients}</span>}
              </button>

              <button
                onClick={() => {
                  setMobileOpen(false);
                  navigate('/admin/notifications');
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                  isNotifsActive
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
                title={labels.notifs}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <Bell size={18} className="shrink-0" />
                  {!collapsed && <span className="text-xs truncate">{labels.notifs}</span>}
                </div>
                {notifsQuery.data && notifsQuery.data.length > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {notifsQuery.data.length}
                  </span>
                )}
              </button>
            </nav>
          </div>
        )}
      </div>

      {/* Footer controls */}
      <div className="p-3 border-t border-slate-800/80 space-y-2">
        {!collapsed ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-red-400 hover:bg-slate-800 transition-colors cursor-pointer"
              title={labels.logout}
            >
              <LogOut size={15} />
              <span>{labels.logout}</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <ThemeToggle />
            <button
              onClick={logout}
              className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors cursor-pointer"
              title={labels.logout}
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <aside
        className={`hidden lg:block shrink-0 transition-all duration-200 ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className={`fixed top-0 left-0 bottom-0 z-30 ${collapsed ? 'w-20' : 'w-64'}`}>
          {sidebarContent}
        </div>
      </aside>

      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-slate-900 text-white z-40 px-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800"
          >
            <Menu size={22} />
          </button>
          <span className="font-bold text-sm">Аналитика</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 h-full">{sidebarContent}</div>
          <div
            className="flex-1 bg-black/50 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          >
            <button className="m-4 p-2 rounded-full bg-slate-900 text-white">
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 pt-14 lg:pt-0">{children}</div>
    </div>
  );
}
