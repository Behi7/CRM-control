import { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp,
  DollarSign,
  Target,
  AlertTriangle,
  Users,
  Filter,
  RefreshCw,
  ExternalLink,
  Award,
  Layers,
  Tag as TagIcon,
  ShieldAlert,
  Repeat,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { py2Api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { decodeJwt } from '../lib/jwt';

type DatePreset = 'all' | 'today' | 'yesterday' | '7days' | '30days' | 'thismonth' | 'custom';
type BiTab = 'overview' | 'funnel' | 'managers' | 'marketing' | 'losses_ltv';

function getPresetDates(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const today = fmt(now);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const ys = fmt(y);
    return { from: ys, to: ys };
  }
  if (preset === '7days') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { from: fmt(d), to: today };
  }
  if (preset === '30days') {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    return { from: fmt(d), to: today };
  }
  if (preset === 'thismonth') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(d), to: today };
  }
  return { from: '', to: '' };
}

function fmtMoney(val: number | undefined | null): string {
  if (val == null || isNaN(val)) return '0';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(val));
}

export default function BiAnalyticsPage() {
  const { accountId: paramAccountId } = useParams<{ accountId?: string }>();
  const { role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const decodedAccountId = (() => {
    const token = localStorage.getItem('access_token');
    return decodeJwt(token)?.accountId ?? null;
  })();

  const storedAccId = Number(localStorage.getItem('active_account_id')) || null;
  const effectiveAccountId =
    (paramAccountId ? parseInt(paramAccountId, 10) : null) ??
    (role === 'viewer' ? decodedAccountId : storedAccId ?? 1);

  const [activeTab, setActiveTab] = useState<BiTab>('overview');
  const [pipelineId, setPipelineId] = useState<number | null>(
    Number(searchParams.get('pipeline')) || null,
  );
  const [selectedManagerId, setSelectedManagerId] = useState<number | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>(
    (searchParams.get('preset') as DatePreset) || 'all',
  );
  const [dateFrom, setDateFrom] = useState<string>(searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState<string>(searchParams.get('dateTo') || '');
  const [selectedCustomFieldName, setSelectedCustomFieldName] = useState<string>('ALL');
  const [enrichBanner, setEnrichBanner] = useState<string | null>(null);

  const handlePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset !== 'custom') {
      const { from, to } = getPresetDates(preset);
      setDateFrom(from);
      setDateTo(to);
      const next = new URLSearchParams(searchParams);
      if (preset !== 'all') next.set('preset', preset);
      else next.delete('preset');
      if (from) next.set('dateFrom', from);
      else next.delete('dateFrom');
      if (to) next.set('dateTo', to);
      else next.delete('dateTo');
      setSearchParams(next);
    }
  };

  const biQuery = useQuery({
    queryKey: [
      'py2-bi-analytics',
      effectiveAccountId,
      pipelineId,
      dateFrom,
      dateTo,
      selectedManagerId,
      selectedTagId,
    ],
    queryFn: () =>
      py2Api.analytics(effectiveAccountId!, {
        pipelineId,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        managerIds: selectedManagerId ? [selectedManagerId] : undefined,
        tagIds: selectedTagId ? [selectedTagId] : undefined,
      }),
    enabled: !!effectiveAccountId,
  });

  const enrichMut = useMutation({
    mutationFn: () => py2Api.triggerEnrich(effectiveAccountId!),
    onSuccess: (res) => {
      setEnrichBanner(res.message || 'Обогащение данных из AmoCRM запущено в фоне!');
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['py2-bi-analytics', effectiveAccountId] });
      }, 4000);
    },
  });

  const data = biQuery.data;
  const kpis = data?.kpis;
  const pipelines = data?.filtersMeta?.pipelines || [];
  const managersList = data?.filtersMeta?.managers || [];
  const tagsList = data?.filtersMeta?.tags || [];
  const funnel = data?.funnel || [];
  const managers = data?.managers || [];
  const timeseries = data?.timeseries || [];
  const marketing = data?.marketing || { utmSources: [], tagsBreakdown: [], customFieldsBreakdown: [] };
  const lossesAndLtv = data?.lossesAndLtv || { lossReasons: [], ltv: {}, riskDeals: [] };

  const customFieldNames: string[] = Array.from(
    new Set((marketing.customFieldsBreakdown || []).map((x: any) => x.fieldName)),
  );

  const filteredCustomFields = (marketing.customFieldsBreakdown || []).filter(
    (x: any) => selectedCustomFieldName === 'ALL' || x.fieldName === selectedCustomFieldName,
  );

  return (
    <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Page Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-bold border border-indigo-500/20">
              Модуль 02 • Python BI
            </span>
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
              Детальная аналитика продаж AmoCRM
            </h1>
          </div>
          {data?.account && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-3">
              <span>
                Аккаунт: <strong className="text-slate-700 dark:text-slate-200">{data.account.subdomain}.{data.account.baseDomain}</strong>
              </span>
              <span>•</span>
              <span>
                Глубокое обогащение БД:{' '}
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {kpis?.enrichedCount || 0} из {kpis?.totalLeads || 0} сделок
                </strong>{' '}
                (Уникальных контактов: {kpis?.uniqueContacts || 0})
              </span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => enrichMut.mutate()}
            disabled={enrichMut.isPending}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={15} className={enrichMut.isPending ? 'animate-spin' : ''} />
            <span>{enrichMut.isPending ? 'Обогащаем БД...' : 'Обогатить БД из AmoCRM'}</span>
          </button>
          <button
            onClick={() => biQuery.refetch()}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Обновить отчёт"
          >
            <RefreshCw size={16} className={biQuery.isFetching ? 'animate-spin text-blue-500' : ''} />
          </button>
        </div>
      </div>

      {enrichBanner && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 px-4 py-3 rounded-xl text-xs flex items-center justify-between">
          <span>{enrichBanner}</span>
          <button onClick={() => setEnrichBanner(null)} className="font-bold ml-4 cursor-pointer">✕</button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Filter size={14} />
            <span>Фильтры:</span>
          </div>

          {/* Pipeline selector */}
          <select
            value={pipelineId || ''}
            onChange={(e) => setPipelineId(e.target.value ? Number(e.target.value) : null)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
          >
            <option value="">Все воронки ({pipelines.length})</option>
            {pipelines.map((p: any) => (
              <option key={p.id} value={p.id}>
                Воронка: {p.name}
              </option>
            ))}
          </select>

          {/* Manager selector */}
          <select
            value={selectedManagerId || ''}
            onChange={(e) => setSelectedManagerId(e.target.value ? Number(e.target.value) : null)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
          >
            <option value="">Все менеджеры ({managersList.length})</option>
            {managersList.map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          {/* Tag selector */}
          <select
            value={selectedTagId || ''}
            onChange={(e) => setSelectedTagId(e.target.value ? Number(e.target.value) : null)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
          >
            <option value="">Все теги ({tagsList.length})</option>
            {tagsList.map((t: any) => (
              <option key={t.id} value={t.id}>
                #{t.name}
              </option>
            ))}
          </select>

          {/* Date presets */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {(
              [
                ['all', 'За всё время'],
                ['today', 'Сегодня'],
                ['7days', '7 дней'],
                ['30days', '30 дней'],
                ['thismonth', 'Этот месяц'],
                ['custom', 'Период'],
              ] as [DatePreset, string][]
            ).map(([presetKey, label]) => (
              <button
                key={presetKey}
                onClick={() => handlePresetChange(presetKey)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  datePreset === presetKey
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {datePreset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs"
              />
              <span className="text-slate-400">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs"
              />
            </div>
          )}
        </div>
      </div>

      {/* Navigation Tabs inside Module 02 */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {[
          { id: 'overview', label: '1. Обзор и Финансы', icon: DollarSign },
          { id: 'funnel', label: '2. Воронка и Утечки денег', icon: Layers },
          { id: 'managers', label: '3. Менеджеры и Дисциплина', icon: Award },
          { id: 'marketing', label: '4. Маркетинг, UTM и Поля', icon: TagIcon },
          { id: 'losses_ltv', label: '5. Причины отказа, LTV и Риски', icon: ShieldAlert },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as BiTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                active
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {biQuery.isLoading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-500">
          Загрузка глубокой аналитики AmoCRM...
        </div>
      ) : biQuery.isError ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-2xl p-6 text-sm">
          Ошибка загрузки аналитики: {(biQuery.error as any)?.message || 'Неизвестная ошибка'}
        </div>
      ) : (
        <>
          {/* ================= TAB 1: OVERVIEW & FINANCE ================= */}
          {activeTab === 'overview' && kpis && (
            <div className="space-y-6">
              {/* 8 KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <span>Выручка (Успешно реализовано)</span>
                    <CheckCircle2 size={18} className="text-emerald-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {fmtMoney(kpis.totalRevenue)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5">
                    Продаж: <strong>{kpis.wonLeads}</strong> из {kpis.totalLeads} сделок
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <span>Потенциал в работе (Open Pipeline)</span>
                    <TrendingUp size={18} className="text-blue-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                    {fmtMoney(kpis.openPipelineValue)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5">
                    Активных сделок сейчас: <strong>{kpis.openLeads}</strong>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <span>Упущенная выручка (Закрыто в отказ)</span>
                    <XCircle size={18} className="text-rose-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400">
                    {fmtMoney(kpis.lostRevenue)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5">
                    Потерянных сделок: <strong>{kpis.lostLeads}</strong>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <span>Средний и Медианный чек (AOV)</span>
                    <DollarSign size={18} className="text-indigo-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
                    {fmtMoney(kpis.avgCheck)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5">
                    Медианный чек: <strong>{fmtMoney(kpis.medianCheck)}</strong>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <span>Конверсия в продажу (Win Rate)</span>
                    <Target size={18} className="text-purple-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-purple-600 dark:text-purple-400">
                    {kpis.winRateClosed}%
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5">
                    От всех созданных лидов: <strong>{kpis.winRateTotal}%</strong>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <span>Средний цикл сделки (Скорость)</span>
                    <Clock size={18} className="text-amber-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
                    {kpis.avgCycleDays} дн.
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5">
                    Среднее время до отказа: <strong>{kpis.avgLossDays} дн.</strong>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <span>Дисциплина CRM (Открытые сделки)</span>
                    <AlertTriangle size={18} className="text-orange-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-orange-600 dark:text-orange-400">
                    {kpis.noTaskLeads} без задач
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5">
                    С просроченной задачей: <strong className="text-rose-500">{kpis.overdueTasksLeads}</strong>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <span>Клиентская база и LTV</span>
                    <Repeat size={18} className="text-teal-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-teal-600 dark:text-teal-400">
                    {lossesAndLtv.ltv?.repeatContacts || 0} повторных
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5">
                    Всего контактов: <strong>{lossesAndLtv.ltv?.uniqueContacts || 0}</strong> ({lossesAndLtv.ltv?.repeatRatePercent || 0}% Repeat)
                  </div>
                </div>
              </div>

              {/* Monthly Timeseries Table & Visual Bars */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                <h2 className="text-base font-bold mb-4 text-slate-900 dark:text-white">
                  Динамика лидов, продаж и выручки по месяцам
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="p-3 text-left rounded-l-lg">Период (Месяц)</th>
                        <th className="p-3 text-right">Новых сделок</th>
                        <th className="p-3 text-right">Успешно (Won)</th>
                        <th className="p-3 text-right">Отказ (Lost)</th>
                        <th className="p-3 text-right">В работе (Open)</th>
                        <th className="p-3 text-right">Win Rate</th>
                        <th className="p-3 text-right rounded-r-lg">Выручка (Won)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {timeseries.map((row: any) => {
                        const wr = row.totalLeads > 0 ? ((row.wonLeads / row.totalLeads) * 100).toFixed(1) : '0.0';
                        return (
                          <tr key={row.period} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="p-3 font-semibold">{row.period}</td>
                            <td className="p-3 text-right font-medium">{row.totalLeads}</td>
                            <td className="p-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                              {row.wonLeads}
                            </td>
                            <td className="p-3 text-right text-rose-500">{row.lostLeads}</td>
                            <td className="p-3 text-right text-blue-500">{row.openLeads}</td>
                            <td className="p-3 text-right">{wr}%</td>
                            <td className="p-3 text-right font-bold text-slate-900 dark:text-white">
                              {fmtMoney(row.revenue)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 2: FUNNEL & MONEY LEAKS ================= */}
          {activeTab === 'funnel' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Глубокая воронка конверсий и Карта утечек денег (Money Leaks)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Показывает, сколько сделок прошло через каждый этап, конверсию шага и на каком этапе срывается больше всего бюджета
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="p-3 text-left">Этап воронки</th>
                      <th className="p-3 text-right">Дошло сделок</th>
                      <th className="p-3 text-left w-44">Конверсия от старта</th>
                      <th className="p-3 text-right">Шаг (CR%)</th>
                      <th className="p-3 text-right">Ср. время</th>
                      <th className="p-3 text-right">Сейчас в работе (Open)</th>
                      <th className="p-3 text-right text-rose-600 dark:text-rose-400">
                        💸 Ушло в отказ с этапа (Money Leak)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {funnel.map((st: any) => (
                      <tr key={st.stageId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">{st.stageName}</td>
                        <td className="p-3 text-right font-bold">{st.reachedLeads}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"
                                style={{ width: `${Math.min(st.conversionFromStart, 100)}%` }}
                              />
                            </div>
                            <span className="w-10 text-right font-semibold">{st.conversionFromStart}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-medium text-indigo-600 dark:text-indigo-400">
                          {st.conversionFromPrev}%
                        </td>
                        <td className="p-3 text-right text-slate-500">{st.avgStageHours} ч.</td>
                        <td className="p-3 text-right">
                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                            {st.currentOpenLeads} шт.
                          </span>{' '}
                          <span className="text-slate-400">({fmtMoney(st.currentOpenValue)})</span>
                        </td>
                        <td className="p-3 text-right">
                          {st.lostAtStageLeads > 0 ? (
                            <div>
                              <span className="font-bold text-rose-600 dark:text-rose-400">
                                {st.lostAtStageLeads} шт.
                              </span>{' '}
                              <span className="text-rose-500 font-medium">
                                ({fmtMoney(st.lostAtStageValue)})
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= TAB 3: MANAGERS & DISCIPLINE ================= */}
          {activeTab === 'managers' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Рейтинг эффективности и CRM-дисциплины менеджеров отдела продаж
                </h2>
                <p className="text-xs text-slate-500">
                  Сравнение менеджеров по выручке, конверсии, среднему чеку, скорости закрытия сделок и наличию забытых клиентов без задач
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="p-3 text-left">Менеджер</th>
                      <th className="p-3 text-right">Всего сделок</th>
                      <th className="p-3 text-right">Успешно (Won)</th>
                      <th className="p-3 text-right">Отказ (Lost)</th>
                      <th className="p-3 text-right">В работе</th>
                      <th className="p-3 text-right">Win Rate</th>
                      <th className="p-3 text-right">Выручка (Won)</th>
                      <th className="p-3 text-right">Средний чек</th>
                      <th className="p-3 text-right">Цикл (дн.)</th>
                      <th className="p-3 text-right text-orange-600 dark:text-orange-400">Без задач</th>
                      <th className="p-3 text-right text-rose-600 dark:text-rose-400">Просрочено</th>
                      <th className="p-3 text-right">Пропуски этапов</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {managers.map((m: any, idx: number) => (
                      <tr key={m.managerId || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-[10px]">
                              {idx + 1}
                            </span>
                            <span>{m.managerName}</span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-medium">{m.totalLeads}</td>
                        <td className="p-3 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                          {m.wonLeads}
                        </td>
                        <td className="p-3 text-right text-rose-500">{m.lostLeads}</td>
                        <td className="p-3 text-right text-blue-500">{m.openLeads}</td>
                        <td className="p-3 text-right font-semibold">{m.winRate}%</td>
                        <td className="p-3 text-right font-extrabold text-emerald-600 dark:text-emerald-400">
                          {fmtMoney(m.revenue)}
                        </td>
                        <td className="p-3 text-right">{fmtMoney(m.avgCheck)}</td>
                        <td className="p-3 text-right">{m.avgCycleDays} дн.</td>
                        <td className="p-3 text-right font-semibold text-orange-600 dark:text-orange-400">
                          {m.noTaskLeads}
                        </td>
                        <td className="p-3 text-right font-semibold text-rose-600 dark:text-rose-400">
                          {m.overdueTasksLeads}
                        </td>
                        <td className="p-3 text-right text-slate-500">{m.stageSkipsCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================= TAB 4: MARKETING, UTM, TAGS & CUSTOM FIELDS ================= */}
          {activeTab === 'marketing' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* UTM Sources */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                  <h3 className="text-base font-bold mb-3 text-slate-900 dark:text-white">
                    Эффективность по источникам трафика (UTM Source)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="p-2.5 text-left">Источник (utm_source)</th>
                          <th className="p-2.5 text-right">Лиды</th>
                          <th className="p-2.5 text-right">Продажи</th>
                          <th className="p-2.5 text-right">CR%</th>
                          <th className="p-2.5 text-right">Выручка</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {(marketing.utmSources || []).map((u: any) => (
                          <tr key={u.source} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="p-2.5 font-semibold">{u.source}</td>
                            <td className="p-2.5 text-right">{u.totalLeads}</td>
                            <td className="p-2.5 text-right text-emerald-600 font-semibold">{u.wonLeads}</td>
                            <td className="p-2.5 text-right">{u.winRate}%</td>
                            <td className="p-2.5 text-right font-bold">{fmtMoney(u.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Tags Breakdown */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                  <h3 className="text-base font-bold mb-3 text-slate-900 dark:text-white">
                    Аналитика по тегам AmoCRM
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="p-2.5 text-left">Тег</th>
                          <th className="p-2.5 text-right">Лиды</th>
                          <th className="p-2.5 text-right">Продажи</th>
                          <th className="p-2.5 text-right">CR%</th>
                          <th className="p-2.5 text-right">Выручка</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {(marketing.tagsBreakdown || []).map((t: any) => (
                          <tr key={t.tagId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="p-2.5 font-semibold">#{t.tagName}</td>
                            <td className="p-2.5 text-right">{t.totalLeads}</td>
                            <td className="p-2.5 text-right text-emerald-600 font-semibold">{t.wonLeads}</td>
                            <td className="p-2.5 text-right">{t.winRate}%</td>
                            <td className="p-2.5 text-right font-bold">{fmtMoney(t.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Custom Fields Breakdown */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Глубокий срез по кастомным полям сделок AmoCRM (Custom Fields BI)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Анализ конверсии и выручки в разрезе любых пользовательских полей вашей CRM
                    </p>
                  </div>
                  <select
                    value={selectedCustomFieldName}
                    onChange={(e) => setSelectedCustomFieldName(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-medium"
                  >
                    <option value="ALL">Все кастомные поля ({customFieldNames.length})</option>
                    {customFieldNames.map((name) => (
                      <option key={name} value={name}>
                        Поле: {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="p-3 text-left">Название поля в AmoCRM</th>
                        <th className="p-3 text-left">Значение поля</th>
                        <th className="p-3 text-right">Сделок</th>
                        <th className="p-3 text-right">Продаж (Won)</th>
                        <th className="p-3 text-right">Win Rate %</th>
                        <th className="p-3 text-right">Выручка</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredCustomFields.map((cf: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="p-3 font-medium text-indigo-600 dark:text-indigo-400">{cf.fieldName}</td>
                          <td className="p-3 font-semibold">{cf.fieldValue}</td>
                          <td className="p-3 text-right">{cf.totalLeads}</td>
                          <td className="p-3 text-right text-emerald-600 font-semibold">{cf.wonLeads}</td>
                          <td className="p-3 text-right">{cf.winRate}%</td>
                          <td className="p-3 text-right font-bold">{fmtMoney(cf.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 5: LOSS REASONS, LTV & RISK AUDIT ================= */}
          {activeTab === 'losses_ltv' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Loss Reasons */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                  <h3 className="text-base font-bold mb-3 text-slate-900 dark:text-white">
                    Причины отказа (Почему теряются сделки и бюджет)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="p-2.5 text-left">Причина отказа</th>
                          <th className="p-2.5 text-right">Сделок</th>
                          <th className="p-2.5 text-right">Доля %</th>
                          <th className="p-2.5 text-right">Упущенная сумма</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {(lossesAndLtv.lossReasons || []).map((lr: any) => (
                          <tr key={lr.reason} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="p-2.5 font-semibold">{lr.reason}</td>
                            <td className="p-2.5 text-right font-bold text-rose-500">{lr.lostLeads}</td>
                            <td className="p-2.5 text-right">{lr.sharePercent}%</td>
                            <td className="p-2.5 text-right font-bold text-rose-600 dark:text-rose-400">
                              {fmtMoney(lr.lostValue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Top LTV & Repeat Customers */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Повторные продажи и ТОП клиентов по LTV
                    </h3>
                    <span className="text-xs px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 font-semibold">
                      Средний LTV: {fmtMoney(lossesAndLtv.ltv?.avgLtv || 0)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="p-2.5 text-left">Контакт AmoCRM / Пример сделки</th>
                          <th className="p-2.5 text-right">Всего обращений</th>
                          <th className="p-2.5 text-right">Покупок (Won)</th>
                          <th className="p-2.5 text-right">Сумма LTV</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {(lossesAndLtv.ltv?.topClients || []).map((c: any) => (
                          <tr key={c.contactId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="p-2.5">
                              <div className="font-semibold">Контакт #{c.contactId}</div>
                              <div className="text-[10px] text-slate-400 truncate max-w-[240px]">
                                {c.sampleLeadName}
                              </div>
                            </td>
                            <td className="p-2.5 text-right font-medium">{c.totalDeals}</td>
                            <td className="p-2.5 text-right text-emerald-600 font-bold">{c.wonDeals}</td>
                            <td className="p-2.5 text-right font-extrabold text-slate-900 dark:text-white">
                              {fmtMoney(c.revenue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Risk Deals Table (Actionable Audit for Sales Head) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <AlertTriangle size={18} className="text-amber-500" />
                    <span>Аудит: ТОП-25 открытых сделок с высоким бюджетом в зоне риска</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Активные сделки, требующие немедленного контроля РОПа (нет поставленной задачи, задача просрочена или нет движения более 14 дней)
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="p-3 text-left">Сделка</th>
                        <th className="p-3 text-left">Этап</th>
                        <th className="p-3 text-left">Ответственный</th>
                        <th className="p-3 text-right">Бюджет</th>
                        <th className="p-3 text-right">Без движения</th>
                        <th className="p-3 text-left">Причина риска</th>
                        <th className="p-3 text-right">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {(lossesAndLtv.riskDeals || []).map((deal: any) => (
                        <tr key={deal.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="p-3 font-semibold text-slate-900 dark:text-white">
                            <button
                              onClick={() =>
                                navigate(role === 'admin' ? `/admin/lead/${deal.id}` : `/lead/${deal.id}`)
                              }
                              className="hover:text-blue-500 text-left cursor-pointer"
                            >
                              {deal.name}
                            </button>
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">{deal.stageName}</td>
                          <td className="p-3 font-medium">{deal.managerName}</td>
                          <td className="p-3 text-right font-bold text-slate-900 dark:text-white">
                            {fmtMoney(deal.price)}
                          </td>
                          <td className="p-3 text-right text-slate-500">{deal.idleDays} дн.</td>
                          <td className="p-3">
                            {deal.riskType === 'no_task' && (
                              <span className="px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 font-semibold">
                                Нет поставленной задачи
                              </span>
                            )}
                            {deal.riskType === 'overdue_task' && (
                              <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold">
                                Задача просрочена
                              </span>
                            )}
                            {deal.riskType === 'stale_deal' && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                                Зависла &gt; 14 дней
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <a
                              href={deal.crmUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            >
                              <span>AmoCRM</span>
                              <ExternalLink size={12} />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
