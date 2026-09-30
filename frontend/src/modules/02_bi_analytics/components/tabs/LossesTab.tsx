import { fmtCount, fmtMoney } from '../../types';

interface LossesTabProps {
  lossReasons: any[];
}

export default function LossesTab({ lossReasons = [] }: LossesTabProps) {
  const reasons = lossReasons || [];
  const maxLostCount = Math.max(...reasons.map((r: any) => r.lostLeads || 0), 1);
  let cum = 0;
  const paretoItems = reasons.slice(0, 12).map((r: any) => {
    cum = Math.min(100, Math.round((cum + (r.sharePercent || 0)) * 10) / 10);
    return { ...r, cumulativePercent: cum };
  });

  return (
    <div className="space-y-6">
      {/* Pareto 80/20 Chart (Bars + Cumulative % Line) */}
      {paretoItems.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Диаграмма Парето (80/20) по причинам отказа (Свечи потерь + Накопительный %)
              </h3>
              <p className="text-[11px] text-slate-500">
                Столбцы — количество потерянных сделок • Линия сверху — накопительный процент от всех отказов (зона до 80% выделена красным)
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold">
              Зона Парето 80% потерь
            </span>
          </div>

          <div className="h-52 flex items-end gap-3 pt-8 pb-2 px-2 overflow-x-auto">
            {paretoItems.map((item: any) => {
              const barH = Math.max(12, Math.round(((item.lostLeads || 0) / maxLostCount) * 140));
              const inParetoZone = item.cumulativePercent <= 85;
              return (
                <div key={`pareto-${item.reason}`} className="flex-1 min-w-[76px] flex flex-col items-center">
                  <span
                    className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded mb-1 ${
                      inParetoZone
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}
                  >
                    ∑ {item.cumulativePercent}%
                  </span>
                  <div
                    style={{ height: `${barH}px` }}
                    className={`w-8 rounded-t-lg transition-all ${
                      inParetoZone
                        ? 'bg-gradient-to-t from-rose-600 to-rose-400 shadow-xs'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                    title={`${item.reason}: ${item.lostLeads} сделок (${item.sharePercent}%) | Накопительно: ${item.cumulativePercent}%`}
                  />
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 mt-1.5 truncate max-w-[84px] text-center">
                    {item.reason}
                  </span>
                  <span className="text-[10px] text-rose-500 font-bold">{item.sharePercent}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Причины отказа (Почему теряются сделки и бюджет)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Данные собираются из системной причины отказа AmoCRM и кастомного списочного поля «Rad etish sababi» / «Причина отказа»
            </p>
          </div>
          <span className="text-xs px-3 py-1 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold border border-rose-500/20">
            Причин отказа: {reasons.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="p-3 text-left rounded-l-lg">Причина отказа</th>
                <th className="p-3 text-right">Потеряно сделок</th>
                <th className="p-3 text-right">Доля от всех отказов %</th>
                <th className="p-3 text-right">Упущенная сумма</th>
                <th className="p-3 text-right rounded-r-lg">Средний бюджет отказа</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {reasons.map((lr: any) => (
                <tr key={lr.reason} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="p-3 font-semibold text-slate-900 dark:text-white">{lr.reason}</td>
                  <td className="p-3 text-right font-bold text-rose-500">{fmtCount(lr.lostLeads)}</td>
                  <td className="p-3 text-right">
                    <div className="inline-flex items-center gap-2 justify-end">
                      <div className="w-24 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-rose-500 h-full rounded-full"
                          style={{ width: `${Math.min(100, lr.sharePercent || 0)}%` }}
                        />
                      </div>
                      <span className="font-semibold w-12 text-right">{lr.sharePercent}%</span>
                    </div>
                  </td>
                  <td className="p-3 text-right font-bold text-rose-600 dark:text-rose-400">
                    {fmtMoney(lr.lostValue)}
                  </td>
                  <td className="p-3 text-right text-slate-600 dark:text-slate-300 font-medium">
                    {fmtMoney(lr.avgLostCheck ?? (lr.lostLeads > 0 ? Math.round(lr.lostValue / lr.lostLeads) : 0))}
                  </td>
                </tr>
              ))}
              {reasons.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    Нет закрытых в отказ сделок за выбранный период
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
