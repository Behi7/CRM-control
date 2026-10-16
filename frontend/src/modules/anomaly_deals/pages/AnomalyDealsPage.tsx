import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Award,
  ShieldAlert,
  FileText,
} from 'lucide-react';
import { anomalyDealsApi } from '../api/anomalyDeals.api';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useFilterContext } from '../../../shared/context/FilterContext';
import FilterBar from '../../../shared/components/FilterBar';
import AnomalyKpiCards from '../components/AnomalyKpiCards';
import AnomalyReasonsComparison from '../components/AnomalyReasonsComparison';
import AnomalyManagerCards from '../components/AnomalyManagerCards';
import AnomalyDealsTable from '../components/AnomalyDealsTable';
import DealForensicModal from '../components/DealForensicModal';

type AnomalyTab = 'overview' | 'managers' | 'deals' | 'reasons';

export default function AnomalyDealsPage() {
  const { lang } = useLanguage();
  const params = useParams<{ accountId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const {
    effectiveAccountId,
    applied,
  } = useFilterContext();

  const storedAccountId = Number(localStorage.getItem('active_account_id')) || 1;
  const accountId = params.accountId ? parseInt(params.accountId, 10) : (effectiveAccountId || storedAccountId);

  // Табы (классы функционала)
  const paramTab = searchParams.get('tab') as AnomalyTab | null;
  const [activeTab, setActiveTab] = useState<AnomalyTab>(() => paramTab || 'overview');

  useEffect(() => {
    if (paramTab && paramTab !== activeTab) {
      setActiveTab(paramTab);
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
  const [page, setPage] = useState(1);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [selectedManagerId, setSelectedManagerId] = useState<number | null>(null);

  // Эффективный менеджер для списка сделок
  const effectiveManagerId = selectedManagerId !== null
    ? selectedManagerId
    : (applied.managerIds.length === 1 ? applied.managerIds[0] : undefined);

  // Запрос сводных KPI и статистики
  const statsQuery = useQuery({
    queryKey: ['anomaly-stats', accountId, applied.pipelineId],
    queryFn: () => anomalyDealsApi.getStats(accountId, applied.pipelineId || undefined),
    refetchInterval: 30_000,
  });

  // Запрос списка сделок
  const listQuery = useQuery({
    queryKey: [
      'anomaly-deals-list',
      accountId,
      page,
      levelFilter,
      applied.pipelineId,
      effectiveManagerId,
    ],
    queryFn: () =>
      anomalyDealsApi.getList(accountId, {
        page,
        pageSize: 15,
        level: levelFilter !== 'all' ? levelFilter : undefined,
        pipelineId: applied.pipelineId || undefined,
        managerId: effectiveManagerId,
      }),
    refetchInterval: 30_000,
  });

  // Мутация запуска пакетного аудита
  const analyzeMutation = useMutation({
    mutationFn: () =>
      anomalyDealsApi.batchAnalyze(accountId, {
        pipelineId: applied.pipelineId || undefined,
        limit: 30,
        forceReanalyze: false,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anomaly-stats', accountId] });
      queryClient.invalidateQueries({ queryKey: ['anomaly-deals-list', accountId] });
    },
  });

  const selectedManagerName = statsQuery.data?.managersStats?.find(
    (m) => m.managerId === selectedManagerId
  )?.managerName;

  const tabLabels: Record<AnomalyTab, { label: string; icon: any }> = {
    overview: {
      label: lang === 'uz' ? 'Umumiy va KPI' : 'Обзор и KPI',
      icon: LayoutDashboard,
    },
    managers: {
      label: lang === 'uz' ? 'Menejerlar' : 'Менеджеры',
      icon: Award,
    },
    deals: {
      label: lang === 'uz' ? 'Bitimlar ro‘yxati' : 'Реестр сделок',
      icon: ShieldAlert,
    },
    reasons: {
      label: lang === 'uz' ? 'Rad sabablari (AI)' : 'Отмазки vs Реальность',
      icon: FileText,
    },
  };

  return (
    <div className="p-4 lg:p-6 mx-auto max-w-[1920px] space-y-6">
      {/* Панель фильтров */}
      <FilterBar showStatus={false} />

      {/* Навигационные классы (табы как в аналитике продаж) */}
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
              {tabId === 'managers' && (statsQuery.data?.managersStats?.length ?? 0) > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {statsQuery.data?.managersStats?.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 1. Класс: Обзор и KPI */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <AnomalyKpiCards
            stats={statsQuery.data}
            isAnalyzing={analyzeMutation.isPending}
            onTriggerAnalyze={() => analyzeMutation.mutate()}
          />
          <AnomalyReasonsComparison stats={statsQuery.data} />
        </div>
      )}

      {/* 2. Класс: Менеджеры (карточки как в контроле качества) */}
      {activeTab === 'managers' && (
        <div className="space-y-4">
          <AnomalyManagerCards
            managers={statsQuery.data?.managersStats}
            selectedManagerId={selectedManagerId}
            onSelectManager={(id) => {
              setSelectedManagerId(id);
              setPage(1);
            }}
            isLoading={statsQuery.isLoading}
          />
        </div>
      )}

      {/* 3. Класс: Реестр расследований сливов */}
      {activeTab === 'deals' && (
        <AnomalyDealsTable
          deals={listQuery.data?.items}
          total={listQuery.data?.total || 0}
          page={page}
          totalPages={listQuery.data?.totalPages || 1}
          isLoading={listQuery.isLoading}
          levelFilter={levelFilter}
          onLevelFilterChange={(lvl) => {
            setLevelFilter(lvl);
            setPage(1);
          }}
          onPageChange={(p) => setPage(p)}
          onSelectLead={(leadId) => setSelectedLeadId(leadId)}
          selectedManagerName={selectedManagerName}
          onResetManager={() => setSelectedManagerId(null)}
          onTriggerAnalyze={() => analyzeMutation.mutate()}
        />
      )}

      {/* 4. Класс: Отмазки менеджеров vs Реальность */}
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
