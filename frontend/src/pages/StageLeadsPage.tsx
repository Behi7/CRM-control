import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { userApi, FilterParams } from '../api/client';
import { formatDate } from '../lib/utils';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function StageLeadsPage() {
  const { stageId } = useParams();
  const nav = useNavigate();
  const { role, logout } = useAuth();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const tagIds = (searchParams.get('tags') || '').split(',').filter(Boolean).map(Number).filter(n => !isNaN(n));
  const managerIds = (searchParams.get('managers') || '').split(',').filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0);
  const status = searchParams.get('status') || undefined;
  const dateFrom = searchParams.get('dateFrom') || undefined;
  const dateTo = searchParams.get('dateTo') || undefined;
  const [page, setPage] = useState(1);
  const perPage = 50;

  const filters: FilterParams = { tagIds, managerIds, status, dateFrom, dateTo };

  const leads = useQuery({
    queryKey: ['stageLeads', stageId, page, filters],
    queryFn: () => userApi.activeLeads(parseInt(stageId!, 10), page, perPage, filters),
  });

  const getStatusLabel = (st: string) => {
    if (st === 'open') return t('status_open');
    if (st === 'won') return t('status_won');
    if (st === 'lost') return t('status_lost');
    return st;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-6">
      <div className="max-w-5xl mx-auto">
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

        <h1 className="text-2xl font-bold mb-4 text-slate-900 dark:text-slate-100">
          {t('stage_leads_title')}
        </h1>

        {(managerIds.length > 0 || dateFrom || dateTo) && (
          <div className="flex flex-wrap gap-2 mb-4">
            {managerIds.length > 0 && (
              <span className="text-xs bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border border-transparent dark:border-purple-800/50 px-2 py-1 rounded">
                {t('filter_managers_count', { count: managerIds.length })}
              </span>
            )}
            {(dateFrom || dateTo) && (
              <span className="text-xs bg-green-100 dark:bg-green-950/70 text-green-800 dark:text-green-300 border border-transparent dark:border-green-800/50 px-2 py-1 rounded">
                {t('filter_period', { from: dateFrom || '...', to: dateTo || '...' })}
              </span>
            )}
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200">
              <tr>
                <th className="p-3 text-left">{t('col_id')}</th>
                <th className="p-3 text-left">{t('col_name')}</th>
                <th className="p-3 text-left">{t('col_price')}</th>
                <th className="p-3 text-left">{t('col_entered_at')}</th>
                <th className="p-3 text-left">{t('col_manager')}</th>
                <th className="p-3 text-left">{t('col_status')}</th>
              </tr>
            </thead>
            <tbody>
              {leads.data?.items.map((l: any) => (
                <tr
                  key={l.id}
                  className="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                  onClick={() => nav(role === 'admin' ? `/admin/lead/${l.id}` : `/lead/${l.id}`)}
                >
                  <td className="p-3">{l.external_id}</td>
                  <td className="p-3 font-medium text-slate-900 dark:text-slate-100">{l.name}</td>
                  <td className="p-3">{l.price ? Number(l.price).toLocaleString() : '—'}</td>
                  <td className="p-3">{formatDate(l.entered_at, 'dd.MM.yyyy HH:mm')}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">{l.responsible_name || '—'}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        l.status === 'open'
                          ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border border-transparent dark:border-blue-800/50'
                          : l.status === 'won'
                          ? 'bg-green-100 dark:bg-green-950/70 text-green-800 dark:text-green-300 border border-transparent dark:border-green-800/50'
                          : 'bg-red-100 dark:bg-red-950/70 text-red-800 dark:text-red-300 border border-transparent dark:border-red-800/50'
                      }`}
                    >
                      {getStatusLabel(l.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {leads.data && (
          <div className="flex justify-between items-center mt-4 text-sm">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              {t('prev_page')}
            </button>
            <span className="text-slate-600 dark:text-slate-400">
              {t('page_x_of_y', { page, total: Math.ceil((leads.data.total || 1) / perPage) })}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * perPage >= (leads.data.total || 0)}
              className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              {t('next_page')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
