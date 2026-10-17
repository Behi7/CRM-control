import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, analyticsApi } from '../api/client';
import { useLanguage } from '../i18n/LanguageContext';
import {
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Headphones,
  FileCheck,
  RotateCcw,
  GitBranch,
  AlertTriangle,
  ShieldCheck,
  Check,
  Plus,
  Trash2,
  Filter,
} from 'lucide-react';
import RulesSettingsTab from '../modules/quality_control/components/RulesSettingsTab';

interface AiSettingsModalProps {
  accountId: number;
  subdomain?: string;
  onClose: () => void;
  initialTab?: 'general' | 'qc' | 'rules' | 'anomalies';
}

const DEFAULT_QC_SYSTEM_PROMPT = `Ты — объективный и внимательный эксперт службы контроля качества звонков отдела продаж.
Твоя задача — внимательно прослушать аудиозапись разговора менеджера с клиентом, провести глубокий аудит соблюдения законов регламента, зафиксировать точные таймкоды, цитаты ошибок и составить готовую речевую подсказку (как следовало сказать).

Критерии проверки:
- Твоя задача — объективно зафиксировать факт по каждому закону: соблюден (passed: true) или нарушен (passed: false). Никаких баллов и оценок рассчитывать не нужно.
- Будь строгим, но справедливым. Замечай перебивания, уход от прямых ответов по ценам, пассивность.
- Обязательно найди узкое место (bottleneck) — момент, где клиент потерял интерес или засомневался.
- Для каждого несоблюденного правила предложи эталонный вариант ответа менеджера (improvement).`;

const DEFAULT_ANOMALY_SYSTEM_PROMPT = `Ты — беспристрастный и опытный цифровой аудитор (следователь) отдела продаж для РОПа.
Твоя задача — изучить досье слитой сделки из AmoCRM и вскрыть ПРАВДУ: кто виноват в потере сделки (клиент или менеджер) и почему.

ПРАВИЛА АРБИТРАЖА:
1. Если менеджер указал отмазку ('Недозвон', 'Клиент передумал', 'Дорого'), но по факту не звонил или сделка неделями висела без движения — прямо разоблачи отмазку.
2. ЕСЛИ по результатам Контроля Качества (QC) видно, что в разговоре менеджер допустил критические ошибки, проигнорировал возражения клиента или упустил инициативу — зафиксируй вину менеджера, даже если позже совершались звонки по уже потерянному клиенту.
3. ЕСЛИ клиент объективно отказался сам (нет потребности, уехал, форс-мажор) или действительно не выходил на связь при добросовестных попытках менеджера (звонки в разные дни без нарушений регламента) — встань на защиту менеджера и сними с него вину.
4. ОБРАТИ ВНИМАНИЕ НА ДИСЦИПЛИНУ ЗАДАЧ (tasks_metrics): если сделка провела большую часть времени без задач (tasks_idle_percent > 50%), укажи это как причину утери контакта и халатности менеджера.
5. Укажи конкретную поворотную точку (pivot_point) — где и когда сделка фактически умерла.
6. Дай РОПу четкую рекомендацию: стоит ли попытаться спасти лида другим менеджером или списать в архив.`;

