import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { userApi, adminApi, FilterParams } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import {
  Sparkles,
  HelpCircle,
  Filter,
  Users,
  Tag as TagIcon,
  ChevronDown,
  Check,
  Search,
  X,
} from 'lucide-react';
import AiChatDrawer from '../components/AiChatDrawer';
import { decodeJwt } from '../lib/jwt';

interface MultiSelectOption {
  id: number;
  name: string;
}

interface MultiSelectDropdownProps {
  label: string;
  placeholder: string;
  options: MultiSelectOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  prefix?: string;
  icon?: React.ReactNode;
}

function MultiSelectDropdown({
  label,
  placeholder,
  options,
  selectedIds,
  onChange,
  prefix = '',
  icon,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter((o) =>
    o.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const toggleId = (id: number) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectAllFiltered = () => {
    const next = Array.from(new Set([...selectedIds, ...filtered.map((o) => o.id)]));
    onChange(next);
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
          selectedIds.length > 0
            ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-400 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300'
            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
      >
        {icon}
        <span>
          {selectedIds.length === 0
            ? `${placeholder} (${options.length})`
            : `${label}: выбрано ${selectedIds.length}`}
        </span>
        {selectedIds.length > 0 && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            className="ml-0.5 px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[10px] font-bold hover:bg-rose-500 transition-colors"
            title="Сбросить выбор"
          >
            ✕
          </span>
        )}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 p-3 space-y-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по списку..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] px-1 pt-0.5">
            <button
              type="button"
              onClick={selectAllFiltered}
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
            >
              Выбрать все ({filtered.length})
            </button>
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-rose-500 hover:underline font-medium cursor-pointer"
              >
                Сбросить ({selectedIds.length})
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 pr-1">
            {filtered.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">Ничего не найдено</div>
            ) : (
              filtered.map((item) => {
                const checked = selectedIds.includes(item.id);
                return (
                  <label
                    key={item.id}
                    onClick={() => toggleId(item.id)}
                    className="flex items-center justify-between gap-2 py-2 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/70 cursor-pointer text-xs select-none"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                          checked
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                        }`}
                      >
                        {checked && <Check size={11} strokeWidth={3} />}
                      </div>
                      <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                        {prefix}
                        {item.name}
                      </span>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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

  const [applied, setApplied] = useState(() => ({
    pipelineId: Number.isInteger(storedPipelineId) && storedPipelineId > 0 ? storedPipelineId : null,
    tagIds: storedTagIds,
    status: storedStatus,
    managerIds: storedManagerIds,
    datePreset: storedPreset,
    dateFrom: initialFrom,
    dateTo: initialTo,
  }));

  const isStDirty =
    pipelineId !== applied.pipelineId ||
    selectedStatus !== applied.status ||
    datePreset !== applied.datePreset ||
    dateFrom !== applied.dateFrom ||
    dateTo !== applied.dateTo ||
    selectedTags.join(',') !== applied.tagIds.join(',') ||
    selectedManagers.join(',') !== applied.managerIds.join(',');

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
    if (preset !== 'custom') {
      const { from, to } = getPresetDates(preset);
      setDateFrom(from);
      setDateTo(to);
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
  };

  const handleApplyStFilters = () => {
    setApplied({
      pipelineId,
      tagIds: [...selectedTags],
      status: selectedStatus,
      managerIds: [...selectedManagers],
      datePreset,
      dateFrom,
      dateTo,
    });
    updateFilters(pipelineId, selectedTags, selectedStatus, selectedManagers, datePreset, dateFrom, dateTo);
  };

  const handleResetStFilters = () => {
    const firstId = pipelines.data?.items?.[0]?.id || pipelineId;
    setPipelineId(firstId);
    setSelectedTags([]);
    setSelectedStatus('all');
    setSelectedManagers([]);
    setDatePreset('all');
    setDateFrom('');
    setDateTo('');
    setApplied({
      pipelineId: firstId,
      tagIds: [],
      status: 'all',
      managerIds: [],
      datePreset: 'all',
      dateFrom: '',
      dateTo: '',
    });
    updateFilters(firstId, [], 'all', [], 'all', '', '');
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
      setApplied((prev) => ({ ...prev, pipelineId: firstId }));
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
    tagIds: applied.tagIds,
    managerIds: applied.managerIds,
    dateFrom: applied.dateFrom || undefined,
    dateTo: applied.dateTo || undefined,
    status: applied.status,
  };

  const stats = useQuery({
    queryKey: ['stats', applied.pipelineId, filters],
    queryFn: () => userApi.stagesStats(applied.pipelineId!, filters),
    enabled: !!applied.pipelineId,
  });

  if (role === 'admin' && !paramAccountId && adminAccounts.data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t('select_client')}</h1>
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
        {aiStatus.data?.enabled && (
          <div className="flex justify-end mb-4">
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
          </div>
        )}



        {/* Unified Filter Bar (matching Module 02 UI) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Filter size={14} />
              <span>Фильтры:</span>
            </div>

            {/* Pipeline selector */}
            <select
              value={pipelineId || ''}
              onChange={(e) => {
                const nextPipelineId = parseInt(e.target.value, 10) || null;
                setPipelineId(nextPipelineId);
              }}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
            >
              {pipelines.data?.items?.map((p: any) => (
                <option key={p.id} value={p.id}>
                  Воронка: {p.name}
                </option>
              ))}
            </select>

            {/* Deal status selector */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
            >
              <option value="all">{t('status_all')}</option>
              <option value="won">{t('status_won')}</option>
              <option value="lost">{t('status_lost')}</option>
              <option value="open">{t('status_open')}</option>
            </select>

            {/* Multi-select Managers */}
            <MultiSelectDropdown
              label="Менеджеры"
              placeholder="Все менеджеры"
              options={managers.data?.items || []}
              selectedIds={selectedManagers}
              icon={<Users size={13} />}
              onChange={(nextIds) => setSelectedManagers(nextIds)}
            />

            {/* Multi-select Tags */}
            <MultiSelectDropdown
              label="Теги"
              placeholder="Все теги"
              options={tags.data?.items || []}
              selectedIds={selectedTags}
              prefix="#"
              icon={<TagIcon size={13} />}
              onChange={(nextIds) => setSelectedTags(nextIds)}
            />

            {/* Date presets */}
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              {datePresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetChange(preset.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    datePreset === preset.id
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {datePreset === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => handleCustomDateChange(e.target.value, dateTo)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs"
                />
                <span className="text-slate-400">—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => handleCustomDateChange(dateFrom, e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs"
                />
              </div>
            )}

            {/* Action buttons: Применить & Сбросить */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={handleApplyStFilters}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isStDirty
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md ring-2 ring-indigo-400/40'
                    : 'bg-indigo-600/90 hover:bg-indigo-600 text-white shadow-xs'
                }`}
              >
                <Check size={14} />
                <span>Применить</span>
              </button>
              <button
                type="button"
                onClick={handleResetStFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 dark:hover:border-rose-700 text-xs font-medium transition-colors cursor-pointer"
              >
                <X size={14} />
                <span>Сбросить</span>
              </button>
            </div>
          </div>

          {/* Active multi-select badges */}
          {(selectedManagers.length > 0 || selectedTags.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              {selectedManagers.map((id) => {
                const m = (managers.data?.items || []).find((x: any) => x.id === id);
                if (!m) return null;
                return (
                  <span
                    key={`m-${id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 text-[11px] font-medium"
                  >
                    <Users size={11} />
                    <span>{m.name}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedManagers(selectedManagers.filter((x) => x !== id))}
                      className="ml-0.5 hover:text-rose-500 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
              {selectedTags.map((id) => {
                const tg = (tags.data?.items || []).find((x: any) => x.id === id);
                if (!tg) return null;
                return (
                  <span
                    key={`t-${id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 text-[11px] font-medium"
                  >
                    <span>#{tg.name}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedTags(selectedTags.filter((x) => x !== id))}
                      className="ml-0.5 hover:text-rose-500 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

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
