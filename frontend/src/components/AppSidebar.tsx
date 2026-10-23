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
  Headphones,
  Network,
  AlertTriangle,
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
  const { lang, setLang } = useLanguage();
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

  const qcUrl =
    role === 'admin' ? `/admin/qc/${activeAccountId}` : `/qc`;
  const isQcActive = isPathActive('/admin/qc') || isPathActive('/qc') || isPathActive('/admin/quality') || isPathActive('/quality');

  const predictionsUrl =
    role === 'admin' ? `/admin/predictions/${activeAccountId}` : `/predictions`;
  const isPredictionsActive = isPathActive('/admin/predictions') || isPathActive('/predictions');

  const crmNodesUrl =
    role === 'admin' ? `/admin/crm-nodes/${activeAccountId}` : `/crm-nodes`;
  const isCrmNodesActive = isPathActive('/admin/crm-nodes') || isPathActive('/crm-nodes');

  const anomalyDealsUrl =
    role === 'admin' ? `/admin/anomaly-deals/${activeAccountId}` : `/anomaly-deals`;
  const isAnomalyDealsActive = isPathActive('/admin/anomaly-deals') || isPathActive('/anomaly-deals');

  const currentAccObj = accounts.find((a: any) => a.id === activeAccountId) || accounts[0];
  const isAiGlobalEnabled = currentAccObj?.aiEnabled !== false;
  const isQcEnabled = isAiGlobalEnabled && (currentAccObj?.qcEnabled !== false);
  const isAnomalyEnabled = isAiGlobalEnabled && (currentAccObj?.anomalyEnabled !== false);
  const showQcItem = role === 'admin' || isQcEnabled;
  const showAnomalyItem = role === 'admin' || isAnomalyEnabled;

  const amoAccountName = currentAccObj?.subdomain || 'AmoCRM';
  const fullDomain = currentAccObj?.subdomain
    ? `${currentAccObj.subdomain}.${currentAccObj.baseDomain || 'amocrm.ru'}`
    : 'AmoCRM';

  const labels = {
    appAnalytics: lang === 'uz' ? 'AmoCRM Tahlil Markazi' : 'Аналитика продаж',
    appAnalyticsSub: lang === 'uz' ? 'Moliya, Vaqt, Voronka, UTM' : 'Финансы, Время, Воронка, UTM',
    qcApp: lang === 'uz' ? 'Sifat nazorati (QC)' : 'Контроль качества',
    search: lang === 'uz' ? 'Bitimlarni qidirish' : 'Поиск сделок',
    app03: lang === 'uz' ? 'AI-Prognozlar' : 'AI-Прогнозы',
    crmNodes: lang === 'uz' ? 'CRM Tugunlari' : 'CRM Ноды',
    anomalyDeals: lang === 'uz' ? 'Anomal bitimlar' : 'Аномальные сделки',
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
      <div className="h-16 px-3 flex items-center justify-between border-b border-slate-800/80">
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden pl-1 flex-1 min-w-0 mr-2">
            <div
              className="font-bold text-sm tracking-tight text-white leading-tight truncate capitalize"
              title={role === 'admin' ? (lang === 'uz' ? 'Analitika' : 'Аналитика') : fullDomain}
            >
              {role === 'admin' ? (lang === 'uz' ? 'Analitika' : 'Аналитика') : amoAccountName}
            </div>
            {role !== 'admin' && currentAccObj && (() => {
              const lastSync = currentAccObj.lastSyncedAt;
              const isStale = !lastSync || (Date.now() - new Date(lastSync).getTime() > 30 * 60 * 1000);
              return (
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${isStale ? 'bg-amber-400' : 'bg-emerald-400'}`}
                  title={isStale ? (lang === 'uz' ? '⚠️ Ma’lumotlar eskirgan' : '⚠️ Данные устарели') : (lang === 'uz' ? '✓ Ma’lumotlar yangi' : '✓ Данные актуальны')}
                />
              );
            })()}
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          className={`hidden lg:flex w-10 h-10 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer items-center justify-center shrink-0 ${
            collapsed ? 'mx-auto' : ''
          }`}
        >
          {collapsed ? <ChevronRight size={20} className="shrink-0" /> : <ChevronLeft size={20} className="shrink-0" />}
        </button>
      </div>

      {/* Account Switcher (only for admin) */}
      {role === 'admin' && accounts.length > 0 && (
        <div className="p-3 border-b border-slate-800/80">
          {!collapsed ? (
            <div>
              <select
                value={activeAccountId}
                onChange={(e) => handleAccountChange(Number(e.target.value))}
                className="w-full bg-slate-800/90 hover:bg-slate-800 text-slate-100 text-xs font-medium rounded-lg px-2.5 py-2 border border-slate-700 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer truncate"
              >
                {accounts.map((acc: any) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.subdomain ? `${acc.subdomain}.${acc.baseDomain || 'amocrm.ru'}` : (acc.name || 'Аккаунт')}
                  </option>
                ))}
              </select>

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
            (() => {
              const lastSync = currentAccObj?.lastSyncedAt;
              const isStale = !lastSync || (Date.now() - new Date(lastSync).getTime() > 30 * 60 * 1000);
              const accDomain = currentAccObj?.subdomain
                ? `${currentAccObj.subdomain}.${currentAccObj.baseDomain || 'amocrm.ru'}`
                : 'Аккаунт';
              const syncDateStr = lastSync
                ? new Date(lastSync).toLocaleString(lang === 'uz' ? 'uz-UZ' : 'ru-RU')
                : (lang === 'uz' ? 'hech qachon' : 'никогда');
              const statusStr = isStale ? (lang === 'uz' ? '⚠️ Ma’lumotlar eskirgan' : '⚠️ Данные устарели') : (lang === 'uz' ? '✓ Ma’lumotlar yangi' : '✓ Данные актуальны');
              const syncLabel = lang === 'uz' ? 'sinxron' : 'синхр';
              const tip = `${accDomain} (${statusStr}, ${syncLabel}: ${syncDateStr})`;

              return (
                <div className="flex justify-center">
                  <div
                    className="w-10 h-10 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 flex items-center justify-center relative cursor-pointer transition-colors shrink-0"
                    title={tip}
                    onClick={
                      accounts.length > 1
                        ? () => {
                            const nextIdx = (accounts.findIndex((a: any) => a.id === activeAccountId) + 1) % accounts.length;
                            handleAccountChange(accounts[nextIdx].id);
                          }
                        : undefined
                    }
                  >
                    <Building2 size={18} className="text-blue-400 shrink-0" />
                    {currentAccObj && (
                      <span
                        className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${
                          isStale ? 'bg-amber-400' : 'bg-emerald-400'
                        }`}
                      />
                    )}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Navigation links */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        <div>
          {!collapsed && role === 'admin' && (
            <div className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {labels.appsSection}
            </div>
          )}
          <nav className="space-y-1.5">
            <button
              onClick={() => {
                setMobileOpen(false);
                navigate(analyticsUrl);
              }}
              className={`${
                collapsed
                  ? 'w-10 h-10 mx-auto flex items-center justify-center rounded-xl shrink-0'
                  : 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left'
              } transition-all cursor-pointer ${
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

            {showQcItem && (
              <button
                onClick={() => {
                  setMobileOpen(false);
                  navigate(qcUrl);
                }}
                className={`${
                  collapsed
                    ? 'w-10 h-10 mx-auto flex items-center justify-center rounded-xl shrink-0'
                    : 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left'
                } transition-all cursor-pointer ${
                  isQcActive
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-950/50'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
                title={labels.qcApp}
              >
                <Headphones size={20} className="shrink-0" />
                {!collapsed && (
                  <div className="overflow-hidden flex-1">
                    <span className="text-xs font-semibold truncate">{labels.qcApp}</span>
                  </div>
                )}
              </button>
            )}

            <button
              onClick={() => {
                setMobileOpen(false);
                navigate(predictionsUrl);
              }}
              className={`${
                collapsed
                  ? 'w-10 h-10 mx-auto flex items-center justify-center rounded-xl shrink-0'
                  : 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left'
              } transition-all cursor-pointer ${
                isPredictionsActive
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-950/50'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
              title={labels.app03}
            >
              <Cpu size={20} className="shrink-0" />
              {!collapsed && (
                <div className="overflow-hidden flex-1">
                  <span className="text-xs font-semibold truncate">{labels.app03}</span>
                </div>
              )}
            </button>

            <button
              onClick={() => {
                setMobileOpen(false);
                navigate(crmNodesUrl);
              }}
              className={`${
                collapsed
                  ? 'w-10 h-10 mx-auto flex items-center justify-center rounded-xl shrink-0'
                  : 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left'
              } transition-all cursor-pointer ${
                isCrmNodesActive
                  ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-950/50'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
              title={labels.crmNodes}
            >
              <Network size={20} className="shrink-0" />
              {!collapsed && (
                <div className="overflow-hidden flex-1">
                  <span className="text-xs font-semibold truncate">{labels.crmNodes}</span>
                </div>
              )}
            </button>

            {showAnomalyItem && (
              <button
                onClick={() => {
                  setMobileOpen(false);
                  navigate(anomalyDealsUrl);
                }}
                className={`${
                  collapsed
                    ? 'w-10 h-10 mx-auto flex items-center justify-center rounded-xl shrink-0'
                    : 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left'
                } transition-all cursor-pointer ${
                  isAnomalyDealsActive
                    ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white shadow-md shadow-amber-950/50'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
                title={labels.anomalyDeals}
              >
                <AlertTriangle size={20} className="shrink-0" />
                {!collapsed && (
                  <div className="overflow-hidden flex-1">
                    <span className="text-xs font-semibold truncate">{labels.anomalyDeals}</span>
                  </div>
                )}
              </button>
            )}
          </nav>
        </div>

        {role === 'admin' && (
          <div>
            {!collapsed && (
              <div className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {labels.adminSection}
              </div>
            )}
            <nav className="space-y-1">
              <button
                onClick={() => {
                  setMobileOpen(false);
                  navigate('/admin/clients');
                }}
                className={`${
                  collapsed
                    ? 'w-10 h-10 mx-auto flex items-center justify-center rounded-xl shrink-0'
                    : 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left'
                } transition-all cursor-pointer ${
                  isClientsActive
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
                title={labels.clients}
              >
                <Users size={19} className="shrink-0" />
                {!collapsed && <span className="text-xs truncate">{labels.clients}</span>}
              </button>

              <button
                onClick={() => {
                  setMobileOpen(false);
                  navigate('/admin/notifications');
                }}
                className={`${
                  collapsed
                    ? 'w-10 h-10 mx-auto flex items-center justify-center rounded-xl relative shrink-0'
                    : 'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left'
                } transition-all cursor-pointer ${
                  isNotifsActive
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
                title={labels.notifs}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <Bell size={19} className="shrink-0" />
                  {!collapsed && <span className="text-xs truncate">{labels.notifs}</span>}
                </div>
                {notifsQuery.data && notifsQuery.data.length > 0 && (
                  collapsed ? (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-slate-900" />
                  ) : (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {notifsQuery.data.length}
                    </span>
                  )
                )}
              </button>
            </nav>
          </div>
        )}
      </div>

      {/* Footer controls */}
      <div className="p-3 border-t border-slate-800/80">
        {!collapsed ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-red-400 hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              title={labels.logout}
            >
              <LogOut size={15} className="shrink-0" />
              <span>{labels.logout}</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setLang(lang === 'ru' ? 'uz' : 'ru')}
              className="w-10 h-10 mx-auto rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              {lang.toUpperCase()}
            </button>
            <ThemeToggle className="w-10 h-10 rounded-xl shrink-0" />
            <button
              onClick={logout}
              className="w-10 h-10 mx-auto rounded-xl flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <LogOut size={18} className="shrink-0" />
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
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className={`fixed top-0 left-0 bottom-0 z-30 transition-all duration-200 ${collapsed ? 'w-16' : 'w-64'}`}>
          {sidebarContent}
        </div>
      </aside>

      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-slate-900 text-white z-40 px-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 cursor-pointer"
          >
            <Menu size={22} />
          </button>
          <span className="font-bold text-sm truncate max-w-[200px]">
            {role === 'admin' ? (lang === 'uz' ? 'Analitika' : 'Аналитика') : amoAccountName}
          </span>
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
            <button
              onClick={() => setMobileOpen(false)}
              className="m-4 p-2 rounded-full bg-slate-900 text-white cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 pt-14 lg:pt-0">{children}</div>
    </div>
  );
}
