import React from 'react';
import { AlertOctagon, TrendingDown, ShieldCheck, Play, Loader2 } from 'lucide-react';
import { AnomalyStats } from '../api/anomalyDeals.api';
import { useLanguage } from '../../../i18n/LanguageContext';

interface AnomalyKpiCardsProps {
  stats?: AnomalyStats;
  isAnalyzing: boolean;
  onTriggerAnalyze: () => void;
}

export default function AnomalyKpiCards({
  stats,
  isAnalyzing,
  onTriggerAnalyze,
}: AnomalyKpiCardsProps) {
  const { lang } = useLanguage();

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('ru-RU').format(Math.round(val));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
          {Math.max(0, (stats?.totalAudited || 0) - (stats?.criticalSlippedLeads || 0))}
        </div>
        <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-2">
          {lang === 'uz'
            ? 'Reglament va qo‘ng‘iroqlar qoidasi to‘liq bajarilgan'
            : 'Регламент соблюден: вина менеджеров снята'}
        </div>
      </div>

      {/* Карточка 4: Действие - Экспресс аудит */}
      <div className="bg-gradient-to-br from-violet-600 to-indigo-700 rounded-2xl p-5 text-white shadow-md flex flex-col justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-violet-200">
            {lang === 'uz' ? 'AI Tahlilni ishga tushirish' : 'Запуск цифрового аудита'}
          </div>
          <div className="text-sm text-violet-100 mt-1 leading-snug">
            {lang === 'uz'
              ? 'Yangi rad etilgan bitimlarni AI tekshiruvidan o‘tkazish'
              : 'Проверить историю звонков и этапов нереализованных сделок'}
          </div>
        </div>
        <button
          onClick={onTriggerAnalyze}
          disabled={isAnalyzing}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-violet-900 hover:bg-violet-50 font-bold rounded-xl text-xs transition-all shadow-sm disabled:opacity-75 cursor-pointer"
        >
          {isAnalyzing ? (
            <>
              <Loader2 size={16} className="animate-spin text-violet-700" />
              <span>{lang === 'uz' ? 'Tahlil qilinmoqda...' : 'Идет анализ сделок...'}</span>
            </>
          ) : (
            <>
              <Play size={16} className="text-violet-700 fill-violet-700" />
              <span>{lang === 'uz' ? 'Auditingni boshlash' : 'Запустить аудит (AI)'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

