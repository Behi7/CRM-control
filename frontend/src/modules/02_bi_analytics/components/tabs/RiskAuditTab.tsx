import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { useAuth } from '../../../../auth/AuthContext';
import { fmtMoney } from '../../types';

interface RiskAuditTabProps {
  kpis: any;
  riskDeals: any[];
}

export default function RiskAuditTab({ kpis, riskDeals = [] }: RiskAuditTabProps) {
  const { role } = useAuth();
  const navigate = useNavigate();

  const riskBudget = riskDeals.reduce((acc: number, d: any) => acc + (d.price || 0), 0);
  const openPipe = Math.max(kpis?.openPipelineValue || 0, riskBudget, 1);
  const riskSharePct = Math.min(100, Math.round((riskBudget / openPipe) * 1000) / 10);
  const safeSharePct = Math.max(0, Math.round((100 - riskSharePct) * 10) / 10);

  const noTaskBudget = riskDeals.filter((d: any) => d.riskType === 'no_task').reduce((a: number, d: any) => a + (d.price || 0), 0);
  const overdueBudget = riskDeals.filter((d: any) => d.riskType === 'overdue_task').reduce((a: number, d: any) => a + (d.price || 0), 0);
  const staleBudget = riskDeals.filter((d: any) => d.riskType === 'stale_deal').reduce((a: number, d: any) => a + (d.price || 0), 0);

  return (
    <div className="space-y-6">
      {/* Pipeline Risk Thermometer Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Термометр риска открытого пайплайна (% бюджета под угрозой)
            </h3>
            <p className="text-[11px] text-slate-500">
              Доля бюджета в ТОП-25 проблемных сделках относительно всего открытого пайплайна ({fmtMoney(kpis?.openPipelineValue || 0)})
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
              В безопасности: {safeSharePct}%
            </span>
            <span className="px-3 py-1 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold">
              В зоне риска: {fmtMoney(riskBudget)} ({riskSharePct}%)
            </span>
          </div>
        </div>

        <div className="w-full h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
          <div style={{ width: `${safeSharePct}%` }} className="bg-emerald-500 h-full" title={`В порядке: ${safeSharePct}%`} />
          <div style={{ width: `${riskSharePct}%` }} className="bg-gradient-to-r from-amber-500 to-rose-600 h-full" title={`Под угрозой: ${riskSharePct}%`} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/20 flex items-center justify-between text-xs">
            <span className="text-orange-600 dark:text-orange-400 font-semibold">Без поставленной задачи:</span>
            <span className="font-bold text-slate-900 dark:text-white">{fmtMoney(noTaskBudget)}</span>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 flex items-center justify-between text-xs">
            <span className="text-rose-600 dark:text-rose-400 font-semibold">С просроченной задачей:</span>
            <span className="font-bold text-slate-900 dark:text-white">{fmtMoney(overdueBudget)}</span>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center justify-between text-xs">
            <span className="text-amber-600 dark:text-amber-400 font-semibold">Без движения &gt; 14 дней:</span>
            <span className="font-bold text-slate-900 dark:text-white">{fmtMoney(staleBudget)}</span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" />
            <span>Аудит: ТОП-25 открытых сделок с высоким бюджетом в зоне риска</span>
          </h3>
          <p className="text-xs text-slate-500">
            Активные сделки, требующие немедленного контроля РОПа (нет поставленной задачи, задача просрочена или нет движения более 14 дней)
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="p-3 text-left">Сделка</th>
                <th className="p-3 text-left">Этап</th>
                <th className="p-3 text-left">Ответственный</th>
                <th className="p-3 text-right">Бюджет</th>
                <th className="p-3 text-right">Без движения</th>
                <th className="p-3 text-left">Причина риска</th>
                <th className="p-3 text-right">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {riskDeals.map((deal: any) => (
                <tr key={deal.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="p-3 font-semibold text-slate-900 dark:text-white">
                    <button
                      onClick={() =>
                        navigate(role === 'admin' ? `/admin/lead/${deal.id}` : `/lead/${deal.id}`)
                      }
                      className="hover:text-blue-500 text-left cursor-pointer"
                    >
                      {deal.name}
                    </button>
                  </td>
                  <td className="p-3 text-slate-600 dark:text-slate-300">{deal.stageName}</td>
                  <td className="p-3 font-medium">{deal.managerName}</td>
                  <td className="p-3 text-right font-bold text-slate-900 dark:text-white">
                    {fmtMoney(deal.price)}
                  </td>
                  <td className="p-3 text-right text-slate-500">{deal.idleDays} дн.</td>
                  <td className="p-3">
                    {deal.riskType === 'no_task' && (
                      <span className="px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 font-semibold">
                        Нет поставленной задачи
                      </span>
                    )}
                    {deal.riskType === 'overdue_task' && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold">
                        Задача просрочена
                      </span>
                    )}
                    {deal.riskType === 'stale_deal' && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                        Зависла &gt; 14 дней
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <a
                      href={deal.crmUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      <span>AmoCRM</span>
                      <ExternalLink size={12} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
