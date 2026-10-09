import { fmtMoney } from '../../types';
import { useLanguage } from '../../../../i18n/LanguageContext';

interface ManagersTabProps {
  managers: any[];
}

export default function ManagersTab({ managers = [] }: ManagersTabProps) {
  const { lang } = useLanguage();
  const totalDeptRev = Math.max(
    managers.reduce((acc: number, m: any) => acc + (m.revenue || 0), 0),
    1,
  );
  const maxMgrRevOrPipe = Math.max(
    ...managers.map((m: any) => (m.revenue || 0) + (m.openValue || 0)),
    1,
  );

  return (
    <div className="space-y-6">
      {/* Visual Charts for Managers: Revenue vs Pipeline Bars & Discipline Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Revenue & Pipeline Potential Share */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {lang === 'uz'
                  ? 'Tushum, ishdagi potensial va bo‘limdagi ulush (%)'
                  : 'Выручка, потенциал в работе и доля в отделе (%)'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {lang === 'uz'
                  ? 'Yashil — keltirilgan tushum (Won) • Ko‘k — ishdagi faol payplayn'
                  : 'Зелёный — принесённая выручка (Won) • Синий — активный пайплайн в работе'}
              </p>
            </div>
          </div>
          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {managers.slice(0, 12).map((m: any) => {
              const revShare = Math.round(((m.revenue || 0) / totalDeptRev) * 1000) / 10;
              const wonW = Math.round(((m.revenue || 0) / maxMgrRevOrPipe) * 100);
              const openW = Math.round(((m.openValue || 0) / maxMgrRevOrPipe) * 100);
              return (
                <div key={m.managerId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                      {m.managerName}
                    </span>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        {fmtMoney(m.revenue)}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                        {revShare}% {lang === 'uz' ? 'bo‘limdan' : 'отдела'}
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${wonW}%` }}
                      className="bg-emerald-500 h-full"
                      title={`${lang === 'uz' ? 'Tushum' : 'Выручка'}: ${fmtMoney(m.revenue)}`}
                    />
                    <div
                      style={{ width: `${openW}%` }}
                      className="bg-blue-500 h-full"
                      title={`${lang === 'uz' ? 'Ishda' : 'В работе'}: ${fmtMoney(m.openValue)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 2: 100% Stacked CRM Discipline Health per Manager */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {lang === 'uz'
                ? 'Ochiq bitimlar intizomi indikatori (100% salomatlik shkalasi)'
                : 'Индикатор дисциплины открытых сделок (100% шкала здоровья)'}
            </h3>
            <p className="text-[11px] text-slate-500">
              {lang === 'uz'
                ? 'Yashil: vazifa o‘z vaqtida • To‘q sariq: vazifasiz • Qizil: muddati o‘tgan'
                : 'Зелёный: задача поставлена вовремя • Оранжевый: без задач • Красный: задача просрочена'}
            </p>
          </div>
          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {managers
              .filter((m: any) => (m.openLeads || 0) > 0)
              .slice(0, 12)
              .map((m: any) => {
                const openTot = Math.max(m.openLeads || 0, 1);
                const noTask = Math.min(openTot, m.noTaskLeads || 0);
                const overdue = Math.min(openTot - noTask, m.overdueTasksLeads || 0);
                const healthy = Math.max(0, openTot - noTask - overdue);

                const healthyPct = Math.round((healthy / openTot) * 100);
                const noTaskPct = Math.round((noTask / openTot) * 100);
                const overduePct = Math.max(0, 100 - healthyPct - noTaskPct);

                return (
                  <div key={`disc-${m.managerId}`} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                        {m.managerName} <span className="text-slate-400 font-normal">({m.openLeads} {lang === 'uz' ? 'ochiq' : 'откр.'})</span>
                      </span>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-emerald-600 font-semibold">
                          {lang === 'uz' ? 'Me’yor' : 'Норма'}: {healthyPct}%
                        </span>
                        {noTask > 0 && (
                          <span className="text-orange-500 font-semibold">
                            {lang === 'uz' ? 'Vazifasiz' : 'Без задач'}: {noTaskPct}%
                          </span>
                        )}
                        {overdue > 0 && (
                          <span className="text-rose-500 font-semibold">
                            {lang === 'uz' ? 'Muddati o‘tgan' : 'Просроч.'}: {overduePct}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                      <div style={{ width: `${healthyPct}%` }} className="bg-emerald-500 h-full" />
                      <div style={{ width: `${noTaskPct}%` }} className="bg-orange-500 h-full" />
                      <div style={{ width: `${overduePct}%` }} className="bg-rose-500 h-full" />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {lang === 'uz'
              ? 'Savdo bo‘limi menejerlarining samaradorlik va CRM-intizom reytingi'
              : 'Рейтинг эффективности и CRM-дисциплины менеджеров отдела продаж'}
          </h2>
          <p className="text-xs text-slate-500">
            {lang === 'uz'
              ? 'Menejerlarni tushum, konversiya, o‘rtacha chek, bitimlarni yopish tezligi va vazifasiz unutilgan mijozlar bo‘yicha taqqoslash'
              : 'Сравнение менеджеров по выручке, конверсии, среднему чеку, скорости закрытия сделок и наличию забытых клиентов без задач'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="p-3 text-left">{lang === 'uz' ? 'Menejer' : 'Менеджер'}</th>
                <th className="p-3 text-right">{lang === 'uz' ? 'Jami bitimlar' : 'Всего сделок'}</th>
                <th className="p-3 text-right">{lang === 'uz' ? 'Yutilgan (Won)' : 'Успешно (Won)'}</th>
                <th className="p-3 text-right">{lang === 'uz' ? 'Rad (Lost)' : 'Отказ (Lost)'}</th>
                <th className="p-3 text-right">{lang === 'uz' ? 'Ishda' : 'В работе'}</th>
                <th className="p-3 text-right">Win Rate</th>
                <th className="p-3 text-right">{lang === 'uz' ? 'Tushum (Won)' : 'Выручка (Won)'}</th>
                <th className="p-3 text-right">{lang === 'uz' ? 'O‘rtacha chek' : 'Средний чек'}</th>
                <th className="p-3 text-right">{lang === 'uz' ? 'Sikl (kun)' : 'Цикл (дн.)'}</th>
                <th className="p-3 text-right text-orange-600 dark:text-orange-400">{lang === 'uz' ? 'Vazifasiz' : 'Без задач'}</th>
                <th className="p-3 text-right text-rose-600 dark:text-rose-400">{lang === 'uz' ? 'Muddati o‘tgan' : 'Просрочено'}</th>
                <th className="p-3 text-right">{lang === 'uz' ? 'Bosqich sakrashlari' : 'Пропуски этапов'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {managers.map((m: any, idx: number) => (
                <tr key={m.managerId || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="p-3 font-semibold text-slate-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-[10px]">
                        {idx + 1}
                      </span>
                      <span>{m.managerName}</span>
                    </div>
                  </td>
                  <td className="p-3 text-right font-medium">{m.totalLeads}</td>
                  <td className="p-3 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                    {m.wonLeads}
                  </td>
                  <td className="p-3 text-right text-rose-500">{m.lostLeads}</td>
                  <td className="p-3 text-right text-blue-500">{m.openLeads}</td>
                  <td className="p-3 text-right font-semibold">{m.winRate}%</td>
                  <td className="p-3 text-right font-extrabold text-emerald-600 dark:text-emerald-400">
                    {fmtMoney(m.revenue)}
                  </td>
                  <td className="p-3 text-right">{fmtMoney(m.avgCheck)}</td>
                  <td className="p-3 text-right">{m.avgCycleDays} {lang === 'uz' ? 'kun' : 'дн.'}</td>
                  <td className="p-3 text-right font-semibold text-orange-600 dark:text-orange-400">
                    {m.noTaskLeads}
                  </td>
                  <td className="p-3 text-right font-semibold text-rose-600 dark:text-rose-400">
                    {m.overdueTasksLeads}
                  </td>
                  <td className="p-3 text-right text-slate-500">{m.stageSkipsCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
