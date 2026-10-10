import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { LifeBuoy, AlertTriangle, ArrowUpRight, DollarSign, User, HelpCircle, Loader2 } from 'lucide-react';
import { qcApi } from '../api/qcApi';
import { useLanguage } from '../../../i18n/LanguageContext';

interface RescueDealsBoardProps {
  accountId: number;
  pipelineId?: number;
}

export default function RescueDealsBoard({ accountId, pipelineId }: RescueDealsBoardProps) {
  const { lang } = useLanguage();

  const { data: deals, isLoading } = useQuery({
    queryKey: ['qc-rescue-deals', accountId, pipelineId],
    queryFn: () => qcApi.listRescueDeals(accountId, pipelineId),
  });

  if (isLoading) {
    return (
      <div className="py-16 flex items-center justify-center gap-3 text-slate-500">
        <Loader2 size={24} className="animate-spin text-rose-600" />
        <span>{lang === 'uz' ? 'Qutqarilishi mumkin bo\'lgan bitimlar yuklanmoqda...' : 'Поиск сделок для спасения...'}</span>
      </div>
    );
  }

  if (!deals || deals.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center max-w-lg mx-auto my-8 shadow-xs">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
          <LifeBuoy size={28} />
        </div>
        <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 mb-1">
          {lang === 'uz' ? 'Hozircha anomaliyali bitimlar yo\'q' : 'Аномальных сливов не обнаружено'}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {lang === 'uz'
            ? 'Qoidabuzarliklar bilan "Muvaffaqiyatsiz"ga tushgan bitimlar bu yerda ko\'rinadi.'
            : 'Когда сделка будет закрыта в «Нереализовано» с грубыми нарушениями регламента менеджера, она появится здесь с готовым сценарием спасения.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle size={20} className="text-rose-600 shrink-0 mt-0.5" />
        <div className="text-xs text-rose-900 dark:text-rose-200 leading-relaxed">
          <span className="font-bold block mb-0.5">
            {lang === 'uz' ? 'Diqqat ROP: Bu bitimlar xodim xatosi tufayli boy berilgan!' : 'Внимание РОПа: сделки, потерянные из-за ошибок менеджера'}
          </span>
          {lang === 'uz'
            ? 'Bu mijozlar xaridga tayyor bo\'lgan, biroq menejer reglamentni buzgan (narx aytmagan, qo\'ng\'iroq qilmagan, vazifa qo\'ymagan). Ularni boshqa menejerga berib qaytarish mumkin.'
            : 'Эти клиенты имели высокий интерес, но сделка была закрыта из-за грубых нарушений (менеджер не назвал цену, не перезвонил или завалил диалог). Рекомендуется передать их старшему менеджеру.'}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {deals.map((deal) => (
          <div
            key={deal.id}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs hover:border-rose-400 dark:hover:border-rose-600 transition-all space-y-3.5"
          >
            {/* Header: Lead Name, Price, Loss reason, Risk Score */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {deal.leadName}
                  </h4>
                  {deal.pipelineName && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {deal.pipelineName}
                    </span>
                  )}
                  {deal.lossReasonName && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/30">
                      {lang === 'uz' ? 'Rad sababi:' : 'Причина отказа:'} {deal.lossReasonName}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {deal.leadPrice !== null && deal.leadPrice !== undefined && (
                    <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center">
                      {deal.leadPrice.toLocaleString('ru-RU')} ₽
                    </span>
                  )}
                  {deal.managerName && (
                    <span className="flex items-center gap-1">
                      <User size={12} /> {deal.managerName}
                    </span>
                  )}
                  <span>
                    {lang === 'uz' ? 'Qo\'ng\'iroqlar:' : 'Звонков:'} {deal.callsCount}
                  </span>
                </div>
              </div>

              {/* Anomaly Risk Score Badge */}
              <div className="px-3 py-1.5 rounded-xl font-bold text-xs bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border border-rose-300 dark:border-rose-800/60 flex items-center gap-1.5 shrink-0">
                <AlertTriangle size={14} className="text-rose-600" />
                <span>{deal.totalRiskScore} {lang === 'uz' ? 'jarima bali' : 'штрафных очков'}</span>
              </div>
            </div>

            {/* Why it was lost */}
            {deal.rescueReason && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs text-slate-700 dark:text-slate-300 leading-relaxed border border-slate-200/80 dark:border-slate-800">
                <span className="font-semibold text-slate-900 dark:text-slate-100 block mb-0.5">
                  {lang === 'uz' ? 'Xatolik tahlili:' : 'Анализ причины слива:'}
                </span>
                {deal.rescueReason}
              </div>
            )}

            {/* AI Rescue Script */}
            {deal.aiRescueScript && (
              <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/30 rounded-xl text-xs text-blue-900 dark:text-blue-200 leading-relaxed border border-blue-200/80 dark:border-blue-900/40">
                <span className="font-bold text-blue-700 dark:text-blue-400 block mb-1">
                  💡 {lang === 'uz' ? 'Qutqarish bo\'yicha ROP tavsiyasi / Skript:' : 'Сценарий реанимации для РОПа:'}
                </span>
                {deal.aiRescueScript}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

