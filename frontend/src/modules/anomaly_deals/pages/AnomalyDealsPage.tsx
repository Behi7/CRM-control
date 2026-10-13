import { AlertTriangle, ShieldAlert, Clock, DollarSign } from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';

export default function AnomalyDealsPage() {
  const { lang } = useLanguage();

  return (
    <div className="p-4 lg:p-6 mx-auto max-w-[1920px] space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <AlertTriangle size={28} />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
              {lang === 'uz'
                ? 'Anomal Bitimlar va Xatarlar Auditi'
                : 'Аномальные сделки и Аудит рисков'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {lang === 'uz'
                ? 'Bosqichlarda qotib qolgan bitimlar, cheklar anomaliyalari va rejasiz harakatlarni aniqlash'
                : 'Автоматическое выявление зависших сделок, выбросов по бюджетам и сделок без задач'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold">
              {lang === 'uz' ? 'Qotib qolgan bitimlar (>14 kun)' : 'Зависшие сделки (>14 дней)'}
            </span>
            <Clock size={18} className="text-amber-500" />
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {lang === 'uz'
              ? 'Bosqichda me’yordan ancha uzoq vaqt harakatsiz turgan va unutib qoldirilgan bitimlar tahlili.'
              : 'Выявление сделок, зависших на этапах без обновлений и движения дольше нормативного цикла.'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold">
              {lang === 'uz' ? 'Cheklar anomaliyalari' : 'Выбросы по чекам'}
            </span>
            <DollarSign size={18} className="text-rose-500" />
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {lang === 'uz'
              ? 'O‘rtacha chekdan keskin farq qiluvchi, asossiz nol yoki shubhali summali bitimlar auditi.'
              : 'Сделки с аномально крупным или нулевым бюджетом, требующие проверки антифрод и РОПа.'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold">
              {lang === 'uz' ? 'Vazifasiz bitimlar' : 'Сделки без задач'}
            </span>
            <ShieldAlert size={18} className="text-red-500" />
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {lang === 'uz'
              ? 'Keyingi qadam va belgilangan vazifalarsiz ochiq qoldirilgan bitimlarni nazorat qilish.'
              : 'Контроль открытых сделок без запланированного следующего шага или с просроченными делами.'}
          </div>
        </div>
      </div>
    </div>
  );
}
