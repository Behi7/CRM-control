import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function AdminNotificationsPage() {
  const { logout } = useAuth();
  const { t, lang } = useLanguage();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(true);
  const notifs = useQuery({
    queryKey: ['notifs', unreadOnly],
    queryFn: () => adminApi.listNotifications(unreadOnly),
  });
  const readMut = useMutation({
    mutationFn: adminApi.readNotification,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifs'] }),
  });

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

        <h1 className="text-2xl font-bold mb-4 text-slate-900 dark:text-slate-100">{t('notifs_title')}</h1>
        <label className="flex items-center gap-2 mb-4 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-700"
          />
          <span>{t('unread_only')}</span>
        </label>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm divide-y divide-slate-200 dark:divide-slate-800">
          {notifs.data?.map((n) => (
            <div
              key={n.id}
              className="p-4 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
            >
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">{n.type}</div>
                <div className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{n.message}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {new Date(n.createdAt).toLocaleString(lang === 'uz' ? 'uz-UZ' : 'ru-RU')}
                </div>
              </div>
              {!n.isRead && (
                <button
                  onClick={() => readMut.mutate(n.id)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline ml-4 shrink-0 font-medium cursor-pointer"
                >
                  {t('mark_read')}
                </button>
              )}
            </div>
          ))}
          {notifs.data?.length === 0 && (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400">{t('no_notifs')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
