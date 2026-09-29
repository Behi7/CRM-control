import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { userApi, adminApi, FilterParams } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { Sparkles, HelpCircle } from 'lucide-react';
import AiChatDrawer from '../components/AiChatDrawer';
import ThemeToggle from '../components/ThemeToggle';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { ManagerFilter } from '../components/ManagerFilter';
import { decodeJwt } from '../lib/jwt';

// Date presets
type DatePreset = 'all' | 'today' | 'yesterday' | '7days' | '30days' | 'thismonth' | 'custom';

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

export default function StatsPage() {
  const { accountId: paramAccountId } = useParams();
  const { role, logout } = useAuth();
  const { t, formatDuration, lang } = useLanguage();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [accountId] = useState<number | null>(
    paramAccountId ? parseInt(paramAccountId, 10) : null,
  );
  const storedPipelineId = Number(searchParams.get('pipeline'));
  const storedTagIds = (searchParams.get('tags') || '').split(',').filter(Boolean).map(Number).filter(Number.isInteger);
  const storedStatus = searchParams.get('status') || 'all';
  const storedManagerIds = (searchParams.get('managers') || '').split(',').filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0);
  const storedDateFrom = searchParams.get('dateFrom') || '';
  const storedDateTo = searchParams.get('dateTo') || '';
  const storedPreset = (searchParams.get('preset') || 'all') as DatePreset;
  let initialFrom = storedDateFrom;
  let initialTo = storedDateTo;
  if (initialFrom && initialTo && initialFrom > initialTo) {
    const tmp = initialFrom;
    initialFrom = initialTo;
    initialTo = tmp;
  }

  const [pipelineId, setPipelineId] = useState<number | null>(
    Number.isInteger(storedPipelineId) && storedPipelineId > 0 ? storedPipelineId : null,
  );
  const [selectedTags, setSelectedTags] = useState<number[]>(storedTagIds);
  const [selectedStatus, setSelectedStatus] = useState<string>(storedStatus);
  const [selectedManagers, setSelectedManagers] = useState<number[]>(storedManagerIds);
  const [datePreset, setDatePreset] = useState<DatePreset>(storedPreset);
  const [dateFrom, setDateFrom] = useState<string>(initialFrom);
  const [dateTo, setDateTo] = useState<string>(initialTo);

  const decodedAccountId = (() => {
    const token = localStorage.getItem('access_token');
    return decodeJwt(token)?.accountId ?? null;
  })();
  const effectiveAccountId = accountId ?? (role === 'viewer' ? decodedAccountId : null);
  const [chatOpen, setChatOpen] = useState(false);

  const aiStatus = useQuery({
    queryKey: ['ai-status', effectiveAccountId],
    queryFn: () => userApi.getAiStatus(effectiveAccountId!),
    enabled: !!effectiveAccountId,
  });

  const updateFilters = (
    nextPipelineId: number | null,
    nextTagIds: number[],
    nextStatus: string,
    nextManagerIds: number[],
    nextPreset: DatePreset,
    nextFrom: string,
    nextTo: string,
  ) => {
    const next = new URLSearchParams(searchParams);
    if (nextPipelineId) next.set('pipeline', String(nextPipelineId));
    else next.delete('pipeline');
    if (nextTagIds.length > 0) next.set('tags', nextTagIds.join(','));
    else next.delete('tags');
    if (nextStatus && nextStatus !== 'all') next.set('status', nextStatus);
    else next.delete('status');
    if (nextManagerIds.length > 0) next.set('managers', nextManagerIds.join(','));
    else next.delete('managers');
    if (nextPreset && nextPreset !== 'all') next.set('preset', nextPreset);
    else next.delete('preset');
    if (nextFrom) next.set('dateFrom', nextFrom);
    else next.delete('dateFrom');
    if (nextTo) next.set('dateTo', nextTo);
    else next.delete('dateTo');
    setSearchParams(next);
  };

  const handlePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset === 'custom') {
      updateFilters(pipelineId, selectedTags, selectedStatus, selectedManagers, 'custom', dateFrom, dateTo);
    } else {
      const { from, to } = getPresetDates(preset);
      setDateFrom(from);
      setDateTo(to);
      updateFilters(pipelineId, selectedTags, selectedStatus, selectedManagers, preset, from, to);
    }
  };

  const handleCustomDateChange = (from: string, to: string) => {
    let correctedFrom = from;
    let correctedTo = to;
    if (correctedFrom && correctedTo && correctedFrom > correctedTo) {
      const tmp = correctedFrom;
      correctedFrom = correctedTo;
      correctedTo = tmp;
    }
    setDateFrom(correctedFrom);
    setDateTo(correctedTo);
    updateFilters(pipelineId, selectedTags, selectedStatus, selectedManagers, 'custom', correctedFrom, correctedTo);
  };

  const adminAccounts = useQuery({
    queryKey: ['adminAccounts'],
    queryFn: adminApi.listAccounts,
    enabled: role === 'admin' && !paramAccountId,
  });

  const pipelines = useQuery({
    queryKey: ['pipelines', effectiveAccountId],
    queryFn: () => userApi.pipelines(effectiveAccountId!),
    enabled: !!effectiveAccountId,
  });

  useEffect(() => {
    if (!pipelineId && pipelines.data?.items?.length) {
      const firstId = pipelines.data.items[0].id;
      setPipelineId(firstId);
      updateFilters(firstId, selectedTags, selectedStatus, selectedManagers, datePreset, dateFrom, dateTo);
    }
  }, [pipelines.data, pipelineId]);

  useEffect(() => {
    const pId = Number(searchParams.get('pipeline'));
    const validPId = Number.isInteger(pId) && pId > 0 ? pId : null;
    const tIds = (searchParams.get('tags') || '').split(',').filter(Boolean).map(Number).filter(Number.isInteger);
    const st = searchParams.get('status') || 'all';
    const mIds = (searchParams.get('managers') || '').split(',').filter(Boolean).map(Number).filter(n => !isNaN(n) && n > 0);
    const dPreset = (searchParams.get('preset') || 'all') as DatePreset;
    let dFrom = searchParams.get('dateFrom') || '';
    let dTo = searchParams.get('dateTo') || '';
    if (dFrom && dTo && dFrom > dTo) {
      const tmp = dFrom;
      dFrom = dTo;
      dTo = tmp;
    }

    if (validPId !== pipelineId && validPId !== null) {
      setPipelineId(validPId);
    }
    setSelectedTags(prev => {
      if (prev.length === tIds.length && prev.every((v, i) => v === tIds[i])) return prev;
      return tIds;
    });
    setSelectedStatus(prev => (prev !== st ? st : prev));
    setSelectedManagers(prev => {
      if (prev.length === mIds.length && prev.every((v, i) => v === mIds[i])) return prev;
      return mIds;
    });
    setDatePreset(prev => (prev !== dPreset ? dPreset : prev));
    setDateFrom(prev => (prev !== dFrom ? dFrom : prev));
    setDateTo(prev => (prev !== dTo ? dTo : prev));
  }, [searchParams]);

  const tags = useQuery({
    queryKey: ['tags', effectiveAccountId],
    queryFn: () => userApi.tags(effectiveAccountId!),
    enabled: !!effectiveAccountId,
  });

  const managers = useQuery({
    queryKey: ['managers', effectiveAccountId],
    queryFn: () => userApi.managers(effectiveAccountId!),
    enabled: !!effectiveAccountId,
  });

  const filters: FilterParams = {
    tagIds: selectedTags,
    managerIds: selectedManagers,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    status: selectedStatus,
  };

  const stats = useQuery({
    queryKey: ['stats', pipelineId, filters],
    queryFn: () => userApi.stagesStats(pipelineId!, filters),
    enabled: !!pipelineId,
  });

  if (role === 'admin' && !paramAccountId && adminAccounts.data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">{t('select_client')}</h1>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <ThemeToggle />
            <button
              onClick={logout}
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              {t('logout')}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {adminAccounts.data?.map((a: any) => (
            <button
              key={a.id}
              onClick={() => nav(`/admin/stats/${a.id}`)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm text-left hover:shadow-md dark:hover:border-slate-700 transition-all cursor-pointer"
            >
              <div className="font-bold text-slate-900 dark:text-slate-100">{a.subdomain}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">{a.users?.[0]?.email}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const freshness = stats.data?.dataFreshness || pipelines.data?.dataFreshness;
  const datePresets: { id: DatePreset; label: string }[] = [
    { id: 'all', label: t('preset_all') },
    { id: 'today', label: t('preset_today') },
    { id: 'yesterday', label: t('preset_yesterday') },
    { id: '7days', label: t('preset_7days') },
    { id: '30days', label: t('preset_30days') },
    { id: 'thismonth', label: t('preset_thismonth') },
    { id: 'custom', label: t('preset_custom') },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Top Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">{t('stats_title')}</h1>
          <div className="flex items-center gap-3">
            <div className="flex gap-2 items-center">
              {aiStatus.data?.enabled && (
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm shadow-sm hover:shadow transition-all cursor-pointer group"
                  title={t('nav_ai_analyst_title')}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                  </span>
                  <Sparkles size={15} className="text-yellow-300 fill-yellow-300 group-hover:scale-110 transition-transform" />
                  <span>{t('nav_ai_analyst')}</span>
                </button>
              )}
              <button
                onClick={() => nav(role === 'admin' ? `/admin/search/${effectiveAccountId}` : '/search')}
                className="text-sm bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                {t('nav_search')}
              </button>
            </div>
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

        {/* Freshness banner */}
        {freshness && (
          <div
            className={`mb-4 p-3 rounded text-sm border ${
              freshness.isStale
                ? 'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-200 border-yellow-200 dark:border-yellow-900/50'
                : 'bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200 border-green-200 dark:border-green-900/50'
            }`}
          >
            {freshness.isStale ? t('data_stale') : '✓ '}
            {t('last_synced')}
            {freshness.lastSyncedAt
              ? new Date(freshness.lastSyncedAt).toLocaleString(lang === 'uz' ? 'uz-UZ' : 'ru-RU')
              : t('sync_never')}
          </div>
        )}

        {/* Pipeline + Status */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm mb-4 flex flex-col md:flex-row md:items-end gap-4">
          <div className="md:w-72 shrink-0">
            <label className="block text-sm font-medium mb-2 text-slate-900 dark:text-slate-100">{t('pipeline')}</label>
            <select
              value={pipelineId || ''}
              onChange={(e) => {
                const nextPipelineId = parseInt(e.target.value, 10) || null;
                setPipelineId(nextPipelineId);
                updateFilters(nextPipelineId, selectedTags, selectedStatus, selectedManagers, datePreset, dateFrom, dateTo);
              }}
              className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">{t('select_pipeline')}</option>
              {pipelines.data?.items.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium mb-2 text-slate-900 dark:text-slate-100">{t('deal_status')}</label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: t('status_all') },
                { id: 'won', label: t('status_won') },
                { id: 'lost', label: t('status_lost') },
                { id: 'open', label: t('status_open') },
              ].map((opt) => {
                const active = selectedStatus === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSelectedStatus(opt.id);
                      updateFilters(pipelineId, selectedTags, opt.id, selectedManagers, datePreset, dateFrom, dateTo);
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Manager Filter */}
        <ManagerFilter
          managers={managers.data?.items}
          selectedManagers={selectedManagers}
          onChange={(nextManagerIds) => {
            setSelectedManagers(nextManagerIds);
            updateFilters(pipelineId, selectedTags, selectedStatus, nextManagerIds, datePreset, dateFrom, dateTo);
          }}
        />

        {/* Date Filter */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm mb-4">
          <label className="block text-sm font-medium mb-2 text-slate-900 dark:text-slate-100">{t('created_period')}</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {datePresets.map((preset) => {
              const active = datePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetChange(preset.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => handleCustomDateChange(e.target.value, dateTo)}
                className="p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-slate-400">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => handleCustomDateChange(dateFrom, e.target.value)}
                className="p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {/* Tag Filter */}
        {(tags.data?.items?.length ?? 0) > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">{t('filter_tags')}</label>
              {selectedTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTags([]);
                    updateFilters(pipelineId, [], selectedStatus, selectedManagers, datePreset, dateFrom, dateTo);
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {t('reset')} ({selectedTags.length})
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.data?.items?.map((tg: any) => {
                const isSelected = selectedTags.includes(tg.id);
                return (
                  <button
                    key={tg.id}
                    type="button"
                    onClick={() => {
                      const nextTagIds = isSelected
                        ? selectedTags.filter((x) => x !== tg.id)
                        : [...selectedTags, tg.id];
                      setSelectedTags(nextTagIds);
                      updateFilters(pipelineId, nextTagIds, selectedStatus, selectedManagers, datePreset, dateFrom, dateTo);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
                    }`}
                  >
                    {tg.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Stages Stats Table */}
        {stats.data && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200">
                <tr>
                  <th className="p-3 text-left">{t('col_stage')}</th>
                  <th className="p-3 text-right">
                    <span className="inline-flex items-center gap-1">
                      {t('col_avg_time_actual')}
                      <span title={t('tooltip_actual')} className="cursor-help text-slate-400"><HelpCircle size={13} /></span>
                    </span>
                  </th>
                  <th className="p-3 text-right">
                    <span className="inline-flex items-center gap-1">
                      {t('col_avg_time_skips')}
                      <span title={t('tooltip_skips')} className="cursor-help text-slate-400"><HelpCircle size={13} /></span>
                    </span>
                  </th>
                  <th className="p-3 text-right">
                    <span className="inline-flex items-center gap-1">
                      {t('col_skips')}
                      <span title={t('tooltip_skips_count')} className="cursor-help text-slate-400"><HelpCircle size={13} /></span>
                    </span>
                  </th>
                  <th className="p-3 text-right">
                    <span className="inline-flex items-center gap-1">
                      {t('col_passed_stage')}
                      <span title={t('tooltip_passed')} className="cursor-help text-slate-400"><HelpCircle size={13} /></span>
                    </span>
                  </th>
                  <th className="p-3 text-right">
                    <span className="inline-flex items-center gap-1">
                      {t('col_active_stage')}
                      <span title={t('tooltip_active')} className="cursor-help text-slate-400"><HelpCircle size={13} /></span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.data.items.map((s: any) => {
                  const isWon = s.externalId === '142';
                  const isLost = s.externalId === '143';
                  const rowBg = isWon
                    ? 'bg-green-50/40 dark:bg-green-950/25 hover:bg-green-50 dark:hover:bg-green-950/40'
                    : isLost
                    ? 'bg-red-50/40 dark:bg-red-950/25 hover:bg-red-50 dark:hover:bg-red-950/40'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50';

                  return (
                    <tr
                      key={s.stageId}
                      className={`border-t border-slate-200 dark:border-slate-800 cursor-pointer transition-colors ${rowBg}`}
                      onClick={() => {
                        const path = role === 'admin' ? `/admin/stage/${s.stageId}` : `/stage/${s.stageId}`;
                        const params = new URLSearchParams();
                        if (selectedTags.length > 0) params.set('tags', selectedTags.join(','));
                        if (selectedStatus && selectedStatus !== 'all') params.set('status', selectedStatus);
                        if (selectedManagers.length > 0) params.set('managers', selectedManagers.join(','));
                        if (dateFrom) params.set('dateFrom', dateFrom);
                        if (dateTo) params.set('dateTo', dateTo);
                        const qs = params.toString();
                        nav(qs ? `${path}?${qs}` : path);
                      }}
                    >
                      <td className="p-3 font-medium text-slate-900 dark:text-slate-100">
                        {s.name}
                      </td>
                      <td className="p-3 text-right text-slate-700 dark:text-slate-300">
                        {isWon || isLost ? '—' : formatDuration(s.avgSecondsActual)}
                      </td>
                      <td className="p-3 text-right text-slate-700 dark:text-slate-300">
                        {isWon || isLost ? '—' : formatDuration(s.avgSecondsIncludingSkips)}
                      </td>
                      <td className="p-3 text-right text-slate-700 dark:text-slate-300">
                        {isWon || isLost ? '—' : s.skipsCount}
                      </td>
                      <td className="p-3 text-right text-slate-700 dark:text-slate-300">
                        {s.leadsCount}
                      </td>
                      <td className="p-3 text-right text-slate-700 dark:text-slate-300">
                        {s.activeLeadsCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Floating AI Action Button */}
        {aiStatus.data?.enabled && !chatOpen && (
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all cursor-pointer group"
            title={t('nav_ai_analyst_title')}
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </span>
            <Sparkles size={18} className="text-yellow-300 fill-yellow-300 group-hover:scale-110 transition-transform" />
            <span className="text-sm">{t('nav_ai_analyst')}</span>
          </button>
        )}

        {/* AI Chat Drawer */}
        {effectiveAccountId && (
          <AiChatDrawer
            accountId={effectiveAccountId}
            isOpen={chatOpen}
            onClose={() => setChatOpen(false)}
            pipelineId={pipelineId}
            pipelineName={pipelines.data?.items?.find((p: any) => p.id === pipelineId)?.name}
            filters={filters}
            modelName={aiStatus.data?.model}
          />
        )}
      </div>
    </div>
  );
}
