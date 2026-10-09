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

  if (data.isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-8 flex items-center justify-center">
        <div className="text-slate-500 dark:text-slate-400">{t('loading')}</div>
      </div>
    );
  }

  if (data.isError || !data.data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-8 flex flex-col items-center justify-center gap-4">
        <div className="text-red-500 font-medium">{t('error') || (lang === 'uz' ? 'Bitim ma’lumotlarini yuklab bo‘lmadi' : 'Не удалось загрузить данные по сделке')}</div>
        <button
          onClick={() => nav(-1)}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
        >
          {t('back')}
        </button>
      </div>
    );
  }

  const lead = data.data.lead || {};
  const history = Array.isArray(data.data.history) ? data.data.history : [];
  const skips = Array.isArray(data.data.skips) ? data.data.skips : [];
  const tags = Array.isArray(lead.leadTags) ? lead.leadTags : Array.isArray(lead.tags) ? lead.tags : [];

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
        </div>

        {/* Lead card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-lg shadow-sm mb-6">
          <h1 className="text-2xl font-bold mb-4 text-slate-900 dark:text-slate-100">{lead.name || '—'}</h1>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500 dark:text-slate-400">{t('lead_id')} </span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {(lead.external_id || lead.externalId)?.toString() || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">{t('lead_status')} </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{lead.status || '—'}</span>
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
                {formatDate(lead.crm_created_at || lead.crmCreatedAt, 'dd.MM.yyyy HH:mm')}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 dark:text-slate-400">{t('lead_manager')} </span>
              <span className="text-slate-800 dark:text-slate-200">
                {lead.responsibleUser?.name || lead.managerName || lead.manager_name || lead.responsible_name || '—'}
              </span>
            </div>
          </div>
          {tags.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-1.5 flex-wrap">
              {tags.map((lt: any, idx: number) => {
                const tagName = lt.tag?.name || lt.name || String(lt);
                const tagKey = lt.tagId || lt.tag_id || lt.id || idx;
                return (
                  <span
                    key={tagKey}
                    className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs rounded-md"
                  >
                    {tagName}
                  </span>
                );
              })}
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
              {history.map((h: any, i: number) => {
                const stageName = h.stage_name || h.stageName || '—';
                const enteredAt = h.entered_at || h.enteredAt;
                const exitedAt = h.exited_at || h.exitedAt;
                const duration = h.duration_seconds ?? h.durationSeconds;
                return (
                  <tr
                    key={h.id || i}
                    className="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="p-3 font-medium text-slate-900 dark:text-slate-100">{stageName}</td>
                    <td className="p-3 text-slate-700 dark:text-slate-300">{formatDate(enteredAt, 'dd.MM.yyyy HH:mm')}</td>
                    <td className="p-3 text-slate-700 dark:text-slate-300">
                      {exitedAt ? formatDate(exitedAt, 'dd.MM.yyyy HH:mm') : t('current_stage')}
                    </td>
                    <td className="p-3 text-slate-700 dark:text-slate-300">
                      {formatDuration(duration)}
                    </td>
                  </tr>
                );
              })}
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
                  {skips.map((s: any, i: number) => {
                    const transAt = s.transition_at || s.transitionAt;
                    const fromStage = s.from_stage_name || s.fromStageName || '—';
                    const toStage = s.to_stage_name || s.toStageName || '—';
                    const skippedStage = s.skipped_stage_name || s.skippedStageName || '—';
                    return (
                      <tr
                        key={s.id || i}
                        className="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="p-3 text-slate-700 dark:text-slate-300">{formatDate(transAt, 'dd.MM.yyyy HH:mm')}</td>
                        <td className="p-3 text-slate-700 dark:text-slate-300">{fromStage}</td>
                        <td className="p-3 text-slate-700 dark:text-slate-300">{toStage}</td>
                        <td className="p-3 font-semibold text-amber-600 dark:text-amber-400">{skippedStage}</td>
                        <td className="p-3 text-slate-700 dark:text-slate-300">
                          {s.direction === 'forward'
                            ? (lang === 'uz' ? 'Oldinga' : 'Вперед')
                            : s.direction === 'backward'
                            ? (lang === 'uz' ? 'Orqaga' : 'Назад')
                            : s.direction}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
