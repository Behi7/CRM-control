import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Headphones,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { qcApi } from '../api/qcApi';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useFilterContext } from '../../../shared/context/FilterContext';
import FilterBar from '../../../shared/components/FilterBar';
import QcManagerCards from '../components/QcManagerCards';
import CallCard from '../components/CallCard';
import CallDetailModal from '../components/CallDetailModal';

export default function QualityControlPage() {
  const { lang } = useLanguage();
  const params = useParams<{ accountId?: string }>();

  const {
    effectiveAccountId,
    applied,
    applyFilters,
  } = useFilterContext();

  const storedAccountId = Number(localStorage.getItem('active_account_id')) || 1;
  const accountId = params.accountId ? parseInt(params.accountId, 10) : (effectiveAccountId || storedAccountId);

  // Draft vs Applied filters for Call feed specifics
  const [draftScoreFilter, setDraftScoreFilter] = useState('all');
  const [appliedScoreFilter, setAppliedScoreFilter] = useState('all');

  const [draftStatusFilter, setDraftStatusFilter] = useState('completed');
  const [appliedStatusFilter, setAppliedStatusFilter] = useState('completed');

  const [draftSearch, setDraftSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const [page, setPage] = useState(1);
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);
  const [selectedManagerId, setSelectedManagerId] = useState<number | null>(null);

  const isExtraDirty =
    draftScoreFilter !== appliedScoreFilter ||
    draftStatusFilter !== appliedStatusFilter ||
    draftSearch !== appliedSearch;

  const handleApplyExtra = () => {
    setAppliedScoreFilter(draftScoreFilter);
    setAppliedStatusFilter(draftStatusFilter);
    setAppliedSearch(draftSearch);
    setPage(1);
  };

  const handleResetExtra = () => {
    setDraftScoreFilter('all');
    setAppliedScoreFilter('all');
    setDraftStatusFilter('completed');
    setAppliedStatusFilter('completed');
    setDraftSearch('');
    setAppliedSearch('');
    setSelectedManagerId(null);
    setPage(1);
  };

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

  // Effective manager filter for calls: selectedManagerId takes precedence, then applied.managerIds
  const effectiveManagerIds = selectedManagerId
    ? [selectedManagerId]
    : applied.managerIds.length > 0
    ? applied.managerIds
    : undefined;

  // Calls feed query connected to applied filters + applied score/status/search + selected manager
  const callsQuery = useQuery({
    queryKey: [
      'qc-calls',
      accountId,
      page,
      appliedScoreFilter,
      appliedStatusFilter,
      appliedSearch,
      selectedManagerId,
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
        scoreFilter: appliedScoreFilter,
        status: appliedStatusFilter !== 'all' ? appliedStatusFilter : undefined,
        search: appliedSearch.trim() || undefined,
        pipelineId: applied.pipelineId || undefined,
        managers: effectiveManagerIds,
        tags: applied.tagIds.length > 0 ? applied.tagIds : undefined,
        dealStatus: applied.status !== 'all' ? applied.status : undefined,
        dateFrom: applied.dateFrom || undefined,
        dateTo: applied.dateTo || undefined,
      }),
    refetchInterval: 30_000,
  });

  const totalPages = Math.ceil((callsQuery.data?.total || 0) / 15) || 1;

  return (
    <div className="p-4 lg:p-6 mx-auto max-w-[1920px] space-y-6">
      {/* 1. Unified FilterBar with integrated Call Filters (Score, Status, Search) */}
      <FilterBar
        showStatus={true}
        isExtraDirty={isExtraDirty}
        onApplyExtra={handleApplyExtra}
        onResetExtra={handleResetExtra}
      >
        {/* Score filter dropdown */}
        <select
          value={draftScoreFilter}
          onChange={(e) => setDraftScoreFilter(e.target.value)}
          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
        >
          <option value="all">{lang === 'uz' ? 'Barcha baholar' : 'Все оценки'}</option>
          <option value="low">{lang === 'uz' ? 'Xatolar (< 50)' : 'С ошибками (< 50)'}</option>
          <option value="med">{lang === 'uz' ? 'O‘rtacha (50-75)' : 'Средние (50-75)'}</option>
          <option value="high">{lang === 'uz' ? 'A’lo (> 75)' : 'Отличные (> 75)'}</option>
        </select>

        {/* Call status dropdown */}
        <select
          value={draftStatusFilter}
          onChange={(e) => setDraftStatusFilter(e.target.value)}
          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
        >
          <option value="completed">{lang === 'uz' ? 'Faqat tahlil qilingan' : 'Только проанализированные'}</option>
          <option value="pending">{lang === 'uz' ? 'Navbatda' : 'В очереди анализа'}</option>
          <option value="all">{lang === 'uz' ? 'Barcha holatlar' : 'Все статусы звонков'}</option>
          <option value="skipped_duration">{lang === 'uz' ? 'O‘tkazib yuborilgan (vaqt)' : 'Пропущенные по времени'}</option>
          <option value="skipped_not_answered">{lang === 'uz' ? 'Javob berilmagan' : 'Не состоявшиеся'}</option>
        </select>

        {/* Search input by phone or lead */}
        <div className="relative min-w-[200px] max-w-xs">
          <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={draftSearch}
            onChange={(e) => setDraftSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                applyFilters();
                handleApplyExtra();
              }
            }}
            placeholder={lang === 'uz' ? 'Telefon yoki bitim (Enter)...' : 'Телефон или сделка (Enter)...'}
            className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
          />
          {draftSearch && (
            <button
              onClick={() => {
                setDraftSearch('');
                setAppliedSearch('');
                setPage(1);
              }}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </FilterBar>

      {/* 2. Manager-by-Manager Cards (Calls count, minutes, avg score, mistakes) */}
      <QcManagerCards
        managers={statsQuery.data?.managersStats}
        selectedManagerId={selectedManagerId}
        onSelectManager={(id) => {
          setSelectedManagerId(id);
          setPage(1);
        }}
        isLoading={statsQuery.isLoading}
      />

      {/* 3. Calls Feed */}
      <div className="space-y-4">
        {callsQuery.isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 size={28} className="animate-spin text-blue-600" />
            <span className="text-xs">{lang === 'uz' ? 'Qo‘ng‘iroqlar yuklanmoqda...' : 'Загрузка списка звонков...'}</span>
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
              {lang === 'uz' ? 'Qo‘ng‘iroqlar topilmadi' : 'Звонков пока нет'}
            </h3>
            <p className="text-xs max-w-md mx-auto">
              {lang === 'uz'
                ? 'Tanlangan filtrlar bo‘yicha qo‘ng‘iroqlar topilmadi yoki hali yuklanmagan.'
                : 'По выбранным фильтрам звонков не найдено, либо воркер еще не подтянул новые звонки.'}
            </p>
          </div>
        )}
      </div>

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
