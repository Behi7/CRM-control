import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { userApi, FilterParams } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { ManagerFilter } from '../components/ManagerFilter';
import { decodeJwt } from '../lib/jwt';

export default function SearchPage() {
  const { role, logout } = useAuth();
  const { accountId: paramAccountId } = useParams();
  const { t, lang } = useLanguage();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);
  const [selectedManagers, setSelectedManagers] = useState<number[]>([]);
  const perPage = 50;

  const decodedAccountId = (() => {
    const token = localStorage.getItem('access_token');
    return decodeJwt(token)?.accountId ?? null;
  })();
  const effectiveAccountId = paramAccountId ? parseInt(paramAccountId, 10) : (role === 'viewer' ? decodedAccountId : null);

  useEffect(() => {
    setPage(1);
  }, [submitted]);

  const managers = useQuery({
    queryKey: ['managers', effectiveAccountId],
    queryFn: () => userApi.managers(effectiveAccountId!),
    enabled: !!effectiveAccountId,
  });

  const filters: FilterParams = { managerIds: selectedManagers };

  const results = useQuery({
    queryKey: ['search', effectiveAccountId, submitted, page, selectedManagers],
    queryFn: () =>
      effectiveAccountId && submitted.length >= 2
        ? userApi.searchLeads(effectiveAccountId, submitted, page, perPage, filters)
        : Promise.resolve({ items: [], total: 0, page: 1, perPage }),
    enabled: !!effectiveAccountId && submitted.length >= 2,
  });

  const totalPages = Math.max(1, Math.ceil((results.data?.total || 0) / perPage));

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

        <h1 className="text-2xl font-bold mb-4 text-slate-900 dark:text-slate-100">{t('search_title')}</h1>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm mb-4 flex gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setSubmitted(q);
                setPage(1);
              }
            }}
            placeholder={t('search_placeholder')}
            className="flex-1 p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            onClick={() => {
              setSubmitted(q);
              setPage(1);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors font-medium cursor-pointer"
          >
            {t('search_btn')}
          </button>
        </div>

        <ManagerFilter
          managers={managers.data?.items}
          selectedManagers={selectedManagers}
          onChange={(next) => {
            setSelectedManagers(next);
            setPage(1);
          }}
          showIcon
        />

        {results.data?.items && results.data.items.length > 0 && (
          <div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200">
                  <tr>
                    <th className="p-3 text-left">{t('col_id')}</th>
                    <th className="p-3 text-left">{t('col_name')}</th>
                    <th className="p-3 text-left">{t('col_status')}</th>
                    <th className="p-3 text-left">{t('col_price')}</th>
                    <th className="p-3 text-left">{t('col_manager')}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.data.items.map((l: any) => (
                    <tr
                      key={l.id}
                      className="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      onClick={() => nav(role === 'admin' ? `/admin/lead/${l.id}` : `/lead/${l.id}`)}
                    >
                      <td className="p-3">{l.external_id}</td>
                      <td className="p-3 font-medium text-slate-900 dark:text-slate-100">{l.name || '—'}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {l.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-800 dark:text-slate-200">
                        {l.price ? Number(l.price).toLocaleString() : '—'}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">{l.responsible_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center mt-4 px-2 text-sm">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                {t('prev_page')}
              </button>
              <span className="text-slate-600 dark:text-slate-400">
                {t('page_x_of_y', { page, total: totalPages })} · {lang === 'uz' ? 'Jami' : 'Всего'}: {results.data.total}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                {t('next_page')}
              </button>
            </div>
          </div>
        )}

        {results.data && results.data.items?.length === 0 && submitted.length >= 2 && (
          <div className="text-center text-slate-500 dark:text-slate-400 py-8">
            {t('not_found')}
          </div>
        )}
      </div>
    </div>
  );
}
