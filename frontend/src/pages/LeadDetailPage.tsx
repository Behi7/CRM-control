import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { userApi } from '../api/client';
import { formatDate } from '../lib/utils';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function LeadDetailPage() {
  const { leadId } = useParams();
  const nav = useNavigate();
  const { logout } = useAuth();
  const { t, formatDuration, lang } = useLanguage();

  const data = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => userApi.leadHistory(parseInt(leadId!, 10)),
  });

  if (!data.data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-8 flex items-center justify-center">
        <div className="text-slate-500 dark:text-slate-400">{t('loading')}</div>
      </div>
    );
  }

  const { lead, history, skips } = data.data;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => nav(-1)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            {t('back')}
          </button>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <ThemeToggle />
            <button
              onClick={logout}
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
            >
              {t('logout')}
            </button>
          </div>
        </div>

        {/* Lead card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-lg shadow-sm mb-6">
          <h1 className="text-2xl font-bold mb-4 text-slate-900 dark:text-slate-100">{lead.name || '—'}</h1>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500 dark:text-slate-400">{t('lead_id')} </span>
              <span className="font-mono text-slate-800 dark:text-slate-200">{lead.externalId?.toString()}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">{t('lead_status')} </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{lead.status}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">{t('lead_price')} </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {lead.price ? Number(lead.price).toLocaleString() : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">{t('lead_created')} </span>
              <span className="text-slate-800 dark:text-slate-200">
                {formatDate(lead.crmCreatedAt, 'dd.MM.yyyy HH:mm')}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 dark:text-slate-400">{t('lead_manager')} </span>
              <span className="text-slate-800 dark:text-slate-200">{lead.responsibleUser?.name || '—'}</span>
            </div>
          </div>
          {lead.leadTags?.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-1.5 flex-wrap">
              {lead.leadTags.map((lt: any) => (
                <span
                  key={lt.tagId}
                  className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs rounded-md"
                >
                  {lt.tag.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Stage history */}
        <h2 className="text-lg font-bold mb-3 text-slate-900 dark:text-slate-100">{t('stage_history_title')}</h2>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200">
              <tr>
                <th className="p-3 text-left">{t('col_stage')}</th>
                <th className="p-3 text-left">{t('col_entered')}</th>
                <th className="p-3 text-left">{t('col_exited')}</th>
                <th className="p-3 text-left">{t('col_duration')}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h: any, i: number) => (
                <tr
                  key={i}
                  className="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="p-3 font-medium text-slate-900 dark:text-slate-100">{h.stage_name}</td>
                  <td className="p-3 text-slate-700 dark:text-slate-300">{formatDate(h.entered_at, 'dd.MM.yyyy HH:mm')}</td>
                  <td className="p-3 text-slate-700 dark:text-slate-300">
                    {h.exited_at ? formatDate(h.exited_at, 'dd.MM.yyyy HH:mm') : t('current_stage')}
                  </td>
                  <td className="p-3 text-slate-700 dark:text-slate-300">
                    {formatDuration(h.duration_seconds)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Skips */}
        {skips.length > 0 && (
          <>
            <h2 className="text-lg font-bold mb-3 text-slate-900 dark:text-slate-100">
              {lang === 'uz' ? 'Sakrab o‘tilgan bosqichlar' : 'Перепрыгнутые этапы'}
            </h2>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200">
                  <tr>
                    <th className="p-3 text-left">{lang === 'uz' ? 'Qachon' : 'Когда'}</th>
                    <th className="p-3 text-left">{lang === 'uz' ? 'Qayerdan' : 'Из'}</th>
                    <th className="p-3 text-left">{lang === 'uz' ? 'Qayerga' : 'В'}</th>
                    <th className="p-3 text-left">{lang === 'uz' ? 'O‘tkazib yuborilgan' : 'Пропущен'}</th>
                    <th className="p-3 text-left">{lang === 'uz' ? 'Yo‘nalish' : 'Направление'}</th>
                  </tr>
                </thead>
                <tbody>
                  {skips.map((s: any, i: number) => (
                    <tr
                      key={i}
                      className="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="p-3 text-slate-700 dark:text-slate-300">{formatDate(s.transition_at, 'dd.MM.yyyy HH:mm')}</td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">{s.from_stage_name}</td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">{s.to_stage_name}</td>
                      <td className="p-3 font-semibold text-amber-600 dark:text-amber-400">{s.skipped_stage_name}</td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">{s.direction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
