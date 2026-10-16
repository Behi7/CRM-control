import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Flame,
  ShieldAlert,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle2,
  Clock,
  Layers,
  ArrowUpDown
} from 'lucide-react';
import { anomalyDealsApi, AnomalyDealItem } from '../api/anomalyDeals.api';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useFilterContext } from '../../../shared/context/FilterContext';
import FilterBar from '../../../shared/components/FilterBar';
import AnomalyKpiCards from '../components/AnomalyKpiCards';
import AnomalyReasonsComparison from '../components/AnomalyReasonsComparison';
import DealForensicModal from '../components/DealForensicModal';

export default function AnomalyDealsPage() {
  const { lang } = useLanguage();
  const params = useParams<{ accountId?: string }>();
  const queryClient = useQueryClient();

  const {
    effectiveAccountId,
    applied,
  } = useFilterContext();

  const storedAccountId = Number(localStorage.getItem('active_account_id')) || 1;
  const accountId = params.accountId ? parseInt(params.accountId, 10) : (effectiveAccountId || storedAccountId);

  // Локальные фильтры
  const [levelFilter, setLevelFilter] = useState<'all' | 'critical' | 'warning' | 'fair'>('all');
  const [page, setPage] = useState(1);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);

  // Запрос сводных KPI
  const statsQuery = useQuery({
    queryKey: ['anomaly-stats', accountId],
    queryFn: () => anomalyDealsApi.getStats(accountId),
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
      applied.managerIds,
    ],
    queryFn: () =>
      anomalyDealsApi.getList(accountId, {
        page,
        pageSize: 15,
        level: levelFilter !== 'all' ? levelFilter : undefined,
        pipelineId: applied.pipelineId || undefined,
        managerId: applied.managerIds.length === 1 ? applied.managerIds[0] : undefined,
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

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('ru-RU').format(Math.round(val));
  };

  const getScoreBadge = (score: number, level: string) => {
    if (level === 'critical') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
          <Flame size={12} />
          <span>{score}% Критический слив</span>
        </span>
      );
    }
    if (level === 'warning') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <AlertTriangle size={12} />
          <span>{score}% Нарушения</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 size={12} />
        <span>{score}% Обоснованный отказ</span>
      </span>
    );
  };

  return (
    <div className="p-4 lg:p-6 mx-auto max-w-[1920px] space-y-6">
      {/* Заголовок страницы */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={28} />
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
                {lang === 'uz'
                  ? 'Anomal Bitimlar va Radlar Auditi'
                  : 'Аномальные сделки и Аудит сливов'}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                {lang === 'uz'
                  ? 'Nerealizovano bitimlaridagi xodimlar xatolari, qotib qolgan bosqichlar va qo‘ng‘iroqlar nazorati'
                  : 'Анализ закрытых в отказ сделок: выявление реальных причин сливов, простоев и нарушений регламентов'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Панель фильтров */}
      <FilterBar showStatus={false} />

      {/* Сводные KPI карточки */}
      <AnomalyKpiCards
        stats={statsQuery.data}
        isAnalyzing={analyzeMutation.isPending}
        onTriggerAnalyze={() => analyzeMutation.mutate()}
      />

      {/* Сопоставление: Отмазки vs Реальность */}
      <AnomalyReasonsComparison stats={statsQuery.data} />

      {/* Блок таблицы сливов */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {/* Шапка таблицы с фильтрами по уровню аномальности */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-slate-500" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {lang === 'uz' ? 'Tekshirilgan bitimlar ro‘yxati' : 'Реестр расследований сливов'}
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
              {listQuery.data?.total || 0}
            </span>
          </div>

          {/* Быстрые фильтры по степени критичности */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
            <button
              onClick={() => { setLevelFilter('all'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                levelFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {lang === 'uz' ? 'Barchasi' : 'Все'}
            </button>

            <button
              onClick={() => { setLevelFilter('critical'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                levelFilter === 'critical'
                  ? 'bg-rose-500 text-white shadow-xs'
                  : 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
              }`}
            >
              <Flame size={12} />
              <span>{lang === 'uz' ? 'Kritik (80%+)' : 'Критические (80%+)'}</span>
            </button>

            <button
              onClick={() => { setLevelFilter('warning'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                levelFilter === 'warning'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
              }`}
            >
              <AlertTriangle size={12} />
              <span>{lang === 'uz' ? 'Xatarlar (50-79%)' : 'Нарушения (50-79%)'}</span>
            </button>

            <button
              onClick={() => { setLevelFilter('fair'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                levelFilter === 'fair'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
              }`}
            >
              <CheckCircle2 size={12} />
              <span>{lang === 'uz' ? 'Oqlangan (<50%)' : 'Обоснованные (<50%)'}</span>
            </button>
          </div>
        </div>

        {/* Таблица */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/30 dark:bg-slate-800/20">
                <th className="py-3.5 px-4">{lang === 'uz' ? 'Bitim va Byudjet' : 'Сделка и Бюджет'}</th>
                <th className="py-3.5 px-4">{lang === 'uz' ? 'Mas’ul xodim' : 'Менеджер'}</th>
                <th className="py-3.5 px-4">{lang === 'uz' ? 'Xodim vaji (Sabab)' : 'Заявленная отмазка'}</th>
                <th className="py-3.5 px-4">{lang === 'uz' ? 'Anomaliya darajasi' : 'Индекс аномалии'}</th>
                <th className="py-3.5 px-4">{lang === 'uz' ? 'Asosiy xato (Fakt)' : 'Главный фактор срыва'}</th>
                <th className="py-3.5 px-4 text-right">{lang === 'uz' ? 'Amal' : 'Действие'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {listQuery.isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="w-8 h-8 border-3 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <span>{lang === 'uz' ? 'Bitimlar yuklanmoqda...' : 'Загрузка списка сделок...'}</span>
                  </td>
                </tr>
              ) : listQuery.data?.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <ShieldAlert size={32} className="mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                    <div className="font-semibold text-slate-700 dark:text-slate-300 text-sm">
                      {lang === 'uz' ? 'Bitimlar topilmadi' : 'Аномальных сделок не обнаружено'}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      {lang === 'uz'
                        ? 'Belgilangan filtrlar bo‘yicha bitimlar yo‘q yoki yuqoridagi "Auditingni boshlash" tugmasini bosing'
                        : 'По выбранным фильтрам сделок нет. Нажмите «Запустить аудит (AI)», чтобы проверить нереализованные сделки.'}
                    </div>
                  </td>
                </tr>
              ) : (
                listQuery.data?.items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Сделка и Бюджет */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 dark:text-white hover:text-violet-600 cursor-pointer" onClick={() => setSelectedLeadId(item.leadId)}>
                        {item.leadName}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {formatCurrency(item.price)}
                        </span>
                        <span>•</span>
                        <span>{item.pipelineName || 'Основная воронка'}</span>
                      </div>
                    </td>

                    {/* Менеджер */}
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium">
                      {item.responsibleUserName || '—'}
                    </td>

                    {/* Заявленная отмазка менеджера */}
                    <td className="py-3 px-4">
                      <span className="italic text-slate-600 dark:text-slate-400">
                        «{item.statedLossReason || 'Не указана'}»
                      </span>
                    </td>

                    {/* Индекс аномалии */}
                    <td className="py-3 px-4">
                      {getScoreBadge(item.anomalyScore, item.anomalyLevel)}
                    </td>

                    {/* Главный фактор срыва */}
                    <td className="py-3 px-4 max-w-xs">
                      <div className="text-slate-800 dark:text-slate-200 font-medium truncate" title={item.keyFactor}>
                        {item.keyFactor}
                      </div>
                    </td>

                    {/* Кнопка Досье */}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedLeadId(item.leadId)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-violet-500 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:text-violet-600 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
                      >
                        <Eye size={14} />
                        <span>{lang === 'uz' ? 'Tergov' : 'Досье'}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Пагинация */}
        {listQuery.data && listQuery.data.totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <div>
              {lang === 'uz' ? 'Sahifa:' : 'Страница:'} <b>{page}</b> / {listQuery.data.totalPages} (Всего: {listQuery.data.total})
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(listQuery.data.totalPages, p + 1))}
                disabled={page >= listQuery.data.totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

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
