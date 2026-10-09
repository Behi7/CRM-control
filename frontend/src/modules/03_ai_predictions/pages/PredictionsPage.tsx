import { Sparkles, BrainCircuit, TrendingUp, ShieldAlert } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

export default function PredictionsPage() {
  const { lang } = useLanguage();

  return (
    <div className="p-4 lg:p-6 mx-auto max-w-[1920px] space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <BrainCircuit size={28} />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
              {lang === 'uz'
                ? 'AI-Prognozlar va Prediktiv tahlil (Modul 03)'
                : 'AI-Прогнозы и Предиктивная аналитика (Модуль 03)'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {lang === 'uz'
                ? 'Bitimlarni yopish, mijozlar ketishi va sotuv rejasini bajarishni bashorat qilish uchun mashinali o‘rganish'
                : 'Машинное обучение для прогнозирования закрытия сделок, оттока клиентов и выполнения плана продаж'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold">
              {lang === 'uz' ? 'Tushum prognozi (ML)' : 'Прогноз выручки (ML)'}
            </span>
            <TrendingUp size={18} className="text-indigo-500" />
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {lang === 'uz'
              ? 'Tarixiy sikllar va bosqichlar dinamikasi asosida ochiq bitimlarning yopilish ehtimoli prediktiv modeli.'
              : 'Предиктивная модель вероятности закрытия открытых сделок на основе исторических циклов и динамики этапов.'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold">
              {lang === 'uz' ? 'Chiqib ketish va xavflar skoringi' : 'Скоринг оттока и рисков'}
            </span>
            <ShieldAlert size={18} className="text-rose-500" />
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {lang === 'uz'
              ? 'Bitimlarning barbod bo‘lish xavfini avtomatik aniqlash va menejerlar uchun tavsiyalar.'
              : 'Автоматическое выявление сделок с высоким риском срыва и рекомендации менеджерам.'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold">
              {lang === 'uz' ? 'AI Tavsiyalari' : 'ИИ Рекомендации'}
            </span>
            <Sparkles size={18} className="text-amber-500" />
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {lang === 'uz'
              ? 'Bitimlarni yopishni tezlashtirish uchun keyingi qadamlar bo‘yicha intellektual maslahatlar.'
              : 'Интеллектуальные подсказки по следующим шагам для ускорения закрытия сделок.'}
          </div>
        </div>
      </div>
    </div>
  );
}
