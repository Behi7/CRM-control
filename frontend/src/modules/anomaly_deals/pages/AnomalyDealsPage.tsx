import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  ShieldAlert,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { anomalyDealsApi } from '../api/anomalyDeals.api';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useAuth } from '../../../auth/AuthContext';
import { adminApi, py2Api } from '../../../api/client';
import { useFilterContext } from '../../../shared/context/FilterContext';
import FilterBar from '../../../shared/components/FilterBar';
import AnomalyKpiCards from '../components/AnomalyKpiCards';
import AnomalyReasonsComparison from '../components/AnomalyReasonsComparison';
import AnomalyManagerCards from '../components/AnomalyManagerCards';
import AnomalyDealsTable from '../components/AnomalyDealsTable';
import DealForensicModal from '../components/DealForensicModal';

type AnomalyTab = 'overview' | 'deals' | 'reasons';

export default function AnomalyDealsPage() {
  const { lang } = useLanguage();
  const params = useParams<{ accountId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    effectiveAccountId,
    applied,
  } = useFilterContext();

  const storedAccountId = Number(localStorage.getItem('active_account_id')) || 1;
  const accountId = params.accountId ? parseInt(params.accountId, 10) : (effectiveAccountId || storedAccountId);

  const navigate = useNavigate();
  const { role } = useAuth();
  const accountsQuery = useQuery({
    queryKey: ['sidebar-accounts', role],
    queryFn: () => (role === 'admin' ? adminApi.listAccounts() : py2Api.accounts()),
    enabled: !!role,
    staleTime: 60_000,
  });
  const currentAcc = accountsQuery.data?.find((a: any) => a.id === accountId);
  const isAnomalyDisabled = role === 'viewer' && currentAcc && (currentAcc.anomalyEnabled === false || currentAcc.aiEnabled === false);

  // Табы (классы функционала)
  const paramTab = searchParams.get('tab');
  const normalizedParamTab: AnomalyTab = paramTab === 'managers' ? 'deals' : (paramTab as AnomalyTab);
  const [activeTab, setActiveTab] = useState<AnomalyTab>(() =>
    normalizedParamTab && ['overview', 'deals', 'reasons'].includes(normalizedParamTab) ? normalizedParamTab : 'overview'
  );

  useEffect(() => {
    if (paramTab) {
      const norm = paramTab === 'managers' ? 'deals' : (paramTab as AnomalyTab);
      if (norm !== activeTab && ['overview', 'deals', 'reasons'].includes(norm)) {
        setActiveTab(norm);
      }
    }
  }, [paramTab]);

  const handleTabChange = (tabId: AnomalyTab) => {
    setActiveTab(tabId);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  // Локальные фильтры
  const [levelFilter, setLevelFilter] = useState<'all' | 'critical' | 'warning' | 'fair'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'score' | 'price'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [selectedManagerId, setSelectedManagerId] = useState<number | null>(null);

  // Дебаунс поискового запроса
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Сброс страницы при смене глобальных фильтров
  useEffect(() => {
    setPage(1);
  }, [applied.pipelineId, applied.managerIds, applied.tagIds, applied.dateFrom, applied.dateTo]);

  // Если выбранный на карточке менеджер был исключен из верхнего фильтра — сбрасываем локальный выбор
  useEffect(() => {
    if (selectedManagerId !== null && applied.managerIds.length > 0 && !applied.managerIds.includes(selectedManagerId)) {
      setSelectedManagerId(null);
    }
  }, [applied.managerIds]);

  // Эффективный список менеджеров для таблицы сделок:
  // Если кликнули по карточке конкретного менеджера внизу — фильтруем по нему.
  // Иначе берем выборку менеджеров из верхнего FilterBar.
  const effectiveManagerIds = selectedManagerId !== null
    ? [selectedManagerId]
    : (applied.managerIds.length > 0 ? applied.managerIds : undefined);

  // Запрос сводных KPI и статистики
  const statsQuery = useQuery({
    queryKey: [
      'anomaly-stats',
      accountId,
      applied.pipelineId,
      applied.managerIds,
      applied.tagIds,
      applied.dateFrom,
      applied.dateTo,
    ],
    queryFn: () =>
      anomalyDealsApi.getStats(accountId, {
        pipelineId: applied.pipelineId || undefined,
        managers: applied.managerIds.length > 0 ? applied.managerIds : undefined,
        tags: applied.tagIds.length > 0 ? applied.tagIds : undefined,
        dateFrom: applied.dateFrom || undefined,
        dateTo: applied.dateTo || undefined,
      }),
    enabled: !isAnomalyDisabled,
    refetchInterval: 30_000,
  });

  // Запрос списка сделок с поиском и сортировкой
  const listQuery = useQuery({
    queryKey: [
      'anomaly-deals-list',
      accountId,
      page,
      levelFilter,
      applied.pipelineId,
      effectiveManagerIds,
      applied.tagIds,
      applied.dateFrom,
      applied.dateTo,
      debouncedSearch,
      sortBy,
    ],
    queryFn: () =>
      anomalyDealsApi.getList(accountId, {
        page,
        pageSize: 15,
        level: levelFilter !== 'all' ? levelFilter : undefined,
        pipelineId: applied.pipelineId || undefined,
        managers: effectiveManagerIds,
        tags: applied.tagIds.length > 0 ? applied.tagIds : undefined,
        dateFrom: applied.dateFrom || undefined,
        dateTo: applied.dateTo || undefined,
        search: debouncedSearch || undefined,
        sortBy,
      }),
    enabled: !isAnomalyDisabled,
    refetchInterval: 30_000,
  });

  const selectedManagerName = statsQuery.data?.managersStats?.find(
    (m) => m.managerId === selectedManagerId
  )?.managerName;

  const tabLabels: Record<AnomalyTab, { label: string; icon: any }> = {
    overview: {
      label: lang === 'uz' ? 'Umumiy va KPI' : 'Обзор и KPI',
      icon: LayoutDashboard,
    },
    deals: {
      label: lang === 'uz' ? 'Bitimlar va menejerlar' : 'Реестр и менеджеры',
      icon: ShieldAlert,
    },
    reasons: {
      label: lang === 'uz' ? 'Rad sabablari (AI)' : 'Отмазки vs Реальность',
      icon: FileText,
    },
  };

  if (isAnomalyDisabled) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center mb-4">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            {lang === 'uz' ? 'Anomal bitimlar moduli o‘chirilgan' : 'Модуль Аномальные сделки отключен'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            {lang === 'uz'
              ? 'Ushbu modul administrator tomonidan vaqtincha to‘xtatilgan.'
              : 'Этот модуль временно отключен администратором для данного аккаунта.'}
          </p>
          <button
            onClick={() => navigate('/bi')}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
          >
            {lang === 'uz' ? 'Tahlil bo‘limiga qaytish' : 'Перейти в Аналитику продаж'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 mx-auto max-w-[1920px] space-y-6">
      {/* Панель фильтров */}
      <FilterBar showStatus={false} />

      {/* Навигационные классы */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {(Object.keys(tabLabels) as AnomalyTab[]).map((tabId) => {
          const { label, icon: Icon } = tabLabels[tabId];
          const active = activeTab === tabId;
          return (
            <button
              key={tabId}
              onClick={() => handleTabChange(tabId)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                active
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon size={15} />
              <span>{label}</span>
              {tabId === 'deals' && (listQuery.data?.total ?? 0) > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {listQuery.data?.total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 1. Класс: Обзор и KPI */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <AnomalyKpiCards stats={statsQuery.data} />
          <AnomalyReasonsComparison stats={statsQuery.data} />
        </div>
      )}

      {/* 2. Класс: Объединенный реестр сделок и менеджеры */}
      {activeTab === 'deals' && (
        <div className="space-y-6">
          {/* Сводные карточки менеджеров по срывам сделок (с возможностью фильтрации) */}
          <AnomalyManagerCards
            managers={statsQuery.data?.managersStats}
            selectedManagerId={selectedManagerId}
            onSelectManager={(id) => {
              setSelectedManagerId(id);
              setPage(1);
            }}
            isLoading={statsQuery.isLoading}
          />

          {/* Реестр расследований сливов с поиском */}
          <AnomalyDealsTable
            deals={listQuery.data?.items}
            total={listQuery.data?.total || 0}
            page={page}
            totalPages={listQuery.data?.totalPages || 1}
            isLoading={listQuery.isLoading}
            searchQuery={searchQuery}
            onSearchChange={(q) => {
              setSearchQuery(q);
              setPage(1);
            }}
            levelFilter={levelFilter}
            onLevelFilterChange={(lvl) => {
              setLevelFilter(lvl);
              setPage(1);
            }}
            sortBy={sortBy}
            onSortByChange={(s) => {
              setSortBy(s);
              setPage(1);
            }}
            onPageChange={(p) => setPage(p)}
            onSelectLead={(leadId) => setSelectedLeadId(leadId)}
            selectedManagerName={selectedManagerName}
            onResetManager={() => {
              setSelectedManagerId(null);
              setPage(1);
            }}
          />
        </div>
      )}

      {/* 3. Класс: Отмазки менеджеров vs Реальность */}
      {activeTab === 'reasons' && (
        <div className="space-y-6">
          <AnomalyReasonsComparison stats={statsQuery.data} />
        </div>
      )}

      {/* Модальное окно глубокого расследования */}
      {selectedLeadId !== null && (
        <DealForensicModal
          accountId={accountId}
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
        />
      )}
    </div>
  );
}
