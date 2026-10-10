import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api/client';
import { useLanguage } from '../i18n/LanguageContext';
import { Sparkles, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface AiSettingsModalProps {
  accountId: number;
  subdomain: string;
  onClose: () => void;
}

export default function AiSettingsModal({ accountId, subdomain, onClose }: AiSettingsModalProps) {
  const qc = useQueryClient();
  const { t, lang } = useLanguage();
  const [model, setModel] = useState('gemini-2.5-flash');
  const [token, setToken] = useState('');
  const [companyContext, setCompanyContext] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [qcEnabled, setQcEnabled] = useState(false);
  const [minDuration, setMinDuration] = useState(20);
  const [maxDuration, setMaxDuration] = useState(600);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [err, setErr] = useState('');

  const settingsQuery = useQuery({
    queryKey: ['ai-settings', accountId],
    queryFn: () => adminApi.getAiSettings(accountId),
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setModel(settingsQuery.data.aiModel || 'gemini-2.5-flash');
      setCompanyContext(settingsQuery.data.aiCompanyContext || '');
      setEnabled(settingsQuery.data.aiEnabled ?? false);
      setQcEnabled(settingsQuery.data.qcEnabled ?? false);
      setMinDuration(settingsQuery.data.qcMinDurationSec ?? 20);
      setMaxDuration(settingsQuery.data.qcMaxDurationSec ?? 600);
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
      };
      if (token.trim()) {
        payload.aiToken = token.trim();
      }
      await saveMut.mutateAsync(payload);
    } catch (e: any) {
      // Handled by onError
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-700 to-indigo-700 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-white/10 rounded-lg">
              <Sparkles size={18} className="text-yellow-300 fill-yellow-300" />
            </div>
            <div>
              <h2 className="font-bold text-lg">{t('ai_settings_title', { subdomain })}</h2>
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

        {/* Form Body */}
        {settingsQuery.isLoading ? (
          <div className="p-12 flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
            <Loader2 size={24} className="animate-spin text-purple-600" />
            <span>{t('loading')}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {err && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs rounded-lg flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{err}</span>
                </div>
              )}

              {saveSuccess && (
                <div className="p-3 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-300 text-xs rounded-lg flex items-center gap-2">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span>{t('ai_saved_success')}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                {/* Левая колонка: Основные настройки ИИ, Модель, Токен */}
                <div className="space-y-4">
                  {/* Toggle Enabled */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 block">
                        {t('ai_enable_label')}
                      </span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t('ai_enable_desc')}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>

                  {/* 1. Model field (Текстовый ввод) */}
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
                        className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-purple-700 dark:text-purple-300 cursor-pointer"
                        onClick={() => setModel('gemini-2.5-flash')}
                      >
                        gemini-2.5-flash
                      </code>{' '}
                      {lang === 'uz' ? 'yoki' : 'или'}{' '}
                      <code
                        className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-purple-700 dark:text-purple-300 cursor-pointer"
                        onClick={() => setModel('gemini-1.5-flash')}
                      >
                        gemini-1.5-flash
                      </code>
                    </p>
                  </div>

                  {/* 2. Token field */}
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
                      {token.trim() && (
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

                {/* Правая колонка: Контроль качества звонков и Контекст компании */}
                <div className="space-y-4">
                  {/* QC Call Settings */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <span>🎧</span> {lang === 'uz' ? 'Qo\'ng\'iroqlar nazorati (AI QC)' : 'Контроль качества звонков (AI QC)'}
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {lang === 'uz' ? 'Vorker orqali qo\'ng\'iroqlarni avtomatik tahlil qilish' : 'Автоматический аудит звонков воркером'}
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
                        <input
                          type="checkbox"
                          checked={qcEnabled}
                          onChange={(e) => setQcEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>

                    {qcEnabled && (
                      <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-slate-200 dark:border-slate-700/70">
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
                            {lang === 'uz' ? 'Toknlarni tejash' : 'Защита бюджета токенов'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Company Context field */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t('ai_context_label')}
                    </label>
                    <textarea
                      value={companyContext}
                      onChange={(e) => setCompanyContext(e.target.value)}
                      rows={3}
                      placeholder={t('ai_context_placeholder')}
                      className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-purple-500 focus:outline-none resize-y"
                    />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      {t('ai_context_hint')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions (Фиксированный футер) */}
            <div className="px-6 py-3.5 bg-slate-50/80 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex justify-end items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={saveMut.isPending}
                className="px-5 py-2 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
