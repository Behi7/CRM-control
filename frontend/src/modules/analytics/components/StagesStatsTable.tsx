import React from 'react';
import { HelpCircle } from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';

interface StageStatItem {
  stageId: number;
  externalId: string;
  name: string;
  avgSecondsActual: number | null;
  avgSecondsIncludingSkips: number | null;
  skipsCount: number;
  leadsCount: number;
  activeLeadsCount: number;
}

interface StagesStatsTableProps {
  items: StageStatItem[];
  onStageClick: (stageId: number) => void;
}

export default function StagesStatsTable({ items, onStageClick }: StagesStatsTableProps) {
  const { t, formatDuration } = useLanguage();

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200">
          <tr>
            <th className="p-3 text-left">{t('col_stage')}</th>
            <th className="p-3 text-right">
              <span className="inline-flex items-center gap-1">
                {t('col_avg_time_actual')}
                <span title={t('tooltip_actual')} className="cursor-help text-slate-400">
                  <HelpCircle size={13} />
                </span>
              </span>
            </th>
            <th className="p-3 text-right">
              <span className="inline-flex items-center gap-1">
                {t('col_avg_time_skips')}
                <span title={t('tooltip_skips')} className="cursor-help text-slate-400">
                  <HelpCircle size={13} />
                </span>
              </span>
            </th>
            <th className="p-3 text-right">
              <span className="inline-flex items-center gap-1">
                {t('col_skips')}
                <span title={t('tooltip_skips_count')} className="cursor-help text-slate-400">
                  <HelpCircle size={13} />
                </span>
              </span>
            </th>
            <th className="p-3 text-right">
              <span className="inline-flex items-center gap-1">
                {t('col_passed_stage')}
                <span title={t('tooltip_passed')} className="cursor-help text-slate-400">
                  <HelpCircle size={13} />
                </span>
              </span>
            </th>
            <th className="p-3 text-right">
              <span className="inline-flex items-center gap-1">
                {t('col_active_stage')}
                <span title={t('tooltip_active')} className="cursor-help text-slate-400">
                  <HelpCircle size={13} />
                </span>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => {
            const isWon = s.externalId === '142';
            const isLost = s.externalId === '143';
            const rowBg = isWon
              ? 'bg-green-50/40 dark:bg-green-950/25 hover:bg-green-50 dark:hover:bg-green-950/40'
              : isLost
              ? 'bg-red-50/40 dark:bg-red-950/25 hover:bg-red-50 dark:hover:bg-red-950/40'
              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50';

            return (
              <tr
                key={s.stageId}
                className={`border-t border-slate-200 dark:border-slate-800 cursor-pointer transition-colors ${rowBg}`}
                onClick={() => onStageClick(s.stageId)}
              >
                <td className="p-3 font-medium text-slate-900 dark:text-slate-100">
                  {s.name}
                </td>
                <td className="p-3 text-right text-slate-700 dark:text-slate-300">
                  {isWon || isLost ? '—' : formatDuration(s.avgSecondsActual)}
                </td>
                <td className="p-3 text-right text-slate-700 dark:text-slate-300">
                  {isWon || isLost ? '—' : formatDuration(s.avgSecondsIncludingSkips)}
                </td>
                <td className="p-3 text-right text-slate-700 dark:text-slate-300">
                  {isWon || isLost ? '—' : s.skipsCount}
                </td>
                <td className="p-3 text-right text-slate-700 dark:text-slate-300">
                  {s.leadsCount}
                </td>
                <td className="p-3 text-right text-slate-700 dark:text-slate-300">
                  {s.activeLeadsCount}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
