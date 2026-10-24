import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  AlertTriangle,
  ShieldCheck,
  Clock,
  PhoneCall,
  CheckCircle2,
  Copy,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Flame,
  FileSpreadsheet,
  ListTodo,
  RefreshCw,
  FileText
} from 'lucide-react';
import { anomalyDealsApi, DealForensicDetail } from '../api/anomalyDeals.api';
import { useLanguage } from '../../../i18n/LanguageContext';
import CallDetailModal from '../../quality_control/components/CallDetailModal';

interface DealForensicModalProps {
  accountId: number;
  leadId: number;
  onClose: () => void;
}

export default function DealForensicModal({
  accountId,
  leadId,
  onClose,
}: DealForensicModalProps) {
  const { lang } = useLanguage();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'verdict' | 'timeline' | 'calls' | 'tasks' | 'penalty'>('verdict');
  const [copied, setCopied] = useState(false);
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);

  const { data: detail, isLoading } = useQuery<DealForensicDetail>({
    queryKey: ['deal-forensic', accountId, leadId],
    queryFn: () => anomalyDealsApi.getForensic(accountId, leadId),
  });

  const reviewMutation = useMutation({
    mutationFn: (isReviewed: boolean) =>
      anomalyDealsApi.reviewLead(accountId, leadId, isReviewed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal-forensic', accountId, leadId] });
      queryClient.invalidateQueries({ queryKey: ['anomaly-deals-list', accountId] });
      queryClient.invalidateQueries({ queryKey: ['anomaly-stats', accountId] });
    },
  });

  const reanalyzeMutation = useMutation({
    mutationFn: () => anomalyDealsApi.reanalyzeLead(accountId, leadId),
    onSuccess: (updated) => {
      queryClient.setQueryData(['deal-forensic', accountId, leadId], updated);
      queryClient.invalidateQueries({ queryKey: ['anomaly-deals-list', accountId] });
      queryClient.invalidateQueries({ queryKey: ['anomaly-stats', accountId] });
    },
  });

  if (isLoading || !detail) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {lang === 'uz' ? 'Bitim auditi va AI xulosasi yuklanmoqda...' : 'Загрузка досье и формирование вердикта...'}
          </div>
        </div>
      </div>
    );
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('ru-RU').format(Math.round(val));
  };

  const copyVerdictToClipboard = () => {
    const text = `🔍 Аудит сделки: ${detail.leadName} (${formatCurrency(detail.price)} сум)
Менеджер: ${detail.responsibleUserName || 'Не назначен'}
Заявленная причина: ${detail.statedLossReason || 'Не указана'}
❌ Реальная причина: ${detail.realLossReason || '—'}
⚠️ Поворотный момент: ${detail.pivotPoint || '—'}
📋 Резюме: ${detail.forensicSummary || '—'}
💡 Рекомендация РОПу: ${detail.ropRecommendation || '—'}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-rose-600 bg-rose-500/10 border-rose-500/20';
    if (score >= 50) return 'text-amber-600 bg-amber-500/10 border-amber-500/20';
    return 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-2 sm:p-4 overflow-hidden">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-5xl w-full h-[92vh] max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${getScoreColor(detail.anomalyScore)}`}>
                {detail.anomalyScore}% {lang === 'uz' ? 'Anomaliya indeksi' : 'Индекс аномальности'}
              </span>

              {detail.managerFault === 'high' && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300">
                  {lang === 'uz' ? 'Xodim aybi: Yuqori' : 'Вина менеджера: Высокая'}
                </span>
              )}
              {detail.managerFault === 'medium' && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                  {lang === 'uz' ? 'Xodim aybi: Qisman' : 'Вина менеджера: Частичная'}
                </span>
              )}
              {detail.managerFault === 'none' && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                  {lang === 'uz' ? 'Oqlangan (Aybi yo‘q)' : 'Менеджер оправдан (Регламент соблюден)'}
                </span>
              )}
            </div>

            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-1">
              {detail.leadName}
            </h2>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {formatCurrency(detail.price)}
              </span>
              <span>•</span>
              <span>
                {lang === 'uz' ? 'Mas’ul:' : 'Менеджер:'} <b>{detail.responsibleUserName || '—'}</b>
              </span>
              <span>•</span>
              <span>
                {lang === 'uz' ? 'Voronka:' : 'Воронка:'} <b>{detail.pipelineName || '—'}</b>
              </span>
              {detail.auditedAt && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <Clock size={12} className="text-violet-500" />
                    <span>
                      {lang === 'uz' ? 'Tahlil vaqti:' : 'Проанализирована:'}{' '}
                      <b className="text-slate-700 dark:text-slate-300">
                        {new Date(detail.auditedAt).toLocaleString(lang === 'uz' ? 'uz-UZ' : 'ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </b>
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => reanalyzeMutation.mutate()}
              disabled={reanalyzeMutation.isPending}
              title={lang === 'uz' ? 'Qayta tekshirish' : 'Перепроверить анализ'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className={reanalyzeMutation.isPending ? 'animate-spin text-violet-600' : ''} />
              <span className="hidden sm:inline">
                {reanalyzeMutation.isPending
                  ? (lang === 'uz' ? 'Tahlil qilinmoqda...' : 'Анализирую...')
                  : (lang === 'uz' ? 'Qayta tekshirish' : 'Обновить анализ')}
              </span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Навигация по классам (вкладкам) */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 bg-slate-50/50 dark:bg-slate-800/30">
          <button
            onClick={() => setActiveTab('verdict')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'verdict'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles size={14} />
            <span>{lang === 'uz' ? 'AI Xulosasi' : 'Вердикт ИИ'}</span>
          </button>

          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'timeline'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Clock size={14} />
            <span>{lang === 'uz' ? 'Bosqichlar xronologiyasi' : 'Хронология воронки'}</span>
          </button>

          <button
            onClick={() => setActiveTab('calls')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'calls'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <PhoneCall size={14} />
            <span>{lang === 'uz' ? 'Qo‘ng‘iroqlar nazorati' : 'Звонки и Регламент QC'}</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'calls'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {detail.calls.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'tasks'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <ListTodo size={14} />
            <span>{lang === 'uz' ? 'Vazifalar intizomi' : 'Дисциплина задач'}</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'tasks'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {(detail.tasks || []).length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('penalty')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'penalty'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <FileSpreadsheet size={14} />
            <span>{lang === 'uz' ? 'Jarima vedomosti' : 'Штрафная ведомость'}</span>
          </button>
        </div>

        {/* Контент модалки */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Вкладка 1: Вердикт ИИ */}
          {activeTab === 'verdict' && (
            <div className="space-y-4">
              {/* Контраст причин */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    {lang === 'uz' ? 'Xodim ko‘rsatgan vaj (AmoCRM)' : 'Отмазка менеджера'}
                  </div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-1">
                    «{detail.statedLossReason || (lang === 'uz' ? 'Sabab yozilmagan' : 'Причина не указана')}»
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40">
                  <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Flame size={14} />
                    <span>{lang === 'uz' ? 'AI aniqlagan haqiqat' : 'Реальная причина срыва'}</span>
                  </div>
                  <div className="text-sm font-bold text-rose-700 dark:text-rose-300 mt-1">
                    {detail.realLossReason || '—'}
                  </div>
                </div>
              </div>

              {/* Поворотный момент */}
              {detail.pivotPoint && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
                  <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle size={14} />
                    <span>{lang === 'uz' ? 'Bitim boy berilgan burilish nuqtasi' : 'Точка невозврата (Pivot point)'}</span>
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                    {detail.pivotPoint}
                  </div>
                </div>
              )}

              {/* Резюме следователя */}
              {detail.forensicSummary && (
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    {lang === 'uz' ? 'Tergov xulosasi (Forensic Summary)' : 'Заключение расследования для РОПа'}
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                    {detail.forensicSummary}
                  </p>
                </div>
              )}

              {/* Рекомендация РОПу */}
              {detail.ropRecommendation && (
                <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40">
                  <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck size={14} />
                    <span>{lang === 'uz' ? 'ROP uchun tavsiya' : 'Управленческое решение для РОПа'}</span>
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-300 mt-1 font-medium leading-relaxed">
                    {detail.ropRecommendation}
                  </div>
                </div>
              )}

              {/* Блок дисциплины задач */}
              {detail.scoreBreakdown?.tasks_metrics && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-xl ${
                      detail.scoreBreakdown.tasks_metrics.tasks_idle_percent > 50
                        ? 'bg-rose-500/10 text-rose-600'
                        : detail.scoreBreakdown.tasks_metrics.tasks_idle_percent > 20
                        ? 'bg-amber-500/10 text-amber-600'
                        : 'bg-emerald-500/10 text-emerald-600'
                    }`}>
                      <ListTodo size={18} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {lang === 'uz' ? 'Vazifalar intizomi:' : 'Дисциплина задач:'}{' '}
                        <span className={
                          detail.scoreBreakdown.tasks_metrics.tasks_idle_percent > 50
                            ? 'text-rose-600 dark:text-rose-400'
                            : detail.scoreBreakdown.tasks_metrics.tasks_idle_percent > 20
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }>
                          {detail.scoreBreakdown.tasks_metrics.tasks_idle_percent}% {lang === 'uz' ? 'vazifasiz vaqt' : 'времени без задач'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {detail.scoreBreakdown.tasks_metrics.tasks_count === 0
                          ? (lang === 'uz' ? 'Birorta ham vazifa qo‘yilmagan' : 'За всю жизнь сделки не поставлено ни одной задачи')
                          : `${lang === 'uz' ? 'Jami vazifalar:' : 'Всего задач:'} ${detail.scoreBreakdown.tasks_metrics.tasks_count} • ${lang === 'uz' ? 'Maksimal uzilish:' : 'Макс. простой без задач:'} ${detail.scoreBreakdown.tasks_metrics.max_idle_gap_hours} ч.`}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveTab('tasks')}
                    className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>{lang === 'uz' ? 'Vazifalarni ko‘rish' : 'Смотреть задачи'}</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Вкладка 2: Хронология воронки */}
          {activeTab === 'timeline' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 mb-2">
                {lang === 'uz'
                  ? 'Har bir bosqichda turgan vaqt va muvaffaqiyatli bitimlarning o‘rtacha me’yori (benchmarking):'
                  : 'Сравнение времени прохождения каждого этапа с медианой успешных сделок (SLA воронки):'}
              </div>

              {detail.stagesTimeline.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  {lang === 'uz' ? 'Bosqichlar tarixi yo‘q' : 'История этапов отсутствует'}
                </div>
              ) : (
                <div className="space-y-2">
                  {detail.stagesTimeline.map((st, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-2xl border flex items-center justify-between text-xs transition-colors ${
                        st.isStagnant
                          ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40'
                          : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-[10px] text-slate-700 dark:text-slate-200 shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            {st.stageName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {st.enteredAt ? new Date(st.enteredAt).toLocaleString('ru-RU') : '—'}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <span className={`font-bold ${st.isStagnant ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                            {st.durationHours} ч.
                          </span>
                          <span className="text-slate-400 text-[10px]">
                            (норма: {st.benchmarkHours} ч.)
                          </span>
                        </div>
                        {st.isStagnant && (
                          <span className="inline-block px-2 py-0.5 mt-0.5 rounded-full bg-rose-200 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 text-[10px] font-bold">
                            ⚠️ Превышение нормы
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Вкладка 3: Звонки и Регламент QC */}
          {activeTab === 'calls' && (
            <div className="space-y-3">
              {detail.calls.length === 0 ? (
                <div className="text-center py-10 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl p-6">
                  <PhoneCall size={32} className="mx-auto text-rose-500 mb-2" />
                  <div className="text-sm font-bold text-rose-700 dark:text-rose-300">
                    {lang === 'uz' ? 'Hech qanday qo‘ng‘iroq qilinmagan!' : 'По сделке нет ни одного звонка!'}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-md mx-auto">
                    {lang === 'uz'
                      ? 'Menejer mijoz bilan bog‘lanishga harakat ham qilmasdan bitimni rad etilganlarga o‘tkazgan.'
                      : 'Менеджер закрыл сделку в нереализовано, даже не попытавшись позвонить клиенту.'}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {detail.calls.map((c) => (
                    <div
                      key={c.id}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <PhoneCall size={16} className="text-slate-500" />
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {new Date(c.callDate).toLocaleString('ru-RU')}
                          </span>
                          <span className="text-slate-400">({c.durationSeconds} сек)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.qcScore !== null && c.qcScore !== undefined && (
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                c.qcScore >= 70
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : c.qcScore >= 50
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-rose-100 text-rose-700'
                              }`}
                            >
                              QC: {c.qcScore}%
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedCallId(c.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-violet-700 bg-violet-100 hover:bg-violet-200 dark:text-violet-300 dark:bg-violet-950/60 dark:hover:bg-violet-900/60 rounded-lg transition-colors cursor-pointer"
                            title={lang === 'uz' ? 'Qo‘ng‘iroq tahlili va yozuvini ko‘rish' : 'Посмотреть анализ и запись звонка'}
                          >
                            <FileText size={12} />
                            <span>{lang === 'uz' ? 'Tahlil kartasi' : 'Детали анализа'}</span>
                          </button>
                        </div>
                      </div>

                      {c.summary && (
                        <div className="text-slate-600 dark:text-slate-300 italic">
                          «{c.summary}»
                        </div>
                      )}

                      {c.errorsList && c.errorsList.length > 0 && (
                        <div className="space-y-1 mt-2">
                          <div className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 uppercase">
                            Ошибки регламента:
                          </div>
                          {c.errorsList.map((err, i) => (
                            <div key={i} className="text-rose-700 dark:text-rose-300 flex items-start gap-1">
                              <span>•</span>
                              <span>{err}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Вкладка 4: Дисциплина задач */}
          {activeTab === 'tasks' && (
            <div className="space-y-4">
              {/* Summary banner */}
              {detail.scoreBreakdown?.tasks_metrics && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div>
                    <div className="text-[11px] text-slate-500">{lang === 'uz' ? 'Jami vazifalar' : 'Всего задач'}</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                      {detail.scoreBreakdown.tasks_metrics.tasks_count}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">{lang === 'uz' ? 'Vazifasiz vaqt' : 'Время без задач'}</div>
                    <div className={`text-base font-bold mt-0.5 ${
                      detail.scoreBreakdown.tasks_metrics.tasks_idle_percent > 50
                        ? 'text-rose-600'
                        : detail.scoreBreakdown.tasks_metrics.tasks_idle_percent > 20
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }`}>
                      {detail.scoreBreakdown.tasks_metrics.tasks_idle_percent}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">{lang === 'uz' ? 'Maks. uzilish' : 'Макс. простой'}</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                      {detail.scoreBreakdown.tasks_metrics.max_idle_gap_hours} ч.
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">{lang === 'uz' ? 'Muddati o‘tgan' : 'Просрочено'}</div>
                    <div className={`text-base font-bold mt-0.5 ${
                      detail.scoreBreakdown.tasks_metrics.overdue_tasks_count > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'
                    }`}>
                      {detail.scoreBreakdown.tasks_metrics.overdue_tasks_count}
                    </div>
                  </div>
                </div>
              )}

              {/* List of tasks */}
              {(!detail.tasks || detail.tasks.length === 0) ? (
                <div className="p-8 text-center bg-rose-50 dark:bg-rose-950/20 rounded-2xl border border-rose-200 dark:border-rose-900/40 space-y-2">
                  <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-600 flex items-center justify-center mx-auto">
                    <AlertTriangle size={20} />
                  </div>
                  <div className="text-sm font-bold text-rose-800 dark:text-rose-200">
                    {lang === 'uz' ? 'Ushbu bitimda birorta ham vazifa bo‘lmagan' : 'По сделке не зафиксировано ни одной задачи'}
                  </div>
                  <p className="text-xs text-rose-600 dark:text-rose-400 max-w-md mx-auto">
                    {lang === 'uz'
                      ? 'Xodim rejalashtirilgan keyingi qadamsiz bitimni tashlab ketgan. Bu tizimli sotuv qoidalarining qo‘pol buzilishidir.'
                      : 'Менеджер оставил сделку в воронке без единого запланированного следующего шага. Лид был брошен в свободное падение.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {detail.tasks.map((task, idx) => (
                    <div
                      key={task.id || idx}
                      className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex items-start justify-between gap-3 shadow-xs"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-xl mt-0.5 ${
                          task.isCompleted
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'bg-amber-500/10 text-amber-600'
                        }`}>
                          <CheckCircle2 size={16} />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {task.text || (lang === 'uz' ? 'Matnsiz vazifa' : 'Задача без описания')}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                            <span>
                              {lang === 'uz' ? 'Qo‘yilgan:' : 'Поставлена:'} {new Date(task.taskCreatedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                            {task.completeTill && (
                              <>
                                <span>•</span>
                                <span>
                                  {lang === 'uz' ? 'Muddat:' : 'Дедлайн:'} {new Date(task.completeTill).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                                </span>
                              </>
                            )}
                            {task.taskClosedAt && (
                              <>
                                <span>•</span>
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {lang === 'uz' ? 'Bajarildi:' : 'Закрыта:'} {new Date(task.taskClosedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        task.isCompleted
                          ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                      }`}>
                        {task.isCompleted
                          ? (lang === 'uz' ? 'Bajarilgan' : 'Выполнена')
                          : (lang === 'uz' ? 'Ochiq' : 'В работе')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Вкладка 5: Штрафная ведомость */}
          {activeTab === 'penalty' && (
            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  {lang === 'uz' ? 'Jarima hisob-kitobi (Audit formulasi)' : 'Расчет штрафных баллов'}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-400">
                      Штраф за зависание на этапах воронки
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      +{detail.scoreBreakdown?.time_penalty || 0}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-400">
                      Штраф по звонкам и регламенту QC
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      +{detail.scoreBreakdown?.calls_penalty || 0}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-400">
                      Штраф за срез обязательных этапов (Skip)
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      +{detail.scoreBreakdown?.skips_penalty || 0}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-400">
                      Штраф за простой без задач ({detail.scoreBreakdown?.tasks_metrics?.tasks_idle_percent ?? 0}% жизни сделки)
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      +{detail.scoreBreakdown?.tasks_penalty || 0}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-400">
                      Штраф за крупный чек при наличии косяков
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      +{detail.scoreBreakdown?.price_penalty || 0}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-2 font-bold text-sm">
                    <span className="text-slate-900 dark:text-white">Итоговый балл аномальности:</span>
                    <span className="text-violet-600 dark:text-violet-400 text-base">
                      {detail.anomalyScore}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer с кнопками */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={copyVerdictToClipboard}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
            >
              {copied ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />}
              <span>{copied ? 'Скопировано!' : 'Копировать для планерки'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => reviewMutation.mutate(!detail.isReviewed)}
              disabled={reviewMutation.isPending}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                detail.isReviewed
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
              }`}
            >
              <CheckCircle2 size={16} />
              <span>
                {detail.isReviewed
                  ? (lang === 'uz' ? 'Qayta ko‘rib chiqish' : 'Вернуть в неразобранные')
                  : (lang === 'uz' ? 'Ko‘rib chiqildi deb belgilash' : 'Пометить как разобранное РОПом')}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Call Detail Modal */}
      {selectedCallId && (
        <CallDetailModal
          accountId={accountId}
          callId={selectedCallId}
          onClose={() => setSelectedCallId(null)}
        />
      )}
    </div>
  );
}

