import React from 'react';
import { Flame, ShieldCheck, AlertTriangle, TrendingDown, User, CheckCircle2 } from 'lucide-react';
import { AnomalyManagerStat } from '../api/anomalyDeals.api';
import { useLanguage } from '../../../i18n/LanguageContext';

interface AnomalyManagerCardsProps {
  managers?: AnomalyManagerStat[];
  selectedManagerId?: number | null;
  onSelectManager: (id: number | null) => void;
  isLoading?: boolean;
}

function formatCurrency(val: number): string {
  if (!val || val <= 0) return '0';
  return new Intl.NumberFormat('ru-RU').format(Math.round(val));
}

export default function AnomalyManagerCards({
  managers = [],
  selectedManagerId,
  onSelectManager,
  isLoading = false,
}: AnomalyManagerCardsProps) {
  const { lang } = useLanguage();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-44 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (managers.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 text-xs mb-6">
        {lang === 'uz'
          ? 'Menejerlar bo‘yicha statistika topilmadi'
          : 'По выбранным фильтрам нет статистики по менеджерам'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Подсказка о фильтрации при активном менеджере */}
      {selectedManagerId && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 text-xs text-violet-900 dark:text-violet-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-violet-600 dark:text-violet-400" />
            <span>
              {lang === 'uz'
                ? 'Tanlangan xodim bo‘yicha filtr faol. Barcha xodimlarni ko‘rish uchun bosing:'
                : 'Включен фильтр по выбранному менеджеру. Для сброса нажмите:'}
            </span>
            <b>
              {managers.find((m) => m.managerId === selectedManagerId)?.managerName || '—'}
            </b>
          </div>
          <button
            onClick={() => onSelectManager(null)}
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 font-semibold border border-violet-300 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900 cursor-pointer transition-all"
          >
            {lang === 'uz' ? 'Filtrni tozalash' : 'Сбросить фильтр'}
          </button>
        </div>
      )}

      {/* Grid of Manager Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {managers.map((m) => {
          const isSelected = selectedManagerId === m.managerId;
          const score = m.avgScore;
          const isCritical = m.criticalCount > 0 || score >= 60;
          const isWarning = !isCritical && (m.warningCount > 0 || score >= 30);

          const badgeColor = isCritical
            ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/60'
            : isWarning
            ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/60'
            : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/60';

          return (
            <div
              key={m.managerId ?? m.managerName}
              onClick={() => onSelectManager(isSelected ? null : (m.managerId ?? null))}
              className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white dark:bg-slate-900 flex flex-col justify-between gap-3 shadow-xs hover:shadow-md ${
                isSelected
                  ? 'border-violet-500 ring-2 ring-violet-500/30 bg-violet-50/20 dark:bg-violet-950/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {/* Header: Name, Avatar & Risk Score */}
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                    {m.managerName
                      ? m.managerName
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()
                      : <User size={16} />}
                  </div>
                  <div className="min-w-0">
                    <h3
                      className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate"
                      title={m.managerName}
                    >
                      {m.managerName}
                    </h3>
                    <span className="text-[10px] text-slate-400 block">
                      {lang === 'uz' ? 'Radlar auditi' : 'Аудит сливов'}
                    </span>
                  </div>
                </div>

                <div
                  className={`px-2.5 py-1 rounded-xl font-bold text-xs border shrink-0 flex items-baseline gap-1 ${badgeColor}`}
                >
                  <span>{score > 0 ? `${score}%` : '—'}</span>
                  <span className="text-[10px] opacity-70">
                    {isCritical ? (lang === 'uz' ? 'xatar' : 'риск') : (lang === 'uz' ? 'norma' : 'норма')}
                  </span>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px]">
                {/* 1. Слитый бюджет */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 p-2 rounded-xl">
                  <span className="text-slate-400 block text-[10px] flex items-center gap-1">
                    <TrendingDown size={11} className="text-rose-500" />
                    {lang === 'uz' ? 'Yo‘qotish' : 'Слитый бюджет'}
                  </span>
                  <div className="font-bold text-rose-600 dark:text-rose-400 text-xs mt-0.5 truncate" title={`${formatCurrency(m.lostBudget)}`}>
                    {formatCurrency(m.lostBudget)}
                  </div>
                </div>

                {/* 2. Критические срывы */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 p-2 rounded-xl">
                  <span className="text-slate-400 block text-[10px] flex items-center gap-1">
                    <Flame size={11} className="text-rose-500" />
                    {lang === 'uz' ? 'Silliqlar' : 'Срывы'}
                  </span>
                  <div className="font-bold text-slate-800 dark:text-slate-200 text-xs mt-0.5">
                    {m.criticalCount}{' '}
                    <span className="text-[10px] font-normal text-slate-400">
                      / {m.auditedCount}
                    </span>
                  </div>
                </div>

                {/* 3. Обоснованные отказы (Effort Shield) */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 p-2 rounded-xl">
                  <span className="text-slate-400 block text-[10px] flex items-center gap-1">
                    <ShieldCheck size={11} className="text-emerald-500" />
                    {lang === 'uz' ? 'Oqlangan' : 'Обосновано'}
                  </span>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 text-xs mt-0.5">
                    {m.fairCount}{' '}
                    <span className="text-[10px] font-normal text-emerald-500/80">
                      ({m.compliancePercent}%)
                    </span>
                  </div>
                </div>

                {/* 4. Главный фактор / частая ошибка */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 p-2 rounded-xl">
                  <span className="text-slate-400 block text-[10px] flex items-center gap-1">
                    <AlertTriangle size={11} className="text-amber-500" />
                    {lang === 'uz' ? 'Asosiy sabab' : 'Частый срыв'}
                  </span>
                  <div
                    className="font-semibold text-slate-700 dark:text-slate-300 text-xs mt-0.5 truncate"
                    title={m.topFactor || '—'}
                  >
                    {m.topFactor || '—'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

