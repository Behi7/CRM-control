import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useLanguage } from '@/i18n/LanguageContext';
import { Bell, Play, Square, Eye, Settings, Trash2, Bot, RefreshCw } from 'lucide-react';
import AiSettingsModal from '@/components/AiSettingsModal';

export default function AdminClientsPage() {
  const { logout } = useAuth();
  const { t, lang } = useLanguage();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [aiAccount, setAiAccount] = useState<{ id: number; subdomain: string } | null>(null);

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: adminApi.listAccounts });
  const notifs = useQuery({ queryKey: ['notifs'], queryFn: () => adminApi.listNotifications(true) });
  const createMut = useMutation({
    mutationFn: adminApi.createAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setShowForm(false);
    },
  });
  const patchMut = useMutation({
    mutationFn: ({ id, data }: any) => adminApi.patchAccount(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setEditId(null);
    },
  });
  const delMut = useMutation({
    mutationFn: adminApi.deleteAccount,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });
  const retryMut = useMutation({
    mutationFn: adminApi.retryBackfill,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });
  const stopSyncMut = useMutation({
    mutationFn: adminApi.stopSync,
    onSuccess: (updated: any) => {
      qc.setQueryData(['accounts'], (old: any[]) =>
        old ? old.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)) : [],
      );
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
  const startSyncMut = useMutation({
    mutationFn: adminApi.startSync,
    onSuccess: (updated: any) => {
      qc.setQueryData(['accounts'], (old: any[]) =>
        old ? old.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)) : [],
      );
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t('admin_clients_title')}</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => nav('/admin/notifications')}
            className="relative p-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title={t('nav_notifications')}
          >
            <Bell size={20} />
            {notifs.data && notifs.data.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {notifs.data.length}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <button
          onClick={() => {
            setEditId(null);
            setShowForm(true);
          }}
          className="mb-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium transition-colors cursor-pointer"
        >
          {t('add_client')}
        </button>

        {(showForm || editId) && (
          <AccountForm
            initial={accounts.data?.find((a) => a.id === editId)}
            onCancel={() => {
              setShowForm(false);
              setEditId(null);
            }}
            onSubmit={async (data: any) => {
              if (editId) await patchMut.mutateAsync({ id: editId, data });
              else await createMut.mutateAsync(data);
            }}
          />
        )}

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200">
              <tr>
                <th className="p-3 text-left">{t('col_email')}</th>
                <th className="p-3 text-left">{t('col_subdomain')}</th>
                <th className="p-3 text-left">{t('col_external_id')}</th>
                <th className="p-3 text-left">{t('col_token_status')}</th>
                <th className="p-3 text-left">{t('col_backfill')}</th>
                <th className="p-3 text-left">{t('col_sync')}</th>
                <th className="p-3 text-left">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.data?.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="p-3 font-medium text-slate-900 dark:text-slate-100">{a.users?.[0]?.email}</td>
                  <td className="p-3 text-slate-700 dark:text-slate-300">{a.subdomain}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-400 font-mono text-xs">
                    {a.externalAccountId?.toString()}
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        a.tokenStatus === 'active'
                          ? 'bg-green-100 dark:bg-green-950/70 text-green-800 dark:text-green-300 border border-transparent dark:border-green-800/50'
                          : 'bg-red-100 dark:bg-red-950/70 text-red-800 dark:text-red-300 border border-transparent dark:border-red-800/50'
                      }`}
                    >
                      {a.tokenStatus}
                    </span>
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        a.backfillStatus === 'done'
                          ? 'bg-green-100 dark:bg-green-950/70 text-green-800 dark:text-green-300 border border-transparent dark:border-green-800/50'
                          : a.backfillStatus === 'failed'
                          ? 'bg-red-100 dark:bg-red-950/70 text-red-800 dark:text-red-300 border border-transparent dark:border-red-800/50'
                          : 'bg-yellow-100 dark:bg-yellow-950/70 text-yellow-800 dark:text-yellow-300 border border-transparent dark:border-yellow-800/50'
                      }`}
                    >
                      {a.backfillStatus === 'done'
                        ? t('backfill_completed')
                        : a.backfillStatus === 'failed'
                        ? t('backfill_failed')
                        : t('backfill_running')}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (a.syncStatus === 'stopped') {
                            startSyncMut.mutate(a.id);
                          } else {
                            stopSyncMut.mutate(a.id);
                          }
                        }}
                        disabled={stopSyncMut.isPending || startSyncMut.isPending}
                        title={a.syncStatus === 'stopped' ? t('start_sync') : t('stop_sync')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold shadow-sm transition-colors cursor-pointer ${
                          a.syncStatus === 'stopped'
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-rose-600 text-white hover:bg-rose-700'
                        }`}
                      >
                        {a.syncStatus === 'stopped' ? (
                          <>
                            <Play size={12} className="fill-current" />
                            <span>{lang === 'uz' ? 'Boshlash' : 'Старт'}</span>
                          </>
                        ) : (
                          <>
                            <Square size={12} className="fill-current" />
                            <span>{lang === 'uz' ? 'To‘xtatish' : 'Стоп'}</span>
                          </>
                        )}
                      </button>
                      <span className="text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {a.lastSyncedAt
                          ? new Date(a.lastSyncedAt).toLocaleString(lang === 'uz' ? 'uz-UZ' : 'ru-RU')
                          : '—'}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 flex items-center gap-2 flex-wrap">
                    {/* Кнопка Стат. -> Полуквадрат с иконкой Глаз */}
                    <button
                      type="button"
                      onClick={() => nav(`/admin/stats/${a.id}`)}
                      title={lang === 'uz' ? 'Statistika' : 'Статистика'}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Eye size={16} />
                    </button>

                    {/* Кнопка Редактировать -> Полуквадрат с иконкой Шестеренка */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditId(a.id);
                        setShowForm(false);
                      }}
                      title={t('edit')}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/50 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Settings size={16} />
                    </button>

                    {/* Кнопка ИИ -> Полуквадрат с иконкой Робот */}
                    <button
                      type="button"
                      onClick={() => setAiAccount({ id: a.id, subdomain: a.subdomain })}
                      title={
                        a.aiEnabled
                          ? (lang === 'uz' ? 'AI faol (sozlash)' : 'ИИ активен (настройки)')
                          : (lang === 'uz' ? 'AI ulash' : 'Подключить ИИ')
                      }
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shadow-2xs cursor-pointer relative ${
                        a.aiEnabled
                          ? 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-800/60'
                          : 'bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-600 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/50'
                      }`}
                    >
                      <Bot size={16} />
                      {a.aiEnabled && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900" />
                      )}
                    </button>

                    {/* Кнопка повтора backfill (если упал) */}
                    {a.backfillStatus === 'failed' && (
                      <button
                        type="button"
                        onClick={() => retryMut.mutate(a.id)}
                        title={t('backfill_retry')}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/60 dark:hover:bg-orange-900/60 text-orange-600 dark:text-orange-300 border border-orange-200/50 dark:border-orange-800/50 transition-colors shadow-2xs cursor-pointer"
                      >
                        <RefreshCw size={15} />
                      </button>
                    )}

                    {/* Кнопка Удалить -> Полуквадрат с иконкой Мусорка */}
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(t('confirm_delete_client', { subdomain: a.subdomain }))) {
                          delMut.mutate(a.id);
                        }
                      }}
                      title={t('delete')}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-300 border border-rose-200/50 dark:border-rose-800/50 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {aiAccount && (
          <AiSettingsModal
            accountId={aiAccount.id}
            subdomain={aiAccount.subdomain}
            onClose={() => setAiAccount(null)}
          />
        )}
      </main>
    </div>
  );
}