export default function AiSettingsModal({
  accountId,
  subdomain = 'amoCRM',
  onClose,
  initialTab = 'general',
}: AiSettingsModalProps) {
  const qc = useQueryClient();
  const { t, lang } = useLanguage();

  const [activeTab, setActiveTab] = useState<'general' | 'qc' | 'rules' | 'anomalies'>(initialTab);

  // General AI settings
  const [model, setModel] = useState('gemini-2.5-flash');
  const [token, setToken] = useState('');
  const [companyContext, setCompanyContext] = useState('');
  const [enabled, setEnabled] = useState(false);

  // QC settings
  const [qcEnabled, setQcEnabled] = useState(false);
  const [minDuration, setMinDuration] = useState(20);
  const [maxDuration, setMaxDuration] = useState(600);
  const [qcSystemPrompt, setQcSystemPrompt] = useState('');
  const [disabledPipelineIds, setDisabledPipelineIds] = useState<number[]>([]);

  // Anomaly Deals settings
  const [lossReasonFieldId, setLossReasonFieldId] = useState<string>('');
  const [ignoredReasons, setIgnoredReasons] = useState<string[]>([]);
  const [customReasonInput, setCustomReasonInput] = useState<string>('');
  const [anomalySystemPrompt, setAnomalySystemPrompt] = useState<string>('');

  // Status & tests
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [err, setErr] = useState('');

  const settingsQuery = useQuery({
    queryKey: ['ai-settings', accountId],
    queryFn: () => adminApi.getAiSettings(accountId),
  });

  const pipelinesQuery = useQuery({
    queryKey: ['pipelines', accountId],
    queryFn: () => analyticsApi.pipelines(accountId),
    enabled: !!accountId,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setModel(settingsQuery.data.aiModel || 'gemini-2.5-flash');
      setCompanyContext(settingsQuery.data.aiCompanyContext || '');
      setEnabled(settingsQuery.data.aiEnabled ?? false);
      setQcEnabled(settingsQuery.data.qcEnabled ?? false);
      setMinDuration(settingsQuery.data.qcMinDurationSec ?? 20);
      setMaxDuration(settingsQuery.data.qcMaxDurationSec ?? 600);
      setQcSystemPrompt(settingsQuery.data.qcSystemPrompt || '');
      setDisabledPipelineIds(settingsQuery.data.qcDisabledPipelineIds || []);

      // Anomaly settings
      const savedFieldId = settingsQuery.data.anomalyLossReasonFieldId || '';
      setLossReasonFieldId(savedFieldId);
      setIgnoredReasons(settingsQuery.data.anomalyIgnoredReasons || []);
      let promptVal = settingsQuery.data.anomalySystemPrompt || '';
      if (promptVal.includes('Верни ответ СТРОГО в формате JSON')) {
        promptVal = promptVal.split('Верни ответ СТРОГО в формате JSON')[0].trim();
      }
      setAnomalySystemPrompt(promptVal);

      // Auto-suggest rejection field if not set yet
      if (!savedFieldId && settingsQuery.data.customFields) {
        const candidate = settingsQuery.data.customFields.find((cf: any) => {
          const n = (cf.name || '').toLowerCase();
          return n.includes('rad') || n.includes('sabab') || n.includes('отказ') || n.includes('причин');
        });
        if (candidate) {
          setLossReasonFieldId(candidate.id);
        }
      }
    }
  }, [settingsQuery.data]);

  const saveMut = useMutation({
    mutationFn: (data: any) => adminApi.patchAiSettings(accountId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['ai-settings', accountId] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (e: any) => {
      setErr(e.message || (lang === 'uz' ? 'Saqlashda xatolik yuz berdi' : 'Ошибка сохранения'));
    },
  });

  const handleTest = async () => {
    if (!token && !settingsQuery.data?.hasToken) {
      setErr(lang === 'uz' ? 'Aloqani tekshirish uchun tokenni kiriting' : 'Введите токен для проверки соединения');
      return;
    }
    setErr('');
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await adminApi.testAi({
        model: model || 'gemini-2.5-flash',
        token: token,
      });
      setTestResult(res);
    } catch (e: any) {
      setTestResult({
        ok: false,
        message: e.message || (lang === 'uz' ? 'Aloqa tekshirishda xatolik' : 'Ошибка тестирования связи'),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleResetPrompt = () => {
    setQcSystemPrompt(DEFAULT_QC_SYSTEM_PROMPT);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const payload: any = {
        aiEnabled: enabled,
        aiModel: model.trim(),
        aiCompanyContext: companyContext.trim(),
        qcEnabled: qcEnabled,
        qcMinDurationSec: Number(minDuration) || 20,
        qcMaxDurationSec: Number(maxDuration) || 600,
        qcSystemPrompt: qcSystemPrompt.trim() ? qcSystemPrompt.trim() : null,
        qcDisabledPipelineIds: disabledPipelineIds,
        anomalyLossReasonFieldId: lossReasonFieldId || null,
        anomalyIgnoredReasons: ignoredReasons,
        anomalySystemPrompt: anomalySystemPrompt.trim() ? anomalySystemPrompt.trim() : null,
      };
      if (token.trim()) {
        payload.aiToken = token.trim();
      }
      await saveMut.mutateAsync(payload);
    } catch (e: any) {
      // Handled by onError
    }
  };

  const pipelines = pipelinesQuery.data?.items || [];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl xl:max-w-6xl h-[92vh] max-h-[880px] flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-700 to-indigo-700 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Sparkles size={20} className="text-yellow-300 fill-yellow-300" />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight">{t('ai_settings_title', { subdomain })}</h2>
              <p className="text-xs text-purple-200">{t('ai_settings_subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation Bar */}
        <div className="px-6 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'general'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles size={14} />
            <span>{t('ai_tab_general')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('qc')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'qc'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Headphones size={14} />
            <span>{t('ai_tab_qc')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'rules'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FileCheck size={14} />
            <span>{t('ai_tab_rules')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('anomalies')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'anomalies'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <AlertTriangle size={14} />
            <span>{t('ai_tab_anomalies')}</span>
          </button>
        </div>

        {/* Content Body */}
        {settingsQuery.isLoading ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
            <Loader2 size={24} className="animate-spin text-purple-600" />
            <span>{t('loading')}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {err && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs rounded-xl flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{err}</span>
                </div>
              )}

              {saveSuccess && (
                <div className="p-3 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-300 text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span>{t('ai_saved_success')}</span>
                </div>
              )}

              {/* TAB 1: GENERAL AI SETTINGS */}
              {activeTab === 'general' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <div className="space-y-4">
                    {/* Toggle Enabled */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                      <div>
                        <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 block">
                          {t('ai_enable_label')}
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {t('ai_enable_desc')}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        onClick={() => setEnabled(!enabled)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ml-3 ${
                          enabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Model field (Текстовый ввод) */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t('ai_model_label')}
                      </label>
                      <input
                        type="text"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="gemini-2.5-flash"
                        className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        required
                      />
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                        {lang === 'uz' ? 'Tavsiya etiladi:' : 'Рекомендуется:'}{' '}
                        <code
                          className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-purple-700 dark:text-purple-300 cursor-pointer font-medium"
                          onClick={() => setModel('gemini-2.5-flash')}
                        >
                          gemini-2.5-flash
                        </code>{' '}
                        {lang === 'uz' ? 'yoki' : 'или'}{' '}
                        <code
                          className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-purple-700 dark:text-purple-300 cursor-pointer font-medium"
                          onClick={() => setModel('gemini-1.5-flash')}
                        >
                          gemini-1.5-flash
                        </code>
                      </p>
                    </div>

                    {/* Token field */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {t('ai_token_label')}
                        </label>
                        {settingsQuery.data?.hasToken && (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <CheckCircle2 size={12} /> {lang === 'uz' ? 'Kalit saqlangan' : 'Ключ сохранен'}
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type="password"
                          value={token}
                          onChange={(e) => setToken(e.target.value)}
                          placeholder={settingsQuery.data?.hasToken ? t('ai_token_saved_hint') : t('ai_token_placeholder')}
                          className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        />
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">
                          {lang === 'uz' ? 'AES-256-GCM bilan shifrlanadi' : 'Шифруется по стандарту AES-256-GCM'}
                        </p>
                        {(token.trim() || settingsQuery.data?.hasToken) && (
                          <button
                            type="button"
                            onClick={handleTest}
                            disabled={isTesting}
                            className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            {isTesting ? <Loader2 size={12} className="animate-spin" /> : null}
                            {isTesting ? t('ai_testing') : t('ai_test_btn')}
                          </button>
                        )}
                      </div>

                      {testResult && (
                        <div
                          className={`mt-2 p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                            testResult.ok
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50'
                              : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50'
                          }`}
                        >
                          {testResult.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                          <span>{testResult.message}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Company Context field */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {t('ai_context_label')}
                    </label>
                    <textarea
                      value={companyContext}
                      onChange={(e) => setCompanyContext(e.target.value)}
                      rows={9}
                      placeholder={t('ai_context_placeholder')}
                      className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-purple-500 focus:outline-none resize-y"
                    />
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {t('ai_context_hint')}
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: CALL AUDIT & QC SYSTEM PROMPT */}
              {activeTab === 'qc' && (
                <div className="space-y-5">
                  {/* QC Toggle & Call duration settings */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <span>🎧</span> {lang === 'uz' ? 'Qo\'ng\'iroqlar auditi (AI QC)' : 'Автоматический аудит звонков (AI QC)'}
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {lang === 'uz' ? 'Vorker orqali yangi audio yozuvlarni muntazam tahlil qilish' : 'Фоновый анализ аудиозаписей звонков через воркер crm_sync'}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={qcEnabled}
                        onClick={() => setQcEnabled(!qcEnabled)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ml-3 ${
                          qcEnabled ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            qcEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {qcEnabled && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-200 dark:border-slate-700/70">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            {lang === 'uz' ? 'Min. davomiylik (sek)' : 'Мин. длительность (сек)'}
                          </label>
                          <input
                            type="number"
                            min={5}
                            max={3600}
                            value={minDuration}
                            onChange={(e) => setMinDuration(Number(e.target.value))}
                            className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-purple-500 focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400 mt-0.5 block">
                            {lang === 'uz' ? 'Qisqa qo\'ng\'iroqlar o\'tkaziladi' : 'Короткие звонки пропускаются'}
                          </span>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            {lang === 'uz' ? 'Maks. davomiylik (sek)' : 'Макс. длительность (сек)'}
                          </label>
                          <input
                            type="number"
                            min={30}
                            max={7200}
                            value={maxDuration}
                            onChange={(e) => setMaxDuration(Number(e.target.value))}
                            className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-purple-500 focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400 mt-0.5 block">
                            {lang === 'uz' ? 'Tokenlarni tejash' : 'Защита бюджета токенов'}
                          </span>
                        </div>
                      </div>
                    )}

                    {qcEnabled && (
                      <div className="pt-3.5 border-t border-slate-200 dark:border-slate-700/70 space-y-2.5">
                        <div>
                          <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <GitBranch size={14} className="text-purple-600 dark:text-purple-400" />
                            {lang === 'uz' ? 'Qo\'ng\'iroqlar tahlili uchun voronkalar' : 'Воронки для анализа диалогов'}
                          </span>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {lang === 'uz'
                              ? 'Kerakli voronkalarni yoqing yoki o\'chiring. O\'chirilgan voronkalardagi qo\'ng\'iroqlar tahlil qilinmaydi.'
                              : 'Включайте или отключайте анализ звонков для конкретных воронок продаж. Звонки по сделкам из отключенных воронок пропускаются.'}
                          </p>
                        </div>

                        {pipelines.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">
                            {pipelinesQuery.isLoading
                              ? (lang === 'uz' ? 'Voronkalar yuklanmoqda...' : 'Загрузка списка воронок...')
                              : (lang === 'uz' ? 'Voronkalar topilmadi' : 'Воронки не найдены')}
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                            {pipelines.map((pipe: any) => {
                              const isPipelineDisabled = disabledPipelineIds.includes(pipe.id);
                              const isPipeActive = !isPipelineDisabled;
                              return (
                                <div
                                  key={pipe.id}
                                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                                    isPipeActive
                                      ? 'bg-white dark:bg-slate-800/80 border-purple-200/70 dark:border-purple-900/40 shadow-xs'
                                      : 'bg-slate-100/70 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 opacity-60'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 pr-2">
                                    <span
                                      className={`w-2 h-2 rounded-full shrink-0 ${
                                        isPipeActive ? 'bg-emerald-500' : 'bg-slate-400'
                                      }`}
                                    />
                                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                                      {pipe.name}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={isPipeActive}
                                    onClick={() => {
                                      if (isPipeActive) {
                                        setDisabledPipelineIds((prev) =>
                                          prev.includes(pipe.id) ? prev : [...prev, pipe.id]
                                        );
                                      } else {
                                        setDisabledPipelineIds((prev) => prev.filter((id) => id !== pipe.id));
                                      }
                                    }}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                      isPipeActive ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-700'
                                    }`}
                                  >
                                    <span
                                      aria-hidden="true"
                                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                        isPipeActive ? 'translate-x-4' : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* System Prompt for Call Quality Control */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                          {t('ai_qc_system_prompt_label')}
                        </label>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          {t('ai_qc_system_prompt_desc')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetPrompt}
                        className="px-2.5 py-1 text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-lg border border-purple-200 dark:border-purple-800 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                      >
                        <RotateCcw size={12} />
                        <span>{t('ai_qc_system_prompt_reset')}</span>
                      </button>
                    </div>

                    <textarea
                      value={qcSystemPrompt}
                      onChange={(e) => setQcSystemPrompt(e.target.value)}
                      rows={12}
                      placeholder={DEFAULT_QC_SYSTEM_PROMPT}
                      className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs leading-relaxed bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none resize-y"
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: CHECKLIST RULES & PIPELINES */}
              {activeTab === 'rules' && (
                <div className="space-y-4">
                  {pipelinesQuery.isLoading ? (
                    <div className="py-12 flex items-center justify-center gap-2 text-slate-400">
                      <Loader2 size={20} className="animate-spin" />
                      <span>{t('loading')}</span>
                    </div>
                  ) : (
                    <RulesSettingsTab
                      accountId={accountId}
                      pipelines={pipelines}
                    />
                  )}
                </div>
              )}

              {/* TAB 4: ANOMALIES & LOSS REASONS */}
              {activeTab === 'anomalies' && (
                <div className="space-y-6">
                  {/* Card 1: Custom Field Selector */}
                  <div className="p-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <label className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <Filter size={16} className="text-purple-600 dark:text-purple-400" />
                          <span>{t('ai_anomalies_loss_field_label')}</span>
                        </label>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          {t('ai_anomalies_loss_field_desc')}
                        </p>
                      </div>
                      {lossReasonFieldId && (
                        <span className="px-2.5 py-1 text-[11px] font-semibold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 rounded-lg shrink-0 border border-purple-200 dark:border-purple-800/60">
                          ID: {lossReasonFieldId}
                        </span>
                      )}
                    </div>

                    <div className="pt-1">
                      <select
                        value={lossReasonFieldId}
                        onChange={(e) => setLossReasonFieldId(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      >
                        <option value="">{t('ai_anomalies_loss_field_native')}</option>
                        {(settingsQuery.data?.customFields || []).map((cf: any) => {
                          const isRecommended = ['rad', 'sabab', 'отказ', 'причин'].some((k) =>
                            (cf.name || '').toLowerCase().includes(k)
                          );
                          return (
                            <option key={cf.id} value={cf.id}>
                              {cf.name} {isRecommended ? `★ (${lang === 'uz' ? 'Tavsiya etiladi' : 'Рекомендуется'})` : ''} [ID: {cf.id}, {cf.fieldType}]
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  {/* Card 2: Ignored Technical Non-Deals / Enums Blacklist */}
                  <div className="p-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <label className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400" />
                          <span>{t('ai_anomalies_ignored_label')}</span>
                        </label>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          {t('ai_anomalies_ignored_desc')}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const curField = (settingsQuery.data?.customFields || []).find(
                              (cf: any) => String(cf.id) === String(lossReasonFieldId)
                            );
                            const enumsList: string[] = (curField?.enums || []).map((e: any) => e.value);
                            const typical = enumsList.filter((val) => {
                              const v = val.toLowerCase();
                              return ['dubl', 'дубл', 'sifat', 'нецелев', 'xodim', 'тест', 'adash', 'ошиб', 'spam'].some((k) =>
                                v.includes(k)
                              );
                            });
                            setIgnoredReasons(Array.from(new Set([...ignoredReasons, ...typical])));
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/50 hover:bg-purple-200 rounded-xl border border-purple-200 dark:border-purple-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Sparkles size={12} />
                          <span>{t('ai_anomalies_ignored_select_all')}</span>
                        </button>

                        {ignoredReasons.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setIgnoredReasons([])}
                            className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                          >
                            {t('ai_anomalies_ignored_clear')}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Enums List for Selected Field */}
                    {(() => {
                      const curField = (settingsQuery.data?.customFields || []).find(
                        (cf: any) => String(cf.id) === String(lossReasonFieldId)
                      );
                      const enumsList: string[] = (curField?.enums || []).map((e: any) => e.value);

                      if (enumsList.length === 0) {
                        return (
                          <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-3">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {t('ai_anomalies_ignored_empty')}
                            </p>
                            {/* Manual entry of custom reasons */}
                            <div className="flex items-center gap-2 max-w-md mx-auto">
                              <input
                                type="text"
                                value={customReasonInput}
                                onChange={(e) => setCustomReasonInput(e.target.value)}
                                placeholder={lang === 'uz' ? 'Yangi sabab nomi...' : 'Название причины (например, Дубль)...'}
                                className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (customReasonInput.trim() && !ignoredReasons.includes(customReasonInput.trim())) {
                                    setIgnoredReasons([...ignoredReasons, customReasonInput.trim()]);
                                    setCustomReasonInput('');
                                  }
                                }}
                                className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl transition-colors cursor-pointer"
                              >
                                {lang === 'uz' ? 'Qo‘shish' : 'Добавить'}
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {enumsList.map((val) => {
                              const isChecked = ignoredReasons.includes(val);
                              return (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => {
                                    setIgnoredReasons((prev) =>
                                      prev.includes(val) ? prev.filter((r) => r !== val) : [...prev, val]
                                    );
                                  }}
                                  className={`p-3 rounded-xl border text-left flex items-start justify-between gap-2 transition-all cursor-pointer ${
                                    isChecked
                                      ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/80 shadow-xs ring-1 ring-amber-400/30'
                                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700/70 hover:bg-slate-100/60 dark:hover:bg-slate-800/60'
                                  }`}
                                >
                                  <div className="space-y-1 min-w-0">
                                    <span
                                      className={`text-xs font-semibold block truncate ${
                                        isChecked ? 'text-amber-900 dark:text-amber-200' : 'text-slate-800 dark:text-slate-200'
                                      }`}
                                    >
                                      {val}
                                    </span>
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block">
                                      {isChecked
                                        ? (lang === 'uz' ? '✓ Istisno qilingan (jarimasiz)' : '✓ Исключен (без штрафа)')
                                        : (lang === 'uz' ? 'Standart tekshiruv' : 'Учитывается при аудите')}
                                    </span>
                                  </div>
                                  <div
                                    className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                      isChecked
                                        ? 'bg-amber-600 text-white'
                                        : 'border border-slate-300 dark:border-slate-600'
                                    }`}
                                  >
                                    {isChecked && <Check size={12} strokeWidth={3} />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Currently selected ignored tags summary */}
                    {ignoredReasons.length > 0 && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">
                          {lang === 'uz' ? 'Istisnolar:' : 'Исключено из вины менеджера:'}
                        </span>
                        {ignoredReasons.map((reason) => (
                          <span
                            key={reason}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/60"
                          >
                            <span>{reason}</span>
                            <button
                              type="button"
                              onClick={() => setIgnoredReasons((prev) => prev.filter((r) => r !== reason))}
                              className="text-amber-600 hover:text-amber-900 dark:hover:text-amber-100 cursor-pointer"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card 3: AI Forensic Investigator Prompt */}
                  <div className="p-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <label className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <Sparkles size={16} className="text-purple-600 dark:text-purple-400" />
                          <span>{lang === 'uz' ? 'Raqamli tergovchi prompti (Anomaliyalar)' : 'Промпт цифрового следователя (Аномалии)'}</span>
                        </label>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          {lang === 'uz'
                            ? 'Yo‘qotilgan bitimlarni tahlil qilish, menejer aybini aniqlash va xulosalar chiqarish qoidalarini sozlang.'
                            : 'Инструкции для нейросети по арбитражу слитых сделок, правилам определения вины и формированию рекомендаций РОПу.'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setAnomalySystemPrompt(DEFAULT_ANOMALY_SYSTEM_PROMPT)}
                        className="px-3 py-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/50 hover:bg-purple-200 rounded-xl border border-purple-200 dark:border-purple-800 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <RotateCcw size={12} />
                        <span>{lang === 'uz' ? 'Standart holatga qaytarish' : 'Сбросить на эталонный'}</span>
                      </button>
                    </div>

                    <div className="pt-1">
                      <textarea
                        rows={10}
                        value={anomalySystemPrompt}
                        onChange={(e) => setAnomalySystemPrompt(e.target.value)}
                        placeholder={DEFAULT_ANOMALY_SYSTEM_PROMPT}
                        className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                        {lang === 'uz'
                          ? 'Bo‘sh qoldirilsa, tizim standart etalon promptdan foydalanadi.'
                          : 'Если оставить пустым, будет использоваться проверенный системный промпт по умолчанию.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions (Фиксированный футер) */}
            <div className="px-6 py-3.5 bg-slate-50/80 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex justify-end items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={saveMut.isPending}
                className="px-5 py-2 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                <span>{saveMut.isPending ? t('ai_saving') : t('ai_save_btn')}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
