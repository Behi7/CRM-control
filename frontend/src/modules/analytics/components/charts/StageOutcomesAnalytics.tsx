import React, { useState } from 'react';
import { CheckCircle2, XCircle, Clock, Timer, ArrowRight, Layers, BarChart3 } from 'lucide-react';
import { WonStats, LostStats } from '../../types';
import { useLanguage } from '../../../../i18n/LanguageContext';

interface StageOutcomesAnalyticsProps {
  wonStats?: WonStats;
  lostStats?: LostStats;
  onStageClick?: (stageId: number) => void;
}

export default function StageOutcomesAnalytics({
  wonStats,
  lostStats,
  onStageClick,
}: StageOutcomesAnalyticsProps) {
  const { lang, formatDuration } = useLanguage();
  const [wonMode, setWonMode] = useState<'cohorts' | 'stages'>('cohorts');
  const [lostMode, setLostMode] = useState<'cohorts' | 'stages'>('cohorts');

  const wonTotal = wonStats?.total || 0;
  const lostTotal = lostStats?.total || 0;

  // Max counts for proportional bar rendering
  const wonMaxCohortCount = Math.max(...(wonStats?.cohorts || []).map((c) => c.count), 1);
  const lostMaxCohortCount = Math.max(...(lostStats?.cohorts || []).map((c) => c.count), 1);

  const wonMaxStageSeconds = Math.max(...(wonStats?.stagesTime || []).map((s) => s.avgSeconds), 1);
  const lostMaxStageSeconds = Math.max(...(lostStats?.stagesTimeBeforeLoss || []).map((s) => s.avgSeconds), 1);

  const formatDays = (days: number | undefined | null) => {
    if (days === null || days === undefined || isNaN(days)) return '—';
    if (days === 0) return lang === 'uz' ? '0 kun' : '0 дн.';
    if (days < 1) {
      const hours = Math.round(days * 24);
      return lang === 'uz' ? `${hours} soat` : `${hours} ч.`;
    }
    return `${days.toFixed(1)} ${lang === 'uz' ? 'kun' : 'дн.'}`;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {/* ── CARD 1: УСПЕШНЫЕ СДЕЛКИ (WON) ── */}
      <div className="bg-white dark:bg-slate-900 border border-emerald-200/80 dark:border-emerald-900/40 rounded-2xl p-5 shadow-xs flex flex-col justify-between transition-all">
        <div>
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  {lang === 'uz' ? 'Muvaffaqiyatli: sikl va yopilish vaqti' : 'Успешные сделки: цикл и время закрытия'}
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                    {wonTotal} {lang === 'uz' ? 'bitim' : 'сд.'}
                  </span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'uz'
                    ? 'Yaratilganidan yopilguncha bo\'lgan vaqt tahlili'
                    : 'Длительность от создания сделки до успешной реализации'}
                </p>
              </div>
            </div>

            {/* Mode Switcher */}
            {wonTotal > 0 && (
              <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setWonMode('cohorts')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    wonMode === 'cohorts'
                      ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Clock size={12} />
                  <span>{lang === 'uz' ? 'Sikl taqsimoti' : 'Когорты цикла'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWonMode('stages')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    wonMode === 'stages'
                      ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Layers size={12} />
                  <span>{lang === 'uz' ? 'Bosqichlar vaqti' : 'Время на этапах'}</span>
                </button>
              </div>
            )}
          </div>

          {/* KPI Summary Tiles */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-xl bg-emerald-500/[0.04] dark:bg-emerald-950/20 border border-emerald-500/10">
              <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                <Timer size={12} className="text-emerald-600 dark:text-emerald-400" />
                <span>{lang === 'uz' ? 'O\'rtacha sikl' : 'Средний цикл сделки'}</span>
              </div>
              <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                {wonTotal > 0 ? formatDays(wonStats?.avgDays) : '—'}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                {wonTotal > 0 ? formatDuration((wonStats?.avgDays || 0) * 86400) : '0'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/[0.04] dark:bg-emerald-950/20 border border-emerald-500/10">
              <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                <BarChart3 size={12} className="text-emerald-600 dark:text-emerald-400" />
                <span>{lang === 'uz' ? 'Mediana sikl' : 'Медианный цикл'}</span>
              </div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {wonTotal > 0 ? formatDays(wonStats?.medianDays) : '—'}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                {lang === 'uz' ? '50% bitimlar tezroq yopiladi' : '50% сделок закрываются быстрее'}
              </div>
            </div>
          </div>

          {/* Visual Content */}
          {wonTotal === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              {lang === 'uz'
                ? 'Muvaffaqiyatli bitimlar bo\'yicha ma\'lumot topilmadi'
                : 'Нет данных по успешным сделкам за выбранный период'}
            </div>
          ) : wonMode === 'cohorts' ? (
            /* Mode 1: Cohort Distribution */
            <div className="space-y-2.5">
              {(wonStats?.cohorts || []).map((c) => {
                const isDominant = c.count === wonMaxCohortCount && c.count > 0;
                const widthPercent = (c.count / wonMaxCohortCount) * 100;
                return (
                  <div key={c.key} className="group">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={`font-medium ${isDominant ? 'text-emerald-700 dark:text-emerald-300 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                        {lang === 'uz' ? c.labelUz : c.label}
                      </span>
                      <div className="flex items-center gap-1.5 font-semibold">
                        <span className="text-slate-900 dark:text-white">{c.count} {lang === 'uz' ? 'ta' : 'сд.'}</span>
                        <span className="text-[11px] text-slate-400">({c.share}%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isDominant
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                            : 'bg-emerald-400/80 dark:bg-emerald-500/60'
                        }`}
                        style={{ width: `${Math.max(widthPercent, c.count > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Mode 2: Stages Duration for Won Leads */
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {(wonStats?.stagesTime || []).length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  {lang === 'uz' ? 'Bosqichlar tarixi topilmadi' : 'Нет данных по истории этапов'}
                </div>
              ) : (
                wonStats?.stagesTime.map((s) => {
                  const widthPercent = (s.avgSeconds / wonMaxStageSeconds) * 100;
                  return (
                    <div
                      key={s.stageId}
                      onClick={() => onStageClick?.(s.stageId)}
                      className="p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700/60"
                      title={lang === 'uz' ? 'Bosqich bitimlarini ko\'rish' : 'Нажмите для перехода к сделкам этапа'}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                          {s.stageName}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                            {formatDuration(s.avgSeconds)}
                          </span>
                          <span className="text-[11px] text-slate-400 font-normal">
                            ({s.leadsCount} {lang === 'uz' ? 'ta' : 'сд.'})
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500/80 transition-all duration-300"
                          style={{ width: `${Math.max(widthPercent, 3)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer tip */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
          <span>{lang === 'uz' ? 'Muvaffaqiyatli bitimlar me\'yori' : 'Норматив успешной сделки'}</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
            {wonTotal > 0 ? `~${Math.round(wonStats?.avgDays || 0)} ${lang === 'uz' ? 'kun o\'rtacha' : 'дн. в среднем'}` : '—'}
          </span>
        </div>
      </div>

      {/* ── CARD 2: ОТКАЗЫ (LOST) ── */}
      <div className="bg-white dark:bg-slate-900 border border-rose-200/80 dark:border-rose-900/40 rounded-2xl p-5 shadow-xs flex flex-col justify-between transition-all">
        <div>
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <XCircle size={18} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  {lang === 'uz' ? 'Rad etilganlar: yashash va to\'xtash vaqti' : 'Отказы: срок жизни и зависание'}
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                    {lostTotal} {lang === 'uz' ? 'bitim' : 'сд.'}
                  </span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'uz'
                    ? 'Bitimlar qancha yashaydi va qaysi bosqichlarda eng ko\'p to\'xtab qoladi'
                    : 'Сколько лиды живут до отказа и где дольше всего маринуются'}
                </p>
              </div>
            </div>

            {/* Mode Switcher */}
            {lostTotal > 0 && (
              <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setLostMode('cohorts')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    lostMode === 'cohorts'
                      ? 'bg-white dark:bg-slate-700 text-rose-700 dark:text-rose-300 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Clock size={12} />
                  <span>{lang === 'uz' ? 'Yashash muddati' : 'Срок до отказа'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLostMode('stages')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    lostMode === 'stages'
                      ? 'bg-white dark:bg-slate-700 text-rose-700 dark:text-rose-300 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Layers size={12} />
                  <span>{lang === 'uz' ? 'To\'xtab qolish' : 'Зависание на этапах'}</span>
                </button>
              </div>
            )}
          </div>

          {/* KPI Summary Tiles */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-xl bg-rose-500/[0.04] dark:bg-rose-950/20 border border-rose-500/10">
              <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                <Timer size={12} className="text-rose-600 dark:text-rose-400" />
                <span>{lang === 'uz' ? 'O\'rtacha umr muddati' : 'Средний срок до срыва'}</span>
              </div>
              <div className="text-lg font-bold text-rose-700 dark:text-rose-300">
                {lostTotal > 0 ? formatDays(lostStats?.avgDays) : '—'}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                {lostTotal > 0 ? formatDuration((lostStats?.avgDays || 0) * 86400) : '0'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-500/[0.04] dark:bg-rose-950/20 border border-rose-500/10">
              <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                <BarChart3 size={12} className="text-rose-600 dark:text-rose-400" />
                <span>{lang === 'uz' ? 'Mediana muddat' : 'Медиана до срыва'}</span>
              </div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {lostTotal > 0 ? formatDays(lostStats?.medianDays) : '—'}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                {lang === 'uz' ? '50% rad etilishlar tezroq yuz beradi' : '50% отказов происходят быстрее'}
              </div>
            </div>
          </div>

          {/* Visual Content */}
          {lostTotal === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              {lang === 'uz'
                ? 'Rad etilgan bitimlar bo\'yicha ma\'lumot topilmadi'
                : 'Нет данных по отказам за выбранный период'}
            </div>
          ) : lostMode === 'cohorts' ? (
            /* Mode 1: Cohort Distribution */
            <div className="space-y-2.5">
              {(lostStats?.cohorts || []).map((c) => {
                const isDominant = c.count === lostMaxCohortCount && c.count > 0;
                const widthPercent = (c.count / lostMaxCohortCount) * 100;
                return (
                  <div key={c.key} className="group">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={`font-medium ${isDominant ? 'text-rose-700 dark:text-rose-300 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                        {lang === 'uz' ? c.labelUz : c.label}
                      </span>
                      <div className="flex items-center gap-1.5 font-semibold">
                        <span className="text-slate-900 dark:text-white">{c.count} {lang === 'uz' ? 'ta' : 'сд.'}</span>
                        <span className="text-[11px] text-slate-400">({c.share}%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isDominant
                            ? 'bg-gradient-to-r from-rose-500 to-amber-500'
                            : 'bg-rose-400/80 dark:bg-rose-500/60'
                        }`}
                        style={{ width: `${Math.max(widthPercent, c.count > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Mode 2: Stages Time Before Loss */
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {(lostStats?.stagesTimeBeforeLoss || []).length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  {lang === 'uz' ? 'Bosqichlar tarixi topilmadi' : 'Нет данных по истории этапов'}
                </div>
              ) : (
                lostStats?.stagesTimeBeforeLoss.map((s) => {
                  const widthPercent = (s.avgSeconds / lostMaxStageSeconds) * 100;
                  return (
                    <div
                      key={s.stageId}
                      onClick={() => onStageClick?.(s.stageId)}
                      className="p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700/60"
                      title={lang === 'uz' ? 'Bosqich bitimlarini ko\'rish' : 'Нажмите для перехода к сделкам этапа'}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[190px]">
                          {s.stageName}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-rose-600 dark:text-rose-400 font-bold">
                            {formatDuration(s.avgSeconds)}
                          </span>
                          <span className="text-[11px] text-slate-400 font-normal">
                            ({s.droppedCount} {lang === 'uz' ? 'ta' : 'сд.'} • {s.share}%)
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-rose-500/80 transition-all duration-300"
                          style={{ width: `${Math.max(widthPercent, 3)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer tip */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
          <span>{lang === 'uz' ? 'Tezkor rad etilishlar (<1 kun)' : 'Быстрый отсев нецелевых (<1 дня)'}</span>
          <span className="text-rose-600 dark:text-rose-400 font-medium">
            {lostStats?.cohorts?.find((c) => c.key === 'under_1d')?.share || 0}%
          </span>
        </div>
      </div>
    </div>
  );
}
