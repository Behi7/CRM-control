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
import { useLanguage } from '../../../../i18n/LanguageContext';

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
  const { lang } = useLanguage();
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
            <span>{lang === 'uz' ? 'Tushum (Muvaffaqiyatli yutilgan)' : 'Выручка (Успешно реализовано)'}</span>
            <CheckCircle2 size={18} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {fmtMoney(kpis.totalRevenue)}
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            {lang === 'uz' ? (
              <>Sotuv: <strong>{kpis.wonLeads}</strong> / {kpis.totalLeads} bitim</>
            ) : (
              <>Продаж: <strong>{kpis.wonLeads}</strong> из {kpis.totalLeads} сделок</>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>{lang === 'uz' ? 'Ishdagi potensial (Open Pipeline)' : 'Потенциал в работе (Open Pipeline)'}</span>
            <TrendingUp size={18} className="text-blue-500" />
          </div>
          <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
            {fmtMoney(kpis.openPipelineValue)}
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            {lang === 'uz' ? (
              <>Hozirgi faol bitimlar: <strong>{kpis.openLeads}</strong></>
            ) : (
              <>Активных сделок сейчас: <strong>{kpis.openLeads}</strong></>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>{lang === 'uz' ? 'Boy berilgan tushum (Rad etilgan)' : 'Упущенная выручка (Закрыто в отказ)'}</span>
            <XCircle size={18} className="text-rose-500" />
          </div>
          <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400">
            {fmtMoney(kpis.lostRevenue)}
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            {lang === 'uz' ? (
              <>Boy berilgan bitimlar: <strong>{kpis.lostLeads}</strong></>
            ) : (
              <>Потерянных сделок: <strong>{kpis.lostLeads}</strong></>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>{lang === 'uz' ? 'O‘rtacha va Mediana cheki (AOV)' : 'Средний и Медианный чек (AOV)'}</span>
            <DollarSign size={18} className="text-indigo-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
            {fmtMoney(kpis.avgCheck)}
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            {lang === 'uz' ? (
              <>Mediana chek: <strong>{fmtMoney(kpis.medianCheck)}</strong></>
            ) : (
              <>Медианный чек: <strong>{fmtMoney(kpis.medianCheck)}</strong></>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>{lang === 'uz' ? 'Sotuvga konversiya (Win Rate)' : 'Конверсия в продажу (Win Rate)'}</span>
            <Target size={18} className="text-purple-500" />
          </div>
          <div className="text-2xl font-extrabold text-purple-600 dark:text-purple-400">
            {kpis.winRateClosed}%
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            {lang === 'uz' ? (
              <>Jami yaratilgan lidlardan: <strong>{kpis.winRateTotal}%</strong></>
            ) : (
              <>От всех созданных лидов: <strong>{kpis.winRateTotal}%</strong></>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>{lang === 'uz' ? 'O‘rtacha bitim sikli (Tezlik)' : 'Средний цикл сделки (Скорость)'}</span>
            <Clock size={18} className="text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
            {kpis.avgCycleDays} {lang === 'uz' ? 'kun' : 'дн.'}
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            {lang === 'uz' ? (
              <>Rad etilishgacha o‘rtacha vaqt: <strong>{kpis.avgLossDays} kun</strong></>
            ) : (
              <>Среднее время до отказа: <strong>{kpis.avgLossDays} дн.</strong></>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>{lang === 'uz' ? 'CRM intizomi (Ochiq bitimlar)' : 'Дисциплина CRM (Открытые сделки)'}</span>
            <AlertTriangle size={18} className="text-orange-500" />
          </div>
          <div className="text-2xl font-extrabold text-orange-600 dark:text-orange-400">
            {kpis.noTaskLeads} {lang === 'uz' ? 'vazifasiz' : 'без задач'}
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            {lang === 'uz' ? (
              <>Muddati o‘tgan vazifa bilan: <strong className="text-rose-500">{kpis.overdueTasksLeads}</strong></>
            ) : (
              <>С просроченной задачей: <strong className="text-rose-500">{kpis.overdueTasksLeads}</strong></>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>{lang === 'uz' ? 'Mijozlar bazasi va LTV' : 'Клиентская база и LTV'}</span>
            <Repeat size={18} className="text-teal-500" />
          </div>
          <div className="text-2xl font-extrabold text-teal-600 dark:text-teal-400">
            {fmtCount(lossesAndLtv?.ltv?.repeatContacts || 0)} {lang === 'uz' ? 'takroriy' : 'повторных'}
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            {lang === 'uz' ? (
              <>Jami kontaktlar: <strong>{fmtCount(lossesAndLtv?.ltv?.uniqueContacts || 0)}</strong> ({lossesAndLtv?.ltv?.repeatRatePercent || 0}% Repeat)</>
            ) : (
              <>Всего контактов: <strong>{fmtCount(lossesAndLtv?.ltv?.uniqueContacts || 0)}</strong> ({lossesAndLtv?.ltv?.repeatRatePercent || 0}% Repeat)</>
            )}
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
                <circle cx="60" cy="60" r="50" fill="none" stroke="#10b981" strokeWidth="14" strokeDasharray={`${wonDash} ${C}`} strokeDashoffset={0} />
                <circle cx="60" cy="60" r="50" fill="none" stroke="#3b82f6" strokeWidth="14" strokeDasharray={`${openDash} ${C}`} strokeDashoffset={-wonDash} />
                <circle cx="60" cy="60" r="50" fill="none" stroke="#f43f5e" strokeWidth="14" strokeDasharray={`${lostDash} ${C}`} strokeDashoffset={-(wonDash + openDash)} />
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
                {lang === 'uz' ? 'Portfel va bitimlar tarkibi (%)' : 'Структура портфеля и сделок (%)'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {lang === 'uz'
                  ? 'Yutilgan byudjet, faol payplayn va rad etishlar nisbati'
                  : 'Соотношение выигранного бюджета, активного пайплайна и отказов'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
              <div className="text-emerald-600 dark:text-emerald-400 font-bold">
                {lang === 'uz' ? 'Muvaffaqiyatli' : 'Успешно'} ({wonMoneyPct}%)
              </div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{fmtMoney(kpis.totalRevenue)}</div>
              <div className="text-[11px] text-slate-500">
                {fmtCount(kpis.wonLeads)} {lang === 'uz' ? 'bitim' : 'сделок'} ({wonCountPct}%)
              </div>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
              <div className="text-blue-600 dark:text-blue-400 font-bold">
                {lang === 'uz' ? 'Ish jarayonida' : 'В работе'} ({openMoneyPct}%)
              </div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{fmtMoney(kpis.openPipelineValue)}</div>
              <div className="text-[11px] text-slate-500">
                {fmtCount(kpis.openLeads)} {lang === 'uz' ? 'bitim' : 'сделок'} ({openCountPct}%)
              </div>
            </div>
            <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20">
              <div className="text-rose-600 dark:text-rose-400 font-bold">
                {lang === 'uz' ? 'Rad etilgan' : 'В отказе'} ({lostMoneyPct}%)
              </div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{fmtMoney(kpis.lostRevenue)}</div>
              <div className="text-[11px] text-slate-500">
                {fmtCount(kpis.lostLeads)} {lang === 'uz' ? 'bitim' : 'сделок'} ({lostCountPct}%)
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
              <span>
                {lang === 'uz' ? 'Barcha bitimlar taqsimoti' : 'Распределение всех сделок'} ({fmtCount(kpis.totalLeads)} {lang === 'uz' ? 'ta' : 'шт.'}):
              </span>
              <span>{wonCountPct}% / {openCountPct}% / {lostCountPct}%</span>
            </div>
            <div className="w-full h-3.5 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
              <div style={{ width: `${wonCountPct}%` }} className="bg-emerald-500 h-full" />
              <div style={{ width: `${openCountPct}%` }} className="bg-blue-500 h-full" />
              <div style={{ width: `${lostCountPct}%` }} className="bg-rose-500 h-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Monthly / Daily Timeseries Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <h2 className="text-base font-bold mb-4 text-slate-900 dark:text-white">
          {lang === 'uz'
            ? `Lidlar, sotuvlar va tushum dinamikasi (${timeseries[0]?.period?.length > 7 ? 'kunlar bo‘yicha' : 'oylar bo‘yicha'})`
            : `Динамика лидов, продаж и выручки ${timeseries[0]?.period?.length > 7 ? 'по дням' : 'по месяцам'}`}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="p-3 text-left rounded-l-lg">
                  {lang === 'uz'
                    ? (timeseries[0]?.period?.length > 7 ? 'Davr (Kun)' : 'Davr (Oy)')
                    : (timeseries[0]?.period?.length > 7 ? 'Период (День)' : 'Период (Месяц)')}
                </th>
                <th className="p-3 text-right">{lang === 'uz' ? 'Yangi bitimlar' : 'Новых сделок'}</th>
                <th className="p-3 text-right">{lang === 'uz' ? 'Yutilgan (Won)' : 'Успешно (Won)'}</th>
                <th className="p-3 text-right">{lang === 'uz' ? 'Rad (Lost)' : 'Отказ (Lost)'}</th>
                <th className="p-3 text-right">{lang === 'uz' ? 'Ishda (Open)' : 'В работе (Open)'}</th>
                <th className="p-3 text-right">Win Rate</th>
                <th className="p-3 text-right rounded-r-lg">{lang === 'uz' ? 'Tushum (Won)' : 'Выручка (Won)'}</th>
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
