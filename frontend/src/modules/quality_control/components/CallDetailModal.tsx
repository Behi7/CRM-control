import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lightbulb,
  FileText,
  Volume2,
  Loader2,
} from 'lucide-react';
import { qcApi } from '../api/qcApi';
import { useLanguage } from '../../../i18n/LanguageContext';

interface CallDetailModalProps {
  accountId: number;
  callId: number;
  onClose: () => void;
}

export default function CallDetailModal({ accountId, callId, onClose }: CallDetailModalProps) {
  const { lang } = useLanguage();
  const [activeTab, setActiveTab] = useState<'verdict' | 'checklist'>('verdict');

  const { data: call, isLoading } = useQuery({
    queryKey: ['qc-call-detail', accountId, callId],
    queryFn: () => qcApi.getCallDetail(accountId, callId),
  });

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(lang === 'uz' ? 'uz-UZ' : 'ru-RU');
    } catch {
      return iso;
    }
  };

  if (isLoading || !call) {
    return (
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 flex items-center gap-3 text-slate-500 shadow-2xl">
          <Loader2 size={24} className="animate-spin text-blue-600" />
          <span>{lang === 'uz' ? 'Yuklanmoqda...' : 'Загрузка карточки звонка...'}</span>
        </div>
      </div>
    );
  }

  const score = call.overallScore ?? 0;
  const scoreColor =
    score >= 75
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
      : score >= 50
      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-3xl w-full border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                call.callDirection === 'in'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                  : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
              }`}
            >
              {call.callDirection === 'in' ? <PhoneIncoming size={20} /> : <PhoneOutgoing size={20} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                  {call.phone || (lang === 'uz' ? 'Noma\'lum raqam' : 'Неизвестный номер')}
                </h3>
                {call.pipelineName && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                    {call.pipelineName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {call.leadName && <span className="font-medium text-blue-600 dark:text-blue-400">{call.leadName}</span>}
                {call.managerName && (
                  <span className="flex items-center gap-1">
                    <User size={12} /> {call.managerName}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock size={12} /> {formatDuration(call.durationSeconds)}
                </span>
                <span>{formatDate(call.callDate)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {call.status === 'completed' ? (
              <div className={`px-3 py-1.5 rounded-xl font-bold text-base border flex items-center gap-1.5 ${scoreColor}`}>
                <span>{score}</span>
                <span className="text-xs font-normal opacity-75">/ 100</span>
              </div>
            ) : (
              <div className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {call.skipReason || (call.status === 'pending' ? (lang === 'uz' ? 'Kutilmoqda' : 'В очереди') : call.status)}
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Audio Player Bar */}
        {call.recordingUrl ? (
          <div className="px-5 py-3 bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
            <Volume2 size={18} className="text-slate-500 shrink-0" />
            <audio controls src={call.recordingUrl} className="w-full h-8 outline-none" />
          </div>
        ) : (
          <div className="px-5 py-2 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-400">
            {lang === 'uz' ? 'Audio yozuv mavjud emas' : 'Аудиозапись не прикреплена или устарела'}
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-5 gap-4 bg-white dark:bg-slate-900 text-sm">
          <button
            onClick={() => setActiveTab('verdict')}
            className={`py-3 font-semibold border-b-2 cursor-pointer transition-colors ${
              activeTab === 'verdict'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            {lang === 'uz' ? 'AI Xulosasi' : 'Вердикт ИИ'}
          </button>
          <button
            onClick={() => setActiveTab('checklist')}
            className={`py-3 font-semibold border-b-2 cursor-pointer transition-colors flex items-center gap-1.5 ${
              activeTab === 'checklist'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            {lang === 'uz' ? 'Reglament va xronologiya' : 'Чек-лист и хронология'}
            {call.rulesBreakdown && (
              <span className="px-1.5 py-0.2 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600">
                {call.rulesBreakdown.length}
              </span>
            )}
          </button>
        </div>

        {/* Body content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'verdict' && (
            <div className="space-y-4">
              {/* Summary */}
              {call.summary && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    {lang === 'uz' ? 'Qisqacha mazmun' : 'Краткое содержание'}
                  </span>
                  <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                    {call.summary}
                  </p>
                </div>
              )}

              {/* Bottleneck */}
              {call.bottleneck && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200/80 dark:border-amber-900/40">
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                    <AlertTriangle size={15} />
                    {lang === 'uz' ? 'Suhbatning zaif nuqtasi (Bottleneck)' : 'Узкое место разговора'}
                  </span>
                  <p className="text-sm text-amber-950 dark:text-amber-200 leading-relaxed">
                    {call.bottleneck}
                  </p>
                </div>
              )}

              {/* Recommendation */}
              {call.recommendation && (
                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200/80 dark:border-blue-900/40">
                  <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                    <Lightbulb size={15} />
                    {lang === 'uz' ? 'Menejer va ROP uchun tavsiya' : 'Рекомендация менеджеру и РОПу'}
                  </span>
                  <p className="text-sm text-blue-950 dark:text-blue-200 leading-relaxed">
                    {call.recommendation}
                  </p>
                </div>
              )}

              {/* Errors List */}
              {call.errorsList && call.errorsList.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    {lang === 'uz' ? 'Aniq xatolar' : 'Выявленные ошибки'}
                  </span>
                  <div className="space-y-1.5">
                    {call.errorsList.map((err, i) => (
                      <div
                        key={i}
                        className="p-2.5 bg-rose-50 dark:bg-rose-950/30 rounded-lg text-xs text-rose-800 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/40 flex items-start gap-2"
                      >
                        <XCircle size={15} className="text-rose-500 shrink-0 mt-0.5" />
                        <span>{err}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* If no verdict data (e.g. call was skipped or pending) */}
              {!call.summary && !call.bottleneck && !call.recommendation && (!call.errorsList || call.errorsList.length === 0) && (
                <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-2">
                  <AlertTriangle size={28} className="mx-auto text-slate-400" />
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {call.skipReason || (lang === 'uz' ? 'Qo‘ng‘iroq tahlil qilinmagan' : 'Звонок не оценивался регламентом')}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    {call.status === 'skipped_historical' && (lang === 'uz' ? 'Tizimga ulanishdan oldingi arxiv qo‘ng‘iroq' : 'Архивный звонок, совершенный до запуска контроля качества')}
                    {call.status === 'skipped_no_audio' && (lang === 'uz' ? 'Telefoniya tomonidan audio yozuv taqdim etilmagan' : 'Телефония не передала ссылку на аудиозапись')}
                    {call.status === 'skipped_not_answered' && (lang === 'uz' ? 'Mijoz go‘shakni ko‘tarmagan yoki bekor qilgan' : 'Разговор не состоялся (недозвон / сброс)')}
                    {call.status === 'pending' && (lang === 'uz' ? 'Navbatda, tez orada tahlil qilinadi' : 'Звонок находится в очереди на транскрибацию')}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'checklist' && (
            <div className="space-y-3">
              {call.rulesBreakdown && call.rulesBreakdown.length > 0 ? (
                call.rulesBreakdown.map((r, i) => (
                  <div
                    key={i}
                    className={`p-3.5 rounded-xl border flex flex-col gap-2 ${
                      r.passed
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-900/40'
                        : 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-900/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                          {r.passed ? (
                            <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <XCircle size={18} className="text-rose-600 dark:text-rose-400" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                              {r.rule_title}
                            </span>
                            {r.timestamp && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center gap-0.5">
                                <Clock size={10} />
                                {r.timestamp}
                              </span>
                            )}
                          </div>
                          {r.details && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                              {r.details}
                            </p>
                          )}
                        </div>
                      </div>

                      {!r.passed && (
                        <span className="text-xs px-2.5 py-0.5 rounded-md font-semibold bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 shrink-0">
                          {lang === 'uz' ? 'Bajarilmadi' : 'Не выполнено'}
                        </span>
                      )}
                    </div>

                    {!r.passed && r.improvement && (
                      <div className="mt-1 ml-7.5 p-2.5 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 rounded-lg text-xs">
                        <span className="font-semibold text-amber-700 dark:text-amber-400 block mb-0.5 flex items-center gap-1">
                          <Lightbulb size={13} />
                          {lang === 'uz' ? 'Qanday aytish kerak edi:' : 'Как следовало сказать:'}
                        </span>
                        <p className="text-amber-950 dark:text-amber-200 italic leading-relaxed">
                          {r.improvement}
                        </p>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-sm text-slate-400">
                  {lang === 'uz' ? 'Tekshiruv ma\'lumotlari yo\'q' : 'Чек-лист для этого звонка не сформирован'}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

