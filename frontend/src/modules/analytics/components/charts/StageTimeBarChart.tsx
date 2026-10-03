import React from 'react';
import { Clock, AlertTriangle, ChevronRight, Zap } from 'lucide-react';
import { useLanguage } from '../../../../i18n/LanguageContext';
import { StageStatItem } from '../StagesStatsTable';

interface StageTimeBarChartProps {
  items: StageStatItem[];
  onStageClick?: (stageId: number) => void;
}

export default function StageTimeBarChart({ items = [], onStageClick }: StageTimeBarChartProps) {
  const { lang, formatDuration } = useLanguage();

  const workingStages = items.filter(
    (s) => s.externalId !== '142' && s.externalId !== '143',
  );

  const maxDuration = Math.max(
    ...workingStages.map((s) => s.avgSecondsActual || 0),
    1,
  );

  // Find bottleneck stage (stage with maximum actual duration > 0)
  const bottleneck = workingStages.reduce<StageStatItem | null>((max, s) => {
    const dur = s.avgSecondsActual || 0;
    if (dur <= 0) return max;
    if (!max || dur > (max.avgSecondsActual || 0)) return s;
    return max;
  }, null);

  const totalCycleSeconds = workingStages.reduce(
    (sum, s) => sum + (s.avgSecondsActual || 0),
    0,
  );


  if (workingStages.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 transition-all">
      {/* Chart Top Header & Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-200/70 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Clock size={18} />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
              {lang === 'uz' ? 'Bosqichlar tezligi va tor joylar' : 'Скорость прохождения этапов и узкие места'}
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {lang === 'uz'
                ? 'Bosqichlar bo\'yicha o\'rtacha vaqt va ayni paytdagi yuklama'
                : 'Среднее время нахождения сделки на этапах и текущая нагрузка'}
            </p>
          </div>
        </div>

        {/* Quick KPI Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {totalCycleSeconds > 0 && (
            <div className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 flex items-center gap-1.5">
              <Zap size={13} className="text-indigo-500" />
              <span>
                {lang === 'uz' ? 'Jami sikl: ' : 'Суммарный цикл: '}
                <strong className="font-bold">{formatDuration(totalCycleSeconds)}</strong>
              </span>
            </div>
          )}

          {bottleneck && (
            <div className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 flex items-center gap-1.5 animate-in fade-in-50">
              <AlertTriangle size={13} className="text-rose-500 shrink-0" />
              <span className="truncate max-w-[240px]">
                {lang === 'uz' ? 'Tor joy: ' : 'Затык: '}
                <strong className="font-bold">{bottleneck.name}</strong> ({formatDuration(bottleneck.avgSecondsActual)})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Horizontal Stage Bars List */}
      <div className="space-y-2.5">
        {workingStages.map((stage, idx) => {
          const isBottleneck = bottleneck?.stageId === stage.stageId;
          const durSeconds = stage.avgSecondsActual || 0;
          const widthPct = durSeconds > 0 ? Math.max(6, Math.min(100, Math.round((durSeconds / maxDuration) * 100))) : 3;

          return (
            <div
              key={stage.stageId}
              onClick={() => onStageClick && onStageClick(stage.stageId)}
              className="group p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-400/60 dark:hover:border-indigo-500/60 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
              title={`${stage.name}: ${formatDuration(stage.avgSecondsActual)} (${stage.activeLeadsCount} в работе, ${stage.leadsCount} прошло)`}
            >
              {/* Stage Title and Badges Row */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {stage.name}
                  </span>
                  {isBottleneck && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 uppercase tracking-wide shrink-0 flex items-center gap-1">
                      <AlertTriangle size={10} />
                      {lang === 'uz' ? 'Tor joy' : 'Узкое место'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 text-xs">
                  {stage.activeLeadsCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                      {stage.activeLeadsCount} {lang === 'uz' ? 'ishda' : 'в работе'}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      0 {lang === 'uz' ? 'ishda' : 'в работе'}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400">•</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {stage.leadsCount} {lang === 'uz' ? 'o\'tdi' : 'прошло'}
                  </span>
                  <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>

              {/* Bar track and fill */}
              <div className="w-full bg-slate-100 dark:bg-slate-800/80 rounded-lg h-6 p-0.5 relative flex items-center overflow-hidden">
                <div
                  className={`h-full rounded-md transition-all duration-500 flex items-center px-2 text-[11px] font-bold select-none ${
                    isBottleneck
                      ? 'bg-gradient-to-r from-amber-500 via-rose-500 to-rose-600 text-white shadow-xs'
                      : durSeconds > 0
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
                      : 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                  style={{ width: `${widthPct}%` }}
                >
                  {durSeconds > 0 && widthPct >= 20 && (
                    <span className="truncate">{formatDuration(stage.avgSecondsActual)}</span>
                  )}
                </div>

                {/* Duration label outside if bar is too narrow */}
                {(durSeconds === 0 || widthPct < 20) && (
                  <span className="ml-2 text-[11px] font-semibold text-slate-600 dark:text-slate-400 select-none">
                    {durSeconds > 0 ? formatDuration(stage.avgSecondsActual) : (lang === 'uz' ? '0 soniya' : '0 сек')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

