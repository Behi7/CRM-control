import { useState, useRef, useEffect } from 'react';
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
  Tag as TagIcon,
  ShieldAlert,
  Repeat,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Check,
  Search,
  X,
} from 'lucide-react';
import { py2Api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { decodeJwt } from '../lib/jwt';

type DatePreset = 'all' | 'today' | 'yesterday' | '7days' | '30days' | 'thismonth' | 'custom';
type BiTab = 'overview' | 'managers' | 'marketing' | 'losses_ltv';

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

  // Draft filter states (only applied when user clicks "Применить")
  const [pipelineId, setPipelineId] = useState<number | null>(
    Number(searchParams.get('pipeline')) || null,
  );
  const [selectedManagerIds, setSelectedManagerIds] = useState<number[]>(() =>
    (searchParams.get('managers') || '')
      .split(',')
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0),
  );
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(() =>
    (searchParams.get('tags') || '')
      .split(',')
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0),
  );
  const [datePreset, setDatePreset] = useState<DatePreset>(
    (searchParams.get('preset') as DatePreset) || 'all',
  );
  const [dateFrom, setDateFrom] = useState<string>(searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState<string>(searchParams.get('dateTo') || '');

  // Applied filter states (drives the API query)
  const [appliedFilters, setAppliedFilters] = useState(() => ({
    pipelineId: Number(searchParams.get('pipeline')) || null,
    managerIds: (searchParams.get('managers') || '')
      .split(',')
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0),
    tagIds: (searchParams.get('tags') || '')
      .split(',')
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0),
    datePreset: ((searchParams.get('preset') as DatePreset) || 'all') as DatePreset,
    dateFrom: searchParams.get('dateFrom') || '',
    dateTo: searchParams.get('dateTo') || '',
  }));

  const [selectedCustomFieldName, setSelectedCustomFieldName] = useState<string>('ALL');

  const isDirty =
    pipelineId !== appliedFilters.pipelineId ||
    datePreset !== appliedFilters.datePreset ||
    dateFrom !== appliedFilters.dateFrom ||
    dateTo !== appliedFilters.dateTo ||
    selectedManagerIds.join(',') !== appliedFilters.managerIds.join(',') ||
    selectedTagIds.join(',') !== appliedFilters.tagIds.join(',');

  const syncUrlParams = (
    nextPipe: number | null,
    nextManagers: number[],
    nextTags: number[],
    nextPreset: DatePreset,
    nextFrom: string,
    nextTo: string,
  ) => {
    const next = new URLSearchParams(searchParams);
    if (nextPipe) next.set('pipeline', String(nextPipe));
    else next.delete('pipeline');
    if (nextManagers.length > 0) next.set('managers', nextManagers.join(','));
    else next.delete('managers');
    if (nextTags.length > 0) next.set('tags', nextTags.join(','));
    else next.delete('tags');
    if (nextPreset !== 'all') next.set('preset', nextPreset);
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

  const handleApplyFilters = () => {
    setAppliedFilters({
      pipelineId,
      managerIds: [...selectedManagerIds],
      tagIds: [...selectedTagIds],
      datePreset,
      dateFrom,
      dateTo,
    });
    syncUrlParams(pipelineId, selectedManagerIds, selectedTagIds, datePreset, dateFrom, dateTo);
  };

  const handleResetFilters = () => {
    setPipelineId(null);
    setSelectedManagerIds([]);
    setSelectedTagIds([]);
    setDatePreset('all');
    setDateFrom('');
    setDateTo('');
    setAppliedFilters({
      pipelineId: null,
      managerIds: [],
      tagIds: [],
      datePreset: 'all',
      dateFrom: '',
      dateTo: '',
    });
    syncUrlParams(null, [], [], 'all', '', '');
  };

  const biQuery = useQuery({
    queryKey: [
      'py2-bi-analytics',
      effectiveAccountId,
      appliedFilters.pipelineId,
      appliedFilters.dateFrom,
      appliedFilters.dateTo,
      appliedFilters.managerIds,
      appliedFilters.tagIds,
    ],
    queryFn: () =>
      py2Api.analytics(effectiveAccountId!, {
        pipelineId: appliedFilters.pipelineId,
        dateFrom: appliedFilters.dateFrom || undefined,
        dateTo: appliedFilters.dateTo || undefined,
        managerIds: appliedFilters.managerIds.length > 0 ? appliedFilters.managerIds : undefined,
        tagIds: appliedFilters.tagIds.length > 0 ? appliedFilters.tagIds : undefined,
      }),
    enabled: !!effectiveAccountId,
  });

  const enrichMut = useMutation({
    mutationFn: () => py2Api.triggerEnrich(effectiveAccountId!),
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['py2-bi-analytics', effectiveAccountId] });
      }, 4000);
    },
  });

  const data = biQuery.data;
  const kpis = data?.kpis;
  const pipelines = data?.filtersMeta?.pipelines || [];
  const managersList: MultiSelectOption[] = data?.filtersMeta?.managers || [];
  const tagsList: MultiSelectOption[] = data?.filtersMeta?.tags || [];
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
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
            Детальная аналитика продаж AmoCRM
          </h1>
          {data?.account && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Аккаунт: <strong className="text-slate-700 dark:text-slate-200">{data.account.subdomain}.{data.account.baseDomain}</strong>
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
        </div>
      </div>



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
            onChange={(e) => {
              const nextPipe = e.target.value ? Number(e.target.value) : null;
              setPipelineId(nextPipe);
            }}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
          >
            <option value="">Все воронки ({pipelines.length})</option>
            {pipelines.map((p: any) => (
              <option key={p.id} value={p.id}>
                Воронка: {p.name}
              </option>
            ))}
          </select>

          {/* Multi-select Managers */}
          <MultiSelectDropdown
            label="Менеджеры"
            placeholder="Все менеджеры"
            options={managersList}
            selectedIds={selectedManagerIds}
            icon={<Users size={13} />}
            onChange={(nextIds) => setSelectedManagerIds(nextIds)}
          />

          {/* Multi-select Tags */}
          <MultiSelectDropdown
            label="Теги"
            placeholder="Все теги"
            options={tagsList}
            selectedIds={selectedTagIds}
            prefix="#"
            icon={<TagIcon size={13} />}
            onChange={(nextIds) => setSelectedTagIds(nextIds)}
          />

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

          {/* Action buttons: Применить & Сбросить */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handleApplyFilters}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isDirty
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md ring-2 ring-indigo-400/40'
                  : 'bg-indigo-600/90 hover:bg-indigo-600 text-white shadow-xs'
              }`}
            >
              <Check size={14} />
              <span>Применить</span>
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 dark:hover:border-rose-700 text-xs font-medium transition-colors cursor-pointer"
            >
              <X size={14} />
              <span>Сбросить</span>
            </button>
          </div>
        </div>

        {/* Active multi-select badges */}
        {(selectedManagerIds.length > 0 || selectedTagIds.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            {selectedManagerIds.map((id) => {
              const m = managersList.find((x) => x.id === id);
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
                    onClick={() => setSelectedManagerIds(selectedManagerIds.filter((x) => x !== id))}
                    className="ml-0.5 hover:text-rose-500 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })}
            {selectedTagIds.map((id) => {
              const t = tagsList.find((x) => x.id === id);
              if (!t) return null;
              return (
                <span
                  key={`t-${id}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 text-[11px] font-medium"
                >
                  <span>#{t.name}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedTagIds(selectedTagIds.filter((x) => x !== id))}
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

      {/* Navigation Tabs inside Module 02 (Funnel & Money Leaks removed as stage time analysis is in Module 01) */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {[
          { id: 'overview', label: '1. Обзор и Финансы', icon: DollarSign },
          { id: 'managers', label: '2. Менеджеры и Дисциплина', icon: Award },
          { id: 'marketing', label: '3. Маркетинг, UTM и Поля', icon: TagIcon },
          { id: 'losses_ltv', label: '4. Причины отказа, LTV и Риски', icon: ShieldAlert },
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

              {/* Monthly Timeseries Table */}
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

          {/* ================= TAB 2: MANAGERS & DISCIPLINE ================= */}
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

          {/* ================= TAB 3: MARKETING, UTM, TAGS & CUSTOM FIELDS ================= */}
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

          {/* ================= TAB 4: LOSS REASONS, LTV & RISK AUDIT ================= */}
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
