import React from 'react';
import { Headphones, Clock, AlertTriangle, CheckCircle2, User, X } from 'lucide-react';
import { QcManagerStat } from '../api/qcApi';
import { useLanguage } from '../../../i18n/LanguageContext';

interface QcManagerCardsProps {
  managers?: QcManagerStat[];
  selectedManagerId?: number | null;
  onSelectManager: (id: number | null) => void;
  isLoading?: boolean;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0 мин';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} ч ${mins} мин`;
  }
  return `${mins} мин`;
}

function formatAvgCall(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function QcManagerCards({
  managers = [],
  selectedManagerId,
  onSelectManager,
  isLoading = false,
}: QcManagerCardsProps) {
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
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 text-xs mb-6">
        {lang === 'uz'
          ? 'Menejerlar bo‘yicha qo‘ng‘iroqlar statistikasi topilmadi'
          : 'По выбранным фильтрам нет статистики звонков по менеджерам'}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 mb-6">
      {/* Active Manager Filter Banner */}
      {selectedManagerId && (
        <div className="flex items-center justify-between px-4 py-2 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl text-xs text-blue-800 dark:text-blue-300">
          <span className="flex items-center gap-2">
            <span>🔍</span>
            <span>
              {lang === 'uz' ? 'Tanlangan menejer bo‘yicha filtr:' : 'Фильтр по выбранному менеджеру:'}{' '}
              <b>{managers.find((m) => m.managerId === selectedManagerId)?.managerName}</b>
            </span>
          </span>
          <button
            type="button"
            onClick={() => onSelectManager(null)}
            className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 cursor-pointer"
          >
            <X size={14} />
            <span>{lang === 'uz' ? 'Barcha menejerlarni ko‘rsatish' : 'Показать всех менеджеров'}</span>
          </button>
        </div>
      )}

      {/* Grid of Manager Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {managers.map((m) => {
          const isSelected = selectedManagerId === m.managerId;
          const score = m.avgScore;
          const scoreColor =
            score >= 75
              ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/60'
              : score >= 50
              ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/60'
              : score > 0
              ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/60'
              : 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';

          return (
            <div
              key={m.managerId ?? m.managerName}
              onClick={() => onSelectManager(isSelected ? null : (m.managerId ?? null))}
              className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white dark:bg-slate-900 flex flex-col justify-between gap-3 shadow-xs hover:shadow-md ${
                isSelected
                  ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-50/20 dark:bg-blue-950/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {/* Header: Name, Avatar & QC Score */}
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
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
                    <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate" title={m.managerName}>
                      {m.managerName}
                    </h3>
                    <span className="text-[10px] text-slate-400 block">
                      {lang === 'uz' ? 'Qo‘ng‘iroqlar nazorati' : 'Контроль качества'}
                    </span>
                  </div>
                </div>

                <div className={`px-2.5 py-1 rounded-xl font-bold text-xs border shrink-0 flex items-baseline gap-1 ${scoreColor}`}>
                  <span>{score > 0 ? score : '—'}</span>
                  <span className="text-[10px] opacity-70">/ 100</span>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px]">
                {/* 1. Разговоры */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 p-2 rounded-xl">
                  <span className="text-slate-400 block text-[10px] flex items-center gap-1">
                    <Headphones size={11} className="text-blue-500" />
                    {lang === 'uz' ? 'Suhbatlar' : 'Разговоры'}
                  </span>
                  <div className="font-bold text-slate-800 dark:text-slate-200 text-xs mt-0.5">
                    {m.totalCalls}{' '}
                    <span className="text-[10px] font-normal text-slate-400">
                      ({m.analyzedCalls} {lang === 'uz' ? 'AI' : 'ИИ'})
                    </span>
                  </div>
                </div>

                {/* 2. Время на линии */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 p-2 rounded-xl">
                  <span className="text-slate-400 block text-[10px] flex items-center gap-1">
                    <Clock size={11} className="text-purple-500" />
                    {lang === 'uz' ? 'Liniyadagi vaqt' : 'На линии'}
                  </span>
                  <div className="font-bold text-slate-800 dark:text-slate-200 text-xs mt-0.5 truncate" title={formatDuration(m.totalDurationSec)}>
                    {formatDuration(m.totalDurationSec)}
                  </div>
                  <span className="text-[9px] text-slate-400 block">
                    {lang === 'uz' ? 'o‘rtacha' : 'ср.'} {formatAvgCall(m.avgDurationSec)}
                  </span>
                </div>

                {/* 3. Соблюдение регламента */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 p-2 rounded-xl">
                  <span className="text-slate-400 block text-[10px] flex items-center gap-1">
                    <CheckCircle2 size={11} className="text-emerald-500" />
                    {lang === 'uz' ? 'Reglament' : 'Регламент'}
                  </span>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 text-xs mt-0.5">
                    {m.compliancePercent}%
                  </div>
                </div>

                {/* 4. Ошибки (< 50) */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 p-2 rounded-xl">
                  <span className="text-slate-400 block text-[10px] flex items-center gap-1">
                    <AlertTriangle size={11} className="text-rose-500" />
                    {lang === 'uz' ? 'Xatolar (< 50)' : 'С ошибками'}
                  </span>
                  <div className={`font-bold text-xs mt-0.5 ${m.lowScoreCalls > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                    {m.lowScoreCalls} {lang === 'uz' ? 'ta' : 'звонков'}
                  </div>
                </div>
              </div>

              {/* Footer hint */}
              <div className="text-[10px] text-slate-400 text-right flex items-center justify-end gap-1">
                <span className={isSelected ? 'text-blue-600 dark:text-blue-400 font-semibold' : ''}>
                  {isSelected
                    ? (lang === 'uz' ? '✓ Tanlangan (bekor qilish)' : '✓ Выбран (нажмите для сброса)')
                    : (lang === 'uz' ? 'Qo‘ng‘iroqlarni ko‘rish →' : 'Смотреть звонки →')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