function AccountForm({ initial, onCancel, onSubmit }: any) {
  const { t, lang } = useLanguage();
  const [email, setEmail] = useState(initial?.users?.[0]?.email || '');
  const [password, setPassword] = useState('');
  const [subdomain, setSubdomain] = useState(initial?.subdomain || '');
  const [token, setToken] = useState('');
  const [tokenExpiresAt, setTokenExpiresAt] = useState(initial?.tokenExpiresAt?.split('T')[0] || '');
  const [baseDomain, setBaseDomain] = useState(initial?.baseDomain || 'amocrm.ru');
  const [err, setErr] = useState('');

  const submit = async (e: any) => {
    e.preventDefault();
    setErr('');
    try {
      const data: any = {};
      if (!initial) {
        if (!email || !password || !subdomain || !token) {
          setErr(lang === 'uz' ? 'Barcha maydonlarni to‘ldirish majburiy' : 'Все поля обязательны');
          return;
        }
        data.email = email;
        data.password = password;
        data.subdomain = subdomain;
        data.token = token;
        data.baseDomain = baseDomain;
        if (tokenExpiresAt) data.tokenExpiresAt = tokenExpiresAt + 'T00:00:00Z';
      } else {
        if (email && email !== initial.users?.[0]?.email) data.email = email;
        if (password) data.password = password;
        if (token) data.token = token;
        if (tokenExpiresAt) data.tokenExpiresAt = tokenExpiresAt + 'T00:00:00Z';
      }
      await onSubmit(data);
    } catch (e: any) {
      setErr(e.message || t('error'));
    }
  };

  return (
    <form
      onSubmit={submit}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-lg shadow-sm mb-6 grid grid-cols-2 gap-4"
    >
      <h3 className="col-span-2 font-bold text-slate-900 dark:text-slate-100 text-lg">
        {initial
          ? (lang === 'uz' ? 'Mijozni tahrirlash' : 'Редактирование клиента')
          : (lang === 'uz' ? 'Yangi mijoz' : 'Новый клиент')}
      </h3>
      {err && (
        <div className="col-span-2 p-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-sm rounded-lg">
          {err}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
          {t('client_form_email')}
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
          {t('client_form_password')} {initial ? `(${t('client_form_password_hint')})` : '(min 12)'}
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
          {t('client_form_subdomain')} {initial && (lang === 'uz' ? '(o‘zgarmaydi)' : '(не изменяется)')}
        </label>
        <input
          type="text"
          value={subdomain}
          onChange={(e) => setSubdomain(e.target.value)}
          disabled={!!initial}
          className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-400"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Base Domain</label>
        <select
          value={baseDomain}
          onChange={(e) => setBaseDomain(e.target.value)}
          disabled={!!initial}
          className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-400"
        >
          <option value="amocrm.ru">amocrm.ru</option>
          <option value="kommo.com">kommo.com</option>
        </select>
      </div>
      <div className="col-span-2">
        <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
          {t('client_form_token')}
        </label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={initial ? t('client_form_password_hint') : ''}
          className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
          {lang === 'uz' ? 'Token muddati tugashi' : 'Истечение токена'}
        </label>
        <input
          type="date"
          value={tokenExpiresAt}
          onChange={(e) => setTokenExpiresAt(e.target.value)}
          className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>
      <div className="col-span-2 flex gap-2 pt-2">
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium transition-colors cursor-pointer"
        >
          {t('save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
        >
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}
