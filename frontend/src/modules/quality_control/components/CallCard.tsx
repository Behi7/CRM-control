import React from 'react';
import { PhoneIncoming, PhoneOutgoing, Clock, User, Play, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { CallEvaluationItem } from '../api/qcApi';
import { useLanguage } from '../../../i18n/LanguageContext';

interface CallCardProps {
  call: CallEvaluationItem;
  onOpenDetail: (callId: number) => void;
}

export default function CallCard({ call, onOpenDetail }: CallCardProps) {
  const { lang } = useLanguage();

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(lang === 'uz' ? 'uz-UZ' : 'ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const isCompleted = call.status === 'completed';
  const score = call.overallScore ?? 0;

  const scoreBadgeColor =
    score >= 75
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
      : score >= 50
      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';

  return (
    <div
      onClick={() => onOpenDetail(call.id)}
      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 hover:border-blue-400 dark:hover:border-blue-500 transition-all cursor-pointer shadow-xs hover:shadow-md relative overflow-hidden group"
    >
      <div className="flex items-start justify-between gap-3 mb-2.5">
        {/* Left: Direction, Phone, Lead, Manager */}
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              call.callDirection === 'in'
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400'
                : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400'
            }`}
            title={call.callDirection === 'in' ? (lang === 'uz' ? 'Kiruvchi' : 'Входящий') : (lang === 'uz' ? 'Chiquvchi' : 'Исходящий')}
          >
            {call.callDirection === 'in' ? <PhoneIncoming size={17} /> : <PhoneOutgoing size={17} />}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                {call.phone || (lang === 'uz' ? 'Raqam ko\'rsatilmagan' : 'Номер не указан')}
              </span>
              {call.pipelineName && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {call.pipelineName}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {call.leadName && (
                <span className="truncate max-w-[200px] text-blue-600 dark:text-blue-400 font-medium">
                  {call.leadName}
                </span>
              )}
              {call.managerName && (
                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <User size={12} className="text-slate-400" />
                  {call.managerName}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Score or Skip Badge */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="text-right">
            <span className="text-xs text-slate-400 flex items-center gap-1 justify-end">
              <Clock size={11} /> {formatDuration(call.durationSeconds)}
            </span>
            <span className="text-[11px] text-slate-400">
              {formatDate(call.callDate)}
            </span>
          </div>

          {isCompleted ? (
            <div
              className={`w-12 h-10 rounded-lg flex items-center justify-center font-bold text-sm border ${scoreBadgeColor}`}
            >
              {score}
            </div>
          ) : call.status === 'pending' ? (
            <div className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 animate-pulse">
              {lang === 'uz' ? 'Tahlil kutilmoqda...' : 'В очереди анализа...'}
            </div>
          ) : (
            <div className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
              {call.skipReason || (lang === 'uz' ? 'O\'tkazib yuborilgan' : 'Пропущен')}
            </div>
          )}
        </div>
      </div>

      {/* Errors and Bottleneck */}
      {isCompleted && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
          {/* Tags of mistakes */}
          {call.errorsList && call.errorsList.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              {call.errorsList.slice(0, 3).map((err, idx) => (
                <span
                  key={idx}
                  className="text-[11px] px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/40 flex items-center gap-1"
                >
                  <AlertCircle size={10} className="shrink-0" />
                  {err}
                </span>
              ))}
              {call.errorsList.length > 3 && (
                <span className="text-[11px] text-slate-400">
                  +{call.errorsList.length - 3}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle size={12} />
              {lang === 'uz' ? 'Xatolar topilmadi, qoidalar bajarildi' : 'Грубых нарушений регламента не зафиксировано'}
            </div>
          )}

          {/* Bottleneck preview */}
          {call.bottleneck && (
            <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-1 italic bg-slate-50 dark:bg-slate-800/40 px-2 py-1 rounded">
              <span className="font-semibold text-amber-600 dark:text-amber-400 not-italic mr-1">
                {lang === 'uz' ? 'Zaif nuqta:' : 'Узкое место:'}
              </span>
              {call.bottleneck}
            </div>
          )}
        </div>
      )}

      {/* Hover action bar */}
      <div className="mt-2.5 flex justify-end items-center gap-2 pt-1 text-xs text-blue-600 dark:text-blue-400 group-hover:opacity-100 transition-opacity">
        <span className="flex items-center gap-1 hover:underline font-medium">
          <FileText size={13} />
          {lang === 'uz' ? 'Batafsil tahlil va audio' : 'Подробный анализ и аудио'}
        </span>
      </div>
    </div>
  );
}

