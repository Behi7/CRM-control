import React from 'react';
import { Award, Headphones, AlertTriangle, LifeBuoy } from 'lucide-react';
import { QcStats } from '../api/qcApi';
import { useLanguage } from '../../../i18n/LanguageContext';

interface QcKpiCardsProps {
  stats?: QcStats;
  isLoading: boolean;
  onSelectRescueTab: () => void;
}

export default function QcKpiCards({ stats, isLoading, onSelectRescueTab }: QcKpiCardsProps) {
  const { lang } = useLanguage();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
        ))}
      </div>
    );
  }

  const avgScore = stats?.avgScore ?? 0;
  const scoreColor =
    avgScore >= 75
      ? 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30'
      : avgScore >= 50
      ? 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30'
      : 'text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-950/30';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {/* 1. Средняя оценка */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg border ${scoreColor}`}>
          {avgScore > 0 ? avgScore : '—'}
        </div>
        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">
            {lang === 'uz' ? 'O\'rtacha sifat balli' : 'Средняя оценка звонков'}
          </span>
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {avgScore > 0 ? `${avgScore} / 100` : (lang === 'uz' ? 'Hali yo\'q' : 'Нет данных')}
          </span>
        </div>
      </div>

      {/* 2. Проанализировано звонков */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
        <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
          <Headphones size={22} />
        </div>
        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">
            {lang === 'uz' ? 'AI tahlil qilgan qo\'ng\'iroqlar' : 'Проанализировано ИИ'}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {stats?.analyzedCalls ?? 0}
            </span>
            <span className="text-xs text-slate-400">
              / {stats?.totalCalls ?? 0}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Звонки с ошибками (< 50) */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
        <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <AlertTriangle size={22} />
        </div>
        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">
            {lang === 'uz' ? 'Xatoli qo\'ng\'iroqlar (< 50)' : 'Звонки с ошибками (< 50)'}
          </span>
          <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {stats?.lowScoreCalls ?? 0}
          </span>
        </div>
      </div>

      {/* 4. Сделки в зоне спасения */}
      <button
        type="button"
        onClick={onSelectRescueTab}
        className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-rose-200 dark:border-rose-900/40 hover:border-rose-400 flex items-center gap-3.5 shadow-xs text-left cursor-pointer transition-all hover:bg-rose-50/30 dark:hover:bg-rose-950/20"
      >
        <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
          <LifeBuoy size={22} />
        </div>
        <div>
          <span className="text-xs text-rose-600 dark:text-rose-400 block font-semibold">
            {lang === 'uz' ? 'Qutqarish mumkin bo\'lgan' : 'Еще можно спасти'}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {stats?.rescueDealsCount ?? 0}
            </span>
            <span className="text-[11px] text-slate-400 underline">
              {lang === 'uz' ? 'ko\'rish' : 'посмотреть'}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}

