import React from 'react';
import { FileText, Eye, AlertTriangle } from 'lucide-react';
import { AnomalyStats } from '../api/anomalyDeals.api';
import { useLanguage } from '../../../i18n/LanguageContext';

interface AnomalyReasonsComparisonProps {
  stats?: AnomalyStats;
}

export default function AnomalyReasonsComparison({ stats }: AnomalyReasonsComparisonProps) {
  const { lang } = useLanguage();

  const stated = stats?.topStatedReasons || [];
  const real = stats?.topRealReasons || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Левая колонка: Что написали менеджеры */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            <FileText size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {lang === 'uz' ? 'Xodimlar yozgan sabablar (AmoCRM)' : 'Что указали менеджеры (AmoCRM)'}
            </h3>
            <p className="text-[11px] text-slate-500">
              {lang === 'uz' ? 'Bitim yopilganda tanlangan sabablar' : 'Официальные причины при закрытии'}
            </p>
          </div>
        </div>

        {stated.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            {lang === 'uz' ? 'Ma’lumotlar yo‘q' : 'Нет данных'}
          </div>
        ) : (
          <div className="space-y-2.5">
            {stated.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs"
              >
                <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                  <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-[10px] text-slate-600 dark:text-slate-300 shrink-0">
                    {idx + 1}
                  </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate" title={item.reason}>
                    {item.reason}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {item.count} {lang === 'uz' ? 'ta' : 'шт'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Правая колонка: Что вскрыл аудит ИИ */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <Eye size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{lang === 'uz' ? 'AI aniqlagan haqiqiy sabablar' : 'Что выявил аудит (Факты & ИИ)'}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                {lang === 'uz' ? 'Haqiqat' : 'Реальность'}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500">
              {lang === 'uz' ? 'Qo‘ng‘iroqlar va bosqichlar tahlili' : 'Анализ хронологии этапов и звонков QC'}
            </p>
          </div>
        </div>

        {real.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            {lang === 'uz' ? 'Ma’lumotlar yo‘q' : 'Нет данных'}
          </div>
        ) : (
          <div className="space-y-2.5">
            {real.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 text-xs"
              >
                <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                  <span className="w-5 h-5 rounded-full bg-rose-200 dark:bg-rose-900 flex items-center justify-center font-bold text-[10px] text-rose-700 dark:text-rose-300 shrink-0">
                    {idx + 1}
                  </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate" title={item.reason}>
                    {item.reason}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    {item.count} {lang === 'uz' ? 'ta' : 'шт'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

