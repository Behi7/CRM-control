import React from 'react';
import { AlertOctagon, TrendingDown, ShieldCheck } from 'lucide-react';
import { AnomalyStats } from '../api/anomalyDeals.api';
import { useLanguage } from '../../../i18n/LanguageContext';

interface AnomalyKpiCardsProps {
  stats?: AnomalyStats;
}

export default function AnomalyKpiCards({ stats }: AnomalyKpiCardsProps) {
  const { lang } = useLanguage();

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('ru-RU').format(Math.round(val));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Карточка 1: Потери бюджета из-за сливов менеджеров */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
            {lang === 'uz' ? 'Xodim aybi bilan yo‘qotish' : 'Слито по вине менеджеров'}
          </span>
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <AlertOctagon size={20} />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900 dark:text-white">
          {formatCurrency(stats?.criticalLostBudget || 0)}
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
          <span className="font-semibold text-rose-600 dark:text-rose-400">
            {stats?.criticalSlippedLeads || 0} {lang === 'uz' ? 'ta bitim' : 'сделок'}
          </span>
          <span>•</span>
          <span>
            {stats?.criticalPercent || 0}% {lang === 'uz' ? 'barcha radlardan' : 'от всех отказов'}
          </span>
        </div>
      </div>

      {/* Карточка 2: Всего проверено отказов */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            {lang === 'uz' ? 'Tekshirilgan radlar' : 'Проаудировано отказов'}
          </span>
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <TrendingDown size={20} />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900 dark:text-white">
          {stats?.totalAudited || 0}{' '}
          <span className="text-sm font-normal text-slate-500">
            / {stats?.totalLostLeads || 0}
          </span>
        </div>
        <div className="text-xs text-slate-500 mt-2">
          {lang === 'uz'
            ? 'Tizim va AI tomonidan to‘liq tekshirildi'
            : 'Полный цифровой аудит хронологии и звонков'}
        </div>
      </div>

      {/* Карточка 3: Защита честных менеджеров (Effort Shield) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            {lang === 'uz' ? 'Adolatli me’yor (Oqlangan)' : 'Обоснованные отказы'}
          </span>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck size={20} />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900 dark:text-white">
          {stats?.fairCount ?? 0}
        </div>
        <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-2 flex items-center justify-between gap-1">
          <span>{lang === 'uz' ? 'Reglament buzilmagan' : 'Регламент соблюден: вины нет'}</span>
          {(stats?.warningCount || 0) > 0 && (
            <span className="text-amber-600 dark:text-amber-400 font-normal shrink-0">
              {stats?.warningCount} {lang === 'uz' ? 'kamchilik' : 'с нарушениями'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

