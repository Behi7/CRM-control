import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, BrainCircuit, TrendingUp, ShieldAlert } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/auth/AuthContext';
import { adminApi, py2Api } from '@/api/client';

export default function PredictionsPage() {
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
  const isPredictionsDisabled = role === 'viewer' && currentAcc && (currentAcc.predictionsEnabled === false || currentAcc.aiEnabled === false);

  if (isPredictionsDisabled) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center mb-4">
            <BrainCircuit size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            {lang === 'uz' ? 'AI-Prognozlar moduli o‘chirilgan' : 'Модуль AI-Прогнозы отключен'}
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
