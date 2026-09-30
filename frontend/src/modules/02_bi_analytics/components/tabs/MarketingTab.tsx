import { fmtCount, fmtMoney } from '../../types';

interface MarketingTabProps {
  marketing: {
    utmSources?: any[];
    tagsBreakdown?: any[];
    [key: string]: any;
  };
}

export default function MarketingTab({ marketing }: MarketingTabProps) {
  const sourcesArr: any[] = marketing?.utmSources || [];
  const totalSrcRevenue = Math.max(
    sourcesArr.reduce((acc: number, s: any) => acc + (s.revenue || 0), 0),
    1,
  );

  return (
    <div className="space-y-6">
      {/* Dual Comparison Chart: Share of Leads % vs Share of Revenue % per Source */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Сравнение источников: Доля лидов (%) vs Доля выручки (%) и Конверсия (CR%)
            </h3>
            <p className="text-[11px] text-slate-500">
              Показывает, какие источники дают реальные деньги в кассу (зелёная шкала), а какие генерируют только поток заявок без оплат (синяя шкала)
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-500" /> Доля лидов %
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Доля выручки %
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sourcesArr.slice(0, 8).map((s: any) => {
            const leadPct = s.sharePercent ?? 0;
            const revPct = Math.round(((s.revenue || 0) / totalSrcRevenue) * 1000) / 10;
            return (
              <div key={`chart-${s.source}`} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 dark:text-white truncate max-w-[210px]">{s.source}</span>
                  <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold">
                    CR: {s.winRate}%
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="w-24 text-slate-500">Лиды ({fmtCount(s.totalLeads)}):</span>
                    <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div style={{ width: `${Math.min(100, leadPct)}%` }} className="bg-blue-500 h-full rounded-full" />
                    </div>
                    <span className="w-11 text-right font-semibold text-blue-600 dark:text-blue-400">{leadPct}%</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="w-24 text-slate-500">Выручка:</span>
                    <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div style={{ width: `${Math.min(100, revPct)}%` }} className="bg-emerald-500 h-full rounded-full" />
                    </div>
                    <span className="w-11 text-right font-semibold text-emerald-600 dark:text-emerald-400">{revPct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AmoCRM Lead Sources */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Эффективность по источникам сделок (AmoCRM Источники)
              </h3>
              <p className="text-[11px] text-slate-500">
                Системный фильтр «Источник сделок» из AmoCRM (_embedded.source), UTM и телефония
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold">
              Источников: {(marketing?.utmSources || []).length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="p-2.5 text-left">Источник сделки (AmoCRM)</th>
                  <th className="p-2.5 text-right">Лиды</th>
                  <th className="p-2.5 text-right">Доля %</th>
                  <th className="p-2.5 text-right">Продажи</th>
                  <th className="p-2.5 text-right">Отказ</th>
                  <th className="p-2.5 text-right">CR%</th>
                  <th className="p-2.5 text-right">Выручка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(marketing?.utmSources || []).map((u: any) => (
                  <tr key={u.source} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-2.5 font-semibold text-slate-900 dark:text-white">{u.source}</td>
                    <td className="p-2.5 text-right font-bold">{fmtCount(u.totalLeads)}</td>
                    <td className="p-2.5 text-right text-slate-500">{u.sharePercent ?? 0}%</td>
                    <td className="p-2.5 text-right text-emerald-600 font-semibold">{fmtCount(u.wonLeads)}</td>
                    <td className="p-2.5 text-right text-rose-500">{fmtCount(u.lostLeads)}</td>
                    <td className="p-2.5 text-right font-semibold">{u.winRate}%</td>
                    <td className="p-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(u.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tags Breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <h3 className="text-base font-bold mb-3 text-slate-900 dark:text-white">
            Аналитика по тегам AmoCRM
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="p-2.5 text-left">Тег</th>
                  <th className="p-2.5 text-right">Лиды</th>
                  <th className="p-2.5 text-right">Продажи</th>
                  <th className="p-2.5 text-right">CR%</th>
                  <th className="p-2.5 text-right">Выручка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(marketing?.tagsBreakdown || []).map((t: any) => (
                  <tr key={t.tagId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-2.5 font-semibold">#{t.tagName}</td>
                    <td className="p-2.5 text-right">{t.totalLeads}</td>
                    <td className="p-2.5 text-right text-emerald-600 font-semibold">{t.wonLeads}</td>
                    <td className="p-2.5 text-right">{t.winRate}%</td>
                    <td className="p-2.5 text-right font-bold">{fmtMoney(t.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
