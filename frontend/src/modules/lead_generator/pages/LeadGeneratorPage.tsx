import { Magnet, Target, Sparkles, UserPlus } from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';

export default function LeadGeneratorPage() {
  const { lang } = useLanguage();

  return (
    <div className="p-4 lg:p-6 mx-auto max-w-[1920px] space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Magnet size={28} />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
              {lang === 'uz'
                ? 'Lidlar Generatori va Trafik Atributsiyasi'
                : 'Генератор лидов и Атрибуция трафика'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {lang === 'uz'
                ? 'Kiruvchi kanallar tahlili, lidlar sifatini baholash va avtomatik jalb qilish vositalari'
                : 'Анализ каналов привлечения, умный скоринг качества лидов и инструменты лидогенерации'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold">
              {lang === 'uz' ? 'Trafik kanallari (UTM)' : 'Каналы трафика (UTM)'}
            </span>
            <Target size={18} className="text-violet-500" />
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {lang === 'uz'
              ? 'UTM teglari va reklama manbalari bo‘yicha konversiya va daromad atributsiyasi.'
              : 'Сквозная атрибуция источников, рекламных кампаний и UTM-меток с расчетом отдачи.'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold">
              {lang === 'uz' ? 'Lid sifati skoringi' : 'Скоринг качества лидов'}
            </span>
            <Sparkles size={18} className="text-amber-500" />
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {lang === 'uz'
              ? 'Kiruvchi murojaatlarning maqsadli mijozga mosligi va sotib olish ehtimolini AI baholash.'
              : 'Интеллектуальная оценка вероятности покупки и фильтрация нецелевого входящего трафика.'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold">
              {lang === 'uz' ? 'Avtomatik generatsiya' : 'Автогенерация и Захват'}
            </span>
            <UserPlus size={18} className="text-emerald-500" />
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {lang === 'uz'
              ? 'Veb-formalar, chat-botlar va integratsiyalar orqali sinov va doimiy lidlarni shakllantirish.'
              : 'Симуляция и инжекция тестовых лидов, настройка правил автоматического распределения.'}
          </div>
        </div>
      </div>
    </div>
  );
}
