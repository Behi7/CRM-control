import React from 'react';
import { Search, X, Filter } from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';

interface CallFiltersProps {
  scoreFilter: string;
  onScoreFilterChange: (val: string) => void;
  statusFilter: string;
  onStatusFilterChange: (val: string) => void;
  search: string;
  onSearchChange: (val: string) => void;
  onReset: () => void;
}

export default function CallFilters({
  scoreFilter,
  onScoreFilterChange,
  statusFilter,
  onStatusFilterChange,
  search,
  onSearchChange,
  onReset,
}: CallFiltersProps) {
  const { lang } = useLanguage();

  const hasActiveFilters = scoreFilter !== 'all' || statusFilter !== 'all' || Boolean(search);

  return (
    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 mb-5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
      {/* 1. Score Filter Pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
          <Filter size={14} />
          {lang === 'uz' ? 'Baho:' : 'Оценка:'}
        </span>
        <button
          type="button"
          onClick={() => onScoreFilterChange('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            scoreFilter === 'all'
              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          {lang === 'uz' ? 'Barchasi' : 'Все'}
        </button>
        <button
          type="button"
          onClick={() => onScoreFilterChange('low')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            scoreFilter === 'low'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 hover:bg-rose-100'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-rose-400" />
          {lang === 'uz' ? 'Xatolar (< 50)' : 'С ошибками (< 50)'}
        </button>
        <button
          type="button"
          onClick={() => onScoreFilterChange('med')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            scoreFilter === 'med'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 hover:bg-amber-100'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          {lang === 'uz' ? 'O\'rtacha (50-75)' : 'Средние (50-75)'}
        </button>
        <button
          type="button"
          onClick={() => onScoreFilterChange('high')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
            scoreFilter === 'high'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          {lang === 'uz' ? 'A\'lo (> 75)' : 'Отличные (> 75)'}
        </button>
      </div>

      {/* 2. Search & Status Filter */}
      <div className="flex items-center gap-2.5 flex-1 min-w-[280px] justify-end">
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none"
        >
          <option value="all">{lang === 'uz' ? 'Barcha holatlar' : 'Все статусы'}</option>
          <option value="completed">{lang === 'uz' ? 'Faqat tahlil qilingan' : 'Только проанализированные'}</option>
          <option value="skipped_duration">{lang === 'uz' ? 'O\'tkazib yuborilgan (vaqt)' : 'Пропущенные по времени'}</option>
        </select>

        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={lang === 'uz' ? 'Telefon yoki bitim...' : 'Телефон или сделка...'}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline cursor-pointer"
          >
            {lang === 'uz' ? 'Tozalash' : 'Сброс'}
          </button>
        )}
      </div>
    </div>
  );
}

