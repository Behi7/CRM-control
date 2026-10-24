import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Network, Workflow, GitFork, Activity, Layers } from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useAuth } from '../../../auth/AuthContext';
import { adminApi, py2Api } from '../../../api/client';

export default function CrmNodesPage() {
  const { lang } = useLanguage();
  const { role } = useAuth();
  const navigate = useNavigate();
  const params = useParams<{ accountId?: string }>();
  const storedAccountId = Number(localStorage.getItem('active_account_id')) || 1;
  const accountId = params.accountId ? parseInt(params.accountId, 10) : storedAccountId;

  const accountsQuery = useQuery({
    queryKey: ['sidebar-accounts', role],
    queryFn: () => (role === 'admin' ? adminApi.listAccounts() : py2Api.accounts()),
    enabled: !!role,
    staleTime: 60_000,
  });
  const currentAcc = accountsQuery.data?.find((a: any) => a.id === accountId);
  const isCrmNodesDisabled = role === 'viewer' && currentAcc && (currentAcc.crmNodesEnabled === false || currentAcc.aiEnabled === false);

  if (isCrmNodesDisabled) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center mb-4">
            <Network size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            {lang === 'uz' ? 'CRM Tugunlari moduli o‘chirilgan' : 'Модуль CRM Ноды отключен'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            {lang === 'uz'
              ? 'Ushbu modul administrator tomonidan vaqtincha to‘xtatilgan.'
              : 'Этот модуль временно отключен администратором для данного аккаунта.'}
          </p>
          <button
            onClick={() => navigate('/bi')}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
          >
            {lang === 'uz' ? 'Tahlil bo‘limiga qaytish' : 'Перейти в Аналитику продаж'}
          </button>
        </div>
      </div>
    );
  }

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

