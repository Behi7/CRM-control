import React from 'react';
import {
  ShieldAlert,
  Flame,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  UserX
} from 'lucide-react';
import { AnomalyDealItem } from '../api/anomalyDeals.api';
import { useLanguage } from '../../../i18n/LanguageContext';

interface AnomalyDealsTableProps {
  deals?: AnomalyDealItem[];
  total: number;
  page: number;
  totalPages: number;
  isLoading: boolean;
  levelFilter: 'all' | 'critical' | 'warning' | 'fair';
  onLevelFilterChange: (level: 'all' | 'critical' | 'warning' | 'fair') => void;
  onPageChange: (page: number) => void;
  onSelectLead: (leadId: number) => void;
  selectedManagerName?: string | null;
  onResetManager?: () => void;
  onTriggerAnalyze?: () => void;
}

export default function AnomalyDealsTable({
  deals = [],
  total,
  page,
  totalPages,
  isLoading,
  levelFilter,
  onLevelFilterChange,
  onPageChange,
  onSelectLead,
  selectedManagerName,
  onResetManager,
  onTriggerAnalyze,
}: AnomalyDealsTableProps) {
  const { lang } = useLanguage();

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
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
      {/* Шапка таблицы с фильтрами по уровню аномальности */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
        <div className="flex items-center gap-2">
          <ShieldAlert size={18} className="text-slate-500" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {lang === 'uz' ? 'Tekshirilgan bitimlar ro‘yxati' : 'Реестр расследований сливов'}
          </h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
            {total}
          </span>

          {selectedManagerName && (
            <div className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-300 text-xs font-medium">
              <span>{lang === 'uz' ? 'Xodim:' : 'Менеджер:'} <b>{selectedManagerName}</b></span>
              {onResetManager && (
                <button
                  onClick={onResetManager}
                  className="hover:text-rose-600 ml-1 cursor-pointer"
                  title={lang === 'uz' ? 'Filtrni tozalash' : 'Сбросить фильтр'}
                >
                  <UserX size={13} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Быстрые фильтры по степени критичности */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
          <button
            onClick={() => onLevelFilterChange('all')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              levelFilter === 'all'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {lang === 'uz' ? 'Barchasi' : 'Все'}
          </button>

          <button
            onClick={() => onLevelFilterChange('critical')}
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
            onClick={() => onLevelFilterChange('warning')}
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
            onClick={() => onLevelFilterChange('fair')}
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
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  <div className="w-8 h-8 border-3 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <span>{lang === 'uz' ? 'Bitimlar yuklanmoqda...' : 'Загрузка списка сделок...'}</span>
                </td>
              </tr>
            ) : deals.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  <ShieldAlert size={32} className="mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                  <div className="font-semibold text-slate-700 dark:text-slate-300 text-sm">
                    {lang === 'uz' ? 'Bitimlar topilmadi' : 'Аномальных сделок не обнаружено'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    {lang === 'uz'
                      ? 'Belgilangan filtrlar bo‘yicha bitimlar yo‘q'
                      : 'По выбранным фильтрам сделок нет.'}
                  </div>
                </td>
              </tr>
            ) : (
              deals.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  {/* Сделка и Бюджет */}
                  <td className="py-3 px-4">
                    <div
                      className="font-bold text-slate-900 dark:text-white hover:text-violet-600 cursor-pointer"
                      onClick={() => onSelectLead(item.leadId)}
                    >
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
                      onClick={() => onSelectLead(item.leadId)}
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
      {totalPages > 1 && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div>
            {lang === 'uz' ? 'Sahifa:' : 'Страница:'} <b>{page}</b> / {totalPages} (Всего: {total})
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
