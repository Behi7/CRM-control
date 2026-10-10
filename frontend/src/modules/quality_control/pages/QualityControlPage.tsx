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
  RefreshCw,
} from 'lucide-react';
import { qcApi } from '../api/qcApi';
import { py2Api } from '../../../api/client';
import { useLanguage } from '../../../i18n/LanguageContext';
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

  const storedAccountId = Number(localStorage.getItem('active_account_id')) || 1;
  const accountId = params.accountId ? parseInt(params.accountId, 10) : storedAccountId;

  const activeTab = (searchParams.get('tab') as 'calls' | 'rescue' | 'rules') || 'calls';
  const handleTabChange = (tab: 'calls' | 'rescue' | 'rules') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };

  // Filter States
  const [scoreFilter, setScoreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);

  // Pipelines query
  const pipelinesQuery = useQuery({
    queryKey: ['pipelines', accountId],
    queryFn: () => py2Api.pipelines(accountId),
    staleTime: 5 * 60 * 1000,
  });
  const pipelines = (pipelinesQuery.data as any)?.items || [];

  // Stats query
  const statsQuery = useQuery({
    queryKey: ['qc-stats', accountId],
    queryFn: () => qcApi.getStats(accountId),
    refetchInterval: 30_000,
  });

  // Calls feed query
  const callsQuery = useQuery({
    queryKey: ['qc-calls', accountId, page, scoreFilter, statusFilter, search],
    queryFn: () =>
      qcApi.listCalls(accountId, {
        page,
        limit: 15,
        scoreFilter,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: search.trim() || undefined,
      }),
    enabled: activeTab === 'calls',
    refetchInterval: 30_000,
  });

  const handleResetFilters = () => {
    setScoreFilter('all');
    setStatusFilter('all');
    setSearch('');
    setPage(1);
  };

  const totalPages = Math.ceil((callsQuery.data?.total || 0) / 15) || 1;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
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

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl self-start sm:self-auto shadow-xs border border-slate-200 dark:border-slate-700/60">
          <button
            type="button"
            onClick={() => handleTabChange('calls')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'calls'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Headphones size={15} />
            <span>{lang === 'uz' ? 'Qo\'ng\'iroqlar' : 'Звонки'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('rescue')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'rescue'
                ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <LifeBuoy size={15} />
            <span>{lang === 'uz' ? 'Qutqarish' : 'Спасение сделок'}</span>
            {(statsQuery.data?.rescueDealsCount ?? 0) > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('rules')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'rules'
                ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <FileCheck size={15} />
            <span>{lang === 'uz' ? 'Tekshirish qoidalari' : 'Законы проверки'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <QcKpiCards
        stats={statsQuery.data}
        isLoading={statsQuery.isLoading}
        onSelectRescueTab={() => handleTabChange('rescue')}
      />

      {/* Tab 1: Calls Feed */}
      {activeTab === 'calls' && (
        <div>
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
            onReset={handleResetFilters}
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
                  ? 'AmoCRM orqali yangi qo\'ng\'iroqlar amalga oshirilganda, ular har 10 daqiqada avtomatik tahlil qilinadi.'
                  : 'Когда менеджеры совершат звонки в AmoCRM, они автоматически подтянутся и проанализируются воркером.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Rescue Deals */}
      {activeTab === 'rescue' && (
        <RescueDealsBoard accountId={accountId} />
      )}

      {/* Tab 3: Rules Settings */}
      {activeTab === 'rules' && (
        <RulesSettingsTab accountId={accountId} pipelines={pipelines} />
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
