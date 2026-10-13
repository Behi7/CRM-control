import { Network, Workflow, GitFork, Activity, Layers } from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';

export default function CrmNodesPage() {
  const { lang } = useLanguage();

  return (
    <div className="p-4 lg:p-6 mx-auto max-w-[1920px] space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <Network size={28} />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
              {lang === 'uz'
                ? 'CRM Tugunlari va Jarayonlar Arxitekturasi'
                : 'CRM Ноды и Архитектура процессов'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {lang === 'uz'
                ? 'Voronkalar zanjiri, bosqichlar orasidagi oqimlar va ma’lumotlar uzatish tugunlari tahlili'
                : 'Анализ цепочек воронок, переходов между этапами и связей в узлах распределения лидов'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold">
              {lang === 'uz' ? 'Tugunlar grafigi (Node Graph)' : 'Граф узлов (Node Graph)'}
            </span>
            <GitFork size={18} className="text-teal-500" />
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {lang === 'uz'
              ? 'Kiruvchi lid manbalaridan boshlab bitim yopilishigacha bo‘lgan barcha bosqichlar zanjiri vizualizatsiyasi.'
              : 'Визуализация связей между этапами воронок от входящих лидов до успешного закрытия сделок.'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold">
              {lang === 'uz' ? 'Bosqichlar o‘tkazuvchanligi' : 'Пропускная способность этапов'}
            </span>
            <Activity size={18} className="text-blue-500" />
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {lang === 'uz'
              ? 'Tugunlar orasidagi oqim tezligi va tor joylar (bottleneck) monitoringi.'
              : 'Мониторинг скорости прохождения сделок через узлы и выявление "бутылочных горлышек".'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold">
              {lang === 'uz' ? 'Avtomatlashtirish qoidalari' : 'Триггеры и Автоматизации'}
            </span>
            <Workflow size={18} className="text-indigo-500" />
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {lang === 'uz'
              ? 'Tugunlar bo‘yicha avtomatik harakatlar va integratsiya triggerlarini boshqarish.'
              : 'Контроль автоматических действий и интеграционных хуков на узлах воронки.'}
          </div>
        </div>
      </div>
    </div>
  );
}

