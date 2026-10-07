import {
  CheckCircle2,
  TrendingUp,
  XCircle,
  DollarSign,
  Target,
  Clock,
  AlertTriangle,
  Repeat,
} from 'lucide-react';
import MountainChart from '../charts/MountainChart';
import { fmtCount, fmtMoney } from '../../types';

interface OverviewTabProps {
  kpis: {
    totalRevenue: number;
    wonLeads: number;
    totalLeads: number;
    openPipelineValue: number;
    openLeads: number;
    lostRevenue: number;
    lostLeads: number;
    avgCheck: number;
    medianCheck: number;
    winRateClosed: number;
    winRateTotal: number;
    avgCycleDays: number;
    avgLossDays: number;
    noTaskLeads: number;
    overdueTasksLeads: number;
    [key: string]: any;
  };
  timeseries: any[];
  lossesAndLtv: {
    ltv?: {
      repeatContacts?: number;
      uniqueContacts?: number;
      repeatRatePercent?: number;
      [key: string]: any;
    };
    [key: string]: any;
  };
}

export default function OverviewTab({ kpis, timeseries = [], lossesAndLtv }: OverviewTabProps) {
  if (!kpis) return null;

  const totalPortfolio = (kpis.totalRevenue || 0) + (kpis.openPipelineValue || 0) + (kpis.lostRevenue || 0);
  const wonMoneyPct = totalPortfolio > 0 ? Math.round((kpis.totalRevenue / totalPortfolio) * 1000) / 10 : 0;
  const openMoneyPct = totalPortfolio > 0 ? Math.round((kpis.openPipelineValue / totalPortfolio) * 1000) / 10 : 0;
  const lostMoneyPct = totalPortfolio > 0 ? Math.max(0, Math.round((100 - wonMoneyPct - openMoneyPct) * 10) / 10) : 0;

  const totalDealsCount = kpis.totalLeads || 1;
  const wonCountPct = Math.round(((kpis.wonLeads || 0) / totalDealsCount) * 1000) / 10;
  const openCountPct = Math.round(((kpis.openLeads || 0) / totalDealsCount) * 1000) / 10;
  const lostCountPct = Math.max(0, Math.round((100 - wonCountPct - openCountPct) * 10) / 10);

  const C = 2 * Math.PI * 50;
  const wonDash = (wonMoneyPct / 100) * C;
  const openDash = (openMoneyPct / 100) * C;
  const lostDash = (lostMoneyPct / 100) * C;

  return (
    <div className="space-y-6">
      {/* 8 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Выручка (Успешно реализовано)</span>
            <CheckCircle2 size={18} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {fmtMoney(kpis.totalRevenue)}
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            Продаж: <strong>{kpis.wonLeads}</strong> из {kpis.totalLeads} сделок
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Потенциал в работе (Open Pipeline)</span>
            <TrendingUp size={18} className="text-blue-500" />
          </div>
          <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
            {fmtMoney(kpis.openPipelineValue)}
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            Активных сделок сейчас: <strong>{kpis.openLeads}</strong>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Упущенная выручка (Закрыто в отказ)</span>
            <XCircle size={18} className="text-rose-500" />
          </div>
          <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400">
            {fmtMoney(kpis.lostRevenue)}
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            Потерянных сделок: <strong>{kpis.lostLeads}</strong>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Средний и Медианный чек (AOV)</span>
            <DollarSign size={18} className="text-indigo-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
            {fmtMoney(kpis.avgCheck)}
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            Медианный чек: <strong>{fmtMoney(kpis.medianCheck)}</strong>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Конверсия в продажу (Win Rate)</span>
            <Target size={18} className="text-purple-500" />
          </div>
          <div className="text-2xl font-extrabold text-purple-600 dark:text-purple-400">
            {kpis.winRateClosed}%
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            От всех созданных лидов: <strong>{kpis.winRateTotal}%</strong>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Средний цикл сделки (Скорость)</span>
            <Clock size={18} className="text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
            {kpis.avgCycleDays} дн.
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            Среднее время до отказа: <strong>{kpis.avgLossDays} дн.</strong>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Дисциплина CRM (Открытые сделки)</span>
            <AlertTriangle size={18} className="text-orange-500" />
          </div>
          <div className="text-2xl font-extrabold text-orange-600 dark:text-orange-400">
            {kpis.noTaskLeads} без задач
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            С просроченной задачей: <strong className="text-rose-500">{kpis.overdueTasksLeads}</strong>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>Клиентская база и LTV</span>
            <Repeat size={18} className="text-teal-500" />
          </div>
          <div className="text-2xl font-extrabold text-teal-600 dark:text-teal-400">
            {fmtCount(lossesAndLtv?.ltv?.repeatContacts || 0)} повторных
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            Всего контактов: <strong>{fmtCount(lossesAndLtv?.ltv?.uniqueContacts || 0)}</strong> ({lossesAndLtv?.ltv?.repeatRatePercent || 0}% Repeat)
          </div>
        </div>
      </div>

      {/* Analytical Mountain Chart */}
      <MountainChart timeseries={timeseries} />

      {/* PORTFOLIO STRUCTURE DONUT & STACKED BAR BANNER */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          <div className="flex items-center gap-5">
            <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 120 120" className="w-28 h-28 -rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="14" />
                <circle cx="60" cy="60" r="50" fill="none" stroke="#10b981" strokeWidth="14" strokeDasharray={`${wonDash} ${C}`} strokeDashoffset={0} className="transition-all duration-700 ease-out" />
                <circle cx="60" cy="60" r="50" fill="none" stroke="#3b82f6" strokeWidth="14" strokeDasharray={`${openDash} ${C}`} strokeDashoffset={-wonDash} className="transition-all duration-700 ease-out" />
                <circle cx="60" cy="60" r="50" fill="none" stroke="#f43f5e" strokeWidth="14" strokeDasharray={`${lostDash} ${C}`} strokeDashoffset={-(wonDash + openDash)} className="transition-all duration-700 ease-out" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[9px] uppercase text-slate-400 font-semibold">Win Rate</span>
                <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                  {kpis.winRateClosed}%
                </span>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Структура портфеля и сделок (%)
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Соотношение выигранного бюджета, активного пайплайна и отказов
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
              <div className="text-emerald-600 dark:text-emerald-400 font-bold">Успешно ({wonMoneyPct}%)</div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{fmtMoney(kpis.totalRevenue)}</div>
              <div className="text-[11px] text-slate-500">{fmtCount(kpis.wonLeads)} сделок ({wonCountPct}%)</div>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
              <div className="text-blue-600 dark:text-blue-400 font-bold">В работе ({openMoneyPct}%)</div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{fmtMoney(kpis.openPipelineValue)}</div>
              <div className="text-[11px] text-slate-500">{fmtCount(kpis.openLeads)} сделок ({openCountPct}%)</div>
            </div>
            <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20">
              <div className="text-rose-600 dark:text-rose-400 font-bold">В отказе ({lostMoneyPct}%)</div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{fmtMoney(kpis.lostRevenue)}</div>
              <div className="text-[11px] text-slate-500">{fmtCount(kpis.lostLeads)} сделок ({lostCountPct}%)</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
              <span>Распределение всех сделок ({fmtCount(kpis.totalLeads)} шт.):</span>
              <span>{wonCountPct}% / {openCountPct}% / {lostCountPct}%</span>
            </div>
            <div className="w-full h-3.5 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
              <div style={{ width: `${wonCountPct}%` }} className="bg-emerald-500 h-full transition-all duration-700 ease-out" />
              <div style={{ width: `${openCountPct}%` }} className="bg-blue-500 h-full transition-all duration-700 ease-out" />
              <div style={{ width: `${lostCountPct}%` }} className="bg-rose-500 h-full transition-all duration-700 ease-out" />
            </div>
          </div>
        </div>
      </div>

      {/* Monthly / Daily Timeseries Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <h2 className="text-base font-bold mb-4 text-slate-900 dark:text-white">
          Динамика лидов, продаж и выручки {timeseries[0]?.period?.length > 7 ? 'по дням' : 'по месяцам'}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="p-3 text-left rounded-l-lg">
                  {timeseries[0]?.period?.length > 7 ? 'Период (День)' : 'Период (Месяц)'}
                </th>
                <th className="p-3 text-right">Новых сделок</th>
                <th className="p-3 text-right">Успешно (Won)</th>
                <th className="p-3 text-right">Отказ (Lost)</th>
                <th className="p-3 text-right">В работе (Open)</th>
                <th className="p-3 text-right">Win Rate</th>
                <th className="p-3 text-right rounded-r-lg">Выручка (Won)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {timeseries.map((row: any) => {
                const wr = row.totalLeads > 0 ? ((row.wonLeads / row.totalLeads) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={row.period} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-semibold">{row.period}</td>
                    <td className="p-3 text-right font-medium">{row.totalLeads}</td>
                    <td className="p-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                      {row.wonLeads}
                    </td>
                    <td className="p-3 text-right text-rose-500">{row.lostLeads}</td>
                    <td className="p-3 text-right text-blue-500">{row.openLeads}</td>
                    <td className="p-3 text-right">{wr}%</td>
                    <td className="p-3 text-right font-bold text-slate-900 dark:text-white">
                      {fmtMoney(row.revenue)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
