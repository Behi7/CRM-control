import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Headphones,
  LifeBuoy,
  FileCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { qcApi } from '../api/qcApi';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useFilterContext } from '../../../shared/context/FilterContext';
import FilterBar from '../../../shared/components/FilterBar';
import QcKpiCards from '../components/QcKpiCards';
import CallFilters from '../components/CallFilters';
import CallCard from '../components/CallCard';
import CallDetailModal from '../components/CallDetailModal';
import RescueDealsBoard from '../components/RescueDealsBoard';
import RulesSettingsTab from '../components/RulesSettingsTab';

export default function QualityControlPage() {
  const { lang } = useLanguage();
  const params = useParams<{ accountId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    effectiveAccountId,
    applied,
    pipelines,
  } = useFilterContext();

  const storedAccountId = Number(localStorage.getItem('active_account_id')) || 1;
  const accountId = params.accountId ? parseInt(params.accountId, 10) : (effectiveAccountId || storedAccountId);

  const activeTab = (searchParams.get('tab') as 'calls' | 'rescue' | 'rules') || 'calls';
  const handleTabChange = (tab: 'calls' | 'rescue' | 'rules') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };

  // Local filter states for Call feed specifics
  const [scoreFilter, setScoreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);

  // Stats query connected to unified FilterBar filters
  const statsQuery = useQuery({
    queryKey: [
      'qc-stats',
      accountId,
      applied.pipelineId,
      applied.managerIds,
      applied.tagIds,
      applied.status,
      applied.dateFrom,
      applied.dateTo,
    ],
    queryFn: () =>
      qcApi.getStats(accountId, {
        pipelineId: applied.pipelineId || undefined,
        managers: applied.managerIds.length > 0 ? applied.managerIds : undefined,
        tags: applied.tagIds.length > 0 ? applied.tagIds : undefined,
        dealStatus: applied.status !== 'all' ? applied.status : undefined,
        dateFrom: applied.dateFrom || undefined,
        dateTo: applied.dateTo || undefined,
      }),
    refetchInterval: 30_000,
  });

  // Calls feed query connected to unified filters + score/status/search
  const callsQuery = useQuery({
    queryKey: [
      'qc-calls',
      accountId,
      page,
      scoreFilter,
      statusFilter,
      search,
      applied.pipelineId,
      applied.managerIds,
      applied.tagIds,
      applied.status,
      applied.dateFrom,
      applied.dateTo,
    ],
    queryFn: () =>
      qcApi.listCalls(accountId, {
        page,
        limit: 15,
        scoreFilter,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: search.trim() || undefined,
        pipelineId: applied.pipelineId || undefined,
        managers: applied.managerIds.length > 0 ? applied.managerIds : undefined,
        tags: applied.tagIds.length > 0 ? applied.tagIds : undefined,
        dealStatus: applied.status !== 'all' ? applied.status : undefined,
        dateFrom: applied.dateFrom || undefined,
        dateTo: applied.dateTo || undefined,
      }),
    enabled: activeTab === 'calls',
    refetchInterval: 30_000,
  });

  const handleResetCallFilters = () => {
    setScoreFilter('all');
    setStatusFilter('all');
    setSearch('');
    setPage(1);
  };

  const totalPages = Math.ceil((callsQuery.data?.total || 0) / 15) || 1;

  return (
    <div className="p-4 lg:p-6 mx-auto max-w-[1920px] space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Headphones size={24} />
            </span>
            {lang === 'uz' ? 'Qo\'ng\'iroqlar sifatini nazorat qilish' : 'Контроль качества звонков'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {lang === 'uz'
              ? 'AI orqali qo\'ng\'iroqlarni avtomatik tahlil qilish, reglament buzilishlari va boy berilgan bitimlarni qutqarish'
              : 'Автоматический аудит звонков с ИИ, чек-листы по воронкам и реанимация слитых сделок'}
          </p>
        </div>
      </div>

      {/* 1. Unified FilterBar */}
      <FilterBar showStatus={true} />

      {/* 2. Horizontal Navigation Tabs matching Analytics Module */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => handleTabChange('calls')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'calls'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Headphones size={15} />
          <span>{lang === 'uz' ? 'Qo\'ng\'iroqlar' : 'Звонки'}</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('rescue')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'rescue'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <LifeBuoy size={15} />
          <span>{lang === 'uz' ? 'Qutqarish' : 'Спасение сделок'}</span>
          {(statsQuery.data?.rescueDealsCount ?? 0) > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-pulse">
              {statsQuery.data?.rescueDealsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('rules')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'rules'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <FileCheck size={15} />
          <span>{lang === 'uz' ? 'Tekshirish qoidalari' : 'Законы проверки'}</span>
        </button>
      </div>

      {/* 3. KPI Cards */}
      <QcKpiCards
        stats={statsQuery.data}
        isLoading={statsQuery.isLoading}
        onSelectRescueTab={() => handleTabChange('rescue')}
      />

      {/* 4. Tab Content */}
      {/* Tab 1: Calls Feed */}
      {activeTab === 'calls' && (
        <div className="space-y-4">
          <CallFilters
            scoreFilter={scoreFilter}
            onScoreFilterChange={(v) => {
              setScoreFilter(v);
              setPage(1);
            }}
            statusFilter={statusFilter}
            onStatusFilterChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            search={search}
            onSearchChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            onReset={handleResetCallFilters}
          />

          {callsQuery.isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 size={28} className="animate-spin text-blue-600" />
              <span className="text-xs">{lang === 'uz' ? 'Qo\'ng\'iroqlar yuklanmoqda...' : 'Загрузка списка звонков...'}</span>
            </div>
          ) : callsQuery.data?.items && callsQuery.data.items.length > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3">
                {callsQuery.data.items.map((call) => (
                  <CallCard key={call.id} call={call} onOpenDetail={(id) => setSelectedCallId(id)} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                  <span>
                    {lang === 'uz' ? 'Jami:' : 'Всего:'} {callsQuery.data.total}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 space-y-2">
              <Headphones size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base">
                {lang === 'uz' ? 'Qo\'ng\'iroqlar topilmadi' : 'Звонков пока нет'}
              </h3>
              <p className="text-xs max-w-md mx-auto">
                {lang === 'uz'
                  ? 'Tanlangan filtrlar bo\'yicha qo\'ng\'iroqlar topilmadi yoki hali yuklanmagan.'
                  : 'По выбранным фильтрам звонков не найдено, либо воркер еще не подтянул новые звонки.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Rescue Deals */}
      {activeTab === 'rescue' && (
        <RescueDealsBoard
          accountId={accountId}
          pipelineId={applied.pipelineId || undefined}
          managers={applied.managerIds.length > 0 ? applied.managerIds : undefined}
          tags={applied.tagIds.length > 0 ? applied.tagIds : undefined}
          dealStatus={applied.status !== 'all' ? applied.status : undefined}
          dateFrom={applied.dateFrom || undefined}
          dateTo={applied.dateTo || undefined}
        />
      )}

      {/* Tab 3: Rules Settings */}
      {activeTab === 'rules' && (
        <RulesSettingsTab
          accountId={accountId}
          pipelines={pipelines}
          pipelineId={applied.pipelineId || undefined}
        />
      )}

      {/* Call Detail Modal */}
      {selectedCallId && (
        <CallDetailModal
          accountId={accountId}
          callId={selectedCallId}
          onClose={() => setSelectedCallId(null)}
        />
      )}
    </div>
  );
}
