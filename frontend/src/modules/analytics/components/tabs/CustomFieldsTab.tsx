import { useState } from 'react';
import { fmtCount, fmtMoney } from '../../types';
import { useLanguage } from '../../../../i18n/LanguageContext';

interface CustomFieldsTabProps {
  customFieldsLists: any[];
}

export default function CustomFieldsTab({ customFieldsLists = [] }: CustomFieldsTabProps) {
  const { lang } = useLanguage();
  const [selectedCustomFieldName, setSelectedCustomFieldName] = useState<string>('ALL');

  const listGroups: any[] = customFieldsLists || [];
  const visibleGroups =
    selectedCustomFieldName === 'ALL'
      ? listGroups
      : listGroups.filter((g: any) => g.fieldName === selectedCustomFieldName);

  return (
    <div className="space-y-5">
      {/* Filter header card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {lang === 'uz'
                ? 'AmoCRM bitimlarining ro‘yxatli maxsus maydonlari bo‘yicha tahlil'
                : 'Аналитика по списочным кастомным полям сделок AmoCRM'}
            </h3>
          </div>
          <span className="text-xs px-3 py-1 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold border border-indigo-500/20 whitespace-nowrap">
            {lang === 'uz' ? 'Ro‘yxatli maydonlar' : 'Списочных полей'}: {listGroups.length}
          </span>
        </div>

        {/* Pill buttons for selecting a list field */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setSelectedCustomFieldName('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              selectedCustomFieldName === 'ALL'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {lang === 'uz' ? 'Barcha ro‘yxatli maydonlar' : 'Все списочные поля'} ({listGroups.length})
          </button>
          {listGroups.map((g: any) => (
            <button
              key={g.fieldName}
              type="button"
              onClick={() => setSelectedCustomFieldName(g.fieldName)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                selectedCustomFieldName === g.fieldName
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {g.fieldName} <span className="opacity-75">({fmtCount(g.totalFilled)})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Analytical card per list field */}
      {visibleGroups.map((group: any) => (
        <div
          key={group.fieldName}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
        >
          <div className="px-5 py-3.5 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold">
                {group.fieldName}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'uz' ? 'Tanlov variantlari' : 'Вариантов выбора'}: <strong className="text-slate-800 dark:text-slate-200">{group.optionsCount}</strong>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="text-slate-600 dark:text-slate-300">
                {lang === 'uz' ? 'To‘ldirilgan bitimlar' : 'Заполнено сделок'}: <strong className="text-slate-900 dark:text-white">{fmtCount(group.totalFilled)}</strong>
              </span>
              <span className="text-emerald-600 dark:text-emerald-400">
                {lang === 'uz' ? 'Sotuvlar (Won)' : 'Продаж (Won)'}: <strong>{fmtCount(group.wonFilled)}</strong>
              </span>
              <span className="text-rose-500">
                {lang === 'uz' ? 'Rad (Lost)' : 'Отказ (Lost)'}: <strong>{fmtCount(group.lostFilled)}</strong>
              </span>
              <span className="text-blue-500">
                {lang === 'uz' ? 'Ishda' : 'В работе'}: <strong>{fmtCount(group.openFilled)}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                {lang === 'uz' ? 'Maydonning Win Rate ko‘rsatkichi' : 'Win Rate поля'}: {group.winRate}%
              </span>
              <span className="font-bold text-slate-900 dark:text-white">
                {lang === 'uz' ? 'Tushum' : 'Выручка'}: {fmtMoney(group.wonValue)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[480px]">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left">{lang === 'uz' ? 'Tanlov varianti' : 'Выборка (Вариант выбора)'}</th>
                  <th className="p-3 text-right">{lang === 'uz' ? 'Bitimlar' : 'Сделок'}</th>
                  <th className="p-3 text-right">{lang === 'uz' ? 'Maydondagi ulush %' : 'Доля в поле %'}</th>
                  <th className="p-3 text-right">{lang === 'uz' ? 'Sotuv (Won)' : 'Продаж (Won)'}</th>
                  <th className="p-3 text-right">{lang === 'uz' ? 'Rad (Lost)' : 'Отказ (Lost)'}</th>
                  <th className="p-3 text-right">{lang === 'uz' ? 'Ishda' : 'В работе'}</th>
                  <th className="p-3 text-center">{lang === 'uz' ? 'Tuzilma (Won / Open / Lost %)' : 'Структура (Won / Open / Lost %)'}</th>
                  <th className="p-3 text-right">Win Rate %</th>
                  <th className="p-3 text-right">{lang === 'uz' ? 'Tushum' : 'Выручка'}</th>
                  <th className="p-3 text-right">{lang === 'uz' ? 'O‘rtacha chek' : 'Средний чек'}</th>
                  <th className="p-3 text-right">{lang === 'uz' ? 'Ishda (Summa)' : 'В работе (Сумма)'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(group.options || []).map((opt: any, idx: number) => (
                  <tr key={`${group.fieldName}-${opt.fieldValue}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">{opt.fieldValue}</td>
                    <td className="p-3 text-right font-bold">{fmtCount(opt.totalLeads)}</td>
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center gap-2 justify-end">
                        <div className="w-16 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-indigo-500 h-full rounded-full"
                            style={{ width: `${Math.min(100, opt.shareOfField || 0)}%` }}
                          />
                        </div>
                        <span className="font-semibold w-10 text-right">{opt.shareOfField || 0}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                      {fmtCount(opt.wonLeads)}
                    </td>
                    <td className="p-3 text-right text-rose-500">{fmtCount(opt.lostLeads)}</td>
                    <td className="p-3 text-right text-blue-500">{fmtCount(opt.openLeads)}</td>
                    <td className="p-3">
                      {(() => {
                        const tot = Math.max(opt.totalLeads || 0, 1);
                        const wP = Math.round(((opt.wonLeads || 0) / tot) * 100);
                        const oP = Math.round(((opt.openLeads || 0) / tot) * 100);
                        const lP = Math.max(0, 100 - wP - oP);
                        return (
                          <div className="flex items-center gap-1.5 justify-center">
                            <div
                              className="w-24 h-2 rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-700"
                              title={`Won: ${wP}% | Open: ${oP}% | Lost: ${lP}%`}
                            >
                              <div style={{ width: `${wP}%` }} className="bg-emerald-500 h-full" />
                              <div style={{ width: `${oP}%` }} className="bg-blue-500 h-full" />
                              <div style={{ width: `${lP}%` }} className="bg-rose-500 h-full" />
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-3 text-right">
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          opt.winRate >= 20
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : opt.winRate >= 10
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {opt.winRate}%
                      </span>
                    </td>
                    <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {fmtMoney(opt.revenue ?? opt.wonValue ?? 0)}
                    </td>
                    <td className="p-3 text-right text-slate-600 dark:text-slate-300">
                      {fmtMoney(opt.avgCheck ?? 0)}
                    </td>
                    <td className="p-3 text-right text-blue-600 dark:text-blue-400 font-medium">
                      {fmtMoney(opt.openValue ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {visibleGroups.length === 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-400">
          {lang === 'uz'
            ? 'Tanlangan davr uchun ro‘yxatli maydonlar bo‘yicha ma’lumot yo‘q'
            : 'Нет данных по списочным кастомным полям за выбранный период'}
        </div>
      )}
    </div>
  );
}
