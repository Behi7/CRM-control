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
  Sparkles,
} from 'lucide-react';
import { py2Api, userApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { decodeJwt } from '../lib/jwt';
import AiChatDrawer from '../components/AiChatDrawer';

type DatePreset = 'all' | 'today' | 'yesterday' | '7days' | '30days' | 'thismonth' | 'custom';
type BiTab = 'overview' | 'managers' | 'marketing' | 'losses_ltv' | 'custom_fields' | 'risk_audit';

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

function fmtCount(val: number | undefined | null): string {
  if (val == null || isNaN(val)) return '0';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(val));
}

export default function BiAnalyticsPage() {
  const { accountId: paramAccountId } = useParams<{ accountId?: string }>();
  const { role } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [chatOpen, setChatOpen] = useState(false);
  const [isWideScreen, setIsWideScreen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1280 : true,
  );

  useEffect(() => {
    const handleResize = () => {
      setIsWideScreen(window.innerWidth >= 1280);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const decodedAccountId = (() => {
    const token = localStorage.getItem('access_token');
    return decodeJwt(token)?.accountId ?? null;
  })();

  const storedAccId = Number(localStorage.getItem('active_account_id')) || null;
  const effectiveAccountId =
    (paramAccountId ? parseInt(paramAccountId, 10) : null) ??
    (role === 'viewer' ? decodedAccountId : storedAccId ?? 1);

  // AI Status query
  const aiStatus = useQuery({
    queryKey: ['ai-status', effectiveAccountId],
    queryFn: () => userApi.getAiStatus(effectiveAccountId!),
    enabled: !!effectiveAccountId,
  });

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
  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([]);
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
    sourceIds: [] as number[],
    datePreset: ((searchParams.get('preset') as DatePreset) || 'all') as DatePreset,
    dateFrom: searchParams.get('dateFrom') || '',
    dateTo: searchParams.get('dateTo') || '',
  }));

  const [selectedCustomFieldName, setSelectedCustomFieldName] = useState<string>('ALL');
  const [mountainMode, setMountainMode] = useState<'count' | 'money'>('count');
  const [mountainZoom, setMountainZoom] = useState<string>('last12');
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);

  const isDirty =
    pipelineId !== appliedFilters.pipelineId ||
    datePreset !== appliedFilters.datePreset ||
    dateFrom !== appliedFilters.dateFrom ||
    dateTo !== appliedFilters.dateTo ||
    selectedManagerIds.join(',') !== appliedFilters.managerIds.join(',') ||
    selectedTagIds.join(',') !== appliedFilters.tagIds.join(',') ||
    selectedSourceIds.join(',') !== appliedFilters.sourceIds.join(',');

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
      sourceIds: [...selectedSourceIds],
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
    setSelectedSourceIds([]);
    setDatePreset('all');
    setDateFrom('');
    setDateTo('');
    setAppliedFilters({
      pipelineId: null,
      managerIds: [],
      tagIds: [],
      sourceIds: [],
      datePreset: 'all',
      dateFrom: '',
      dateTo: '',
    });
    syncUrlParams(null, [], [], 'all', '', '');
  };

  const prevSourcesRef = useRef<MultiSelectOption[]>([]);

  const biQuery = useQuery({
    queryKey: [
      'py2-bi-analytics',
      effectiveAccountId,
      appliedFilters.pipelineId,
      appliedFilters.dateFrom,
      appliedFilters.dateTo,
      appliedFilters.managerIds,
      appliedFilters.tagIds,
      appliedFilters.sourceIds,
    ],
    queryFn: () => {
      const activeSourceNames = appliedFilters.sourceIds
        .map((id: number) => prevSourcesRef.current.find((s) => s.id === id)?.name)
        .filter(Boolean) as string[];
      return py2Api.analytics(effectiveAccountId!, {
        pipelineId: appliedFilters.pipelineId,
        dateFrom: appliedFilters.dateFrom || undefined,
        dateTo: appliedFilters.dateTo || undefined,
        managerIds: appliedFilters.managerIds.length > 0 ? appliedFilters.managerIds : undefined,
        tagIds: appliedFilters.tagIds.length > 0 ? appliedFilters.tagIds : undefined,
        sources: activeSourceNames.length > 0 ? activeSourceNames : undefined,
      });
    },
    enabled: !!effectiveAccountId,
  });
  if (biQuery.data?.filtersMeta?.sources?.length) {
    prevSourcesRef.current = biQuery.data.filtersMeta.sources;
  }

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
  const sourcesList: MultiSelectOption[] = data?.filtersMeta?.sources || [];
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
    <div className={`p-4 lg:p-6 mx-auto transition-all ${chatOpen && isWideScreen ? 'max-w-[1920px]' : 'max-w-[1600px]'}`}>
      <div className="flex gap-6 items-start">
        {/* Main Analytics Content */}
        <div className={`space-y-6 transition-all duration-300 ${chatOpen && isWideScreen ? 'flex-1 min-w-0' : 'w-full'}`}>
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

          {/* Multi-select Lead Sources */}
          <MultiSelectDropdown
            label="Источники"
            placeholder="Все источники"
            options={sourcesList}
            selectedIds={selectedSourceIds}
            icon={<Target size={13} />}
            onChange={(nextIds) => setSelectedSourceIds(nextIds)}
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

      {/* Navigation Tabs inside Module 02 */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {[
          { id: 'overview', label: '1. Обзор и Финансы', icon: DollarSign },
          { id: 'managers', label: '2. Менеджеры и Дисциплина', icon: Award },
          { id: 'marketing', label: '3. Маркетинг и Теги', icon: TagIcon },
          { id: 'losses_ltv', label: '4. Причины отказа', icon: XCircle },
          { id: 'custom_fields', label: '5. Кастомные поля', icon: Filter },
          { id: 'risk_audit', label: '6. Сделки в зоне риска', icon: ShieldAlert },
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
                    {fmtCount(lossesAndLtv.ltv?.repeatContacts || 0)} повторных
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5">
                    Всего контактов: <strong>{fmtCount(lossesAndLtv.ltv?.uniqueContacts || 0)}</strong> ({lossesAndLtv.ltv?.repeatRatePercent || 0}% Repeat)
                  </div>
                </div>


              </div>

              {/* Analytical Charts: Full-Width Smooth Mountain Area Chart + Portfolio Structure Donut */}
              {(() => {
                const totalPortfolio = (kpis.totalRevenue || 0) + (kpis.openPipelineValue || 0) + (kpis.lostRevenue || 0);
                const wonMoneyPct = totalPortfolio > 0 ? Math.round((kpis.totalRevenue / totalPortfolio) * 1000) / 10 : 0;
                const openMoneyPct = totalPortfolio > 0 ? Math.round((kpis.openPipelineValue / totalPortfolio) * 1000) / 10 : 0;
                const lostMoneyPct = totalPortfolio > 0 ? Math.max(0, Math.round((100 - wonMoneyPct - openMoneyPct) * 10) / 10) : 0;

                const totalDealsCount = kpis.totalLeads || 1;
                const wonCountPct = Math.round(((kpis.wonLeads || 0) / totalDealsCount) * 1000) / 10;
                const openCountPct = Math.round(((kpis.openLeads || 0) / totalDealsCount) * 1000) / 10;
                const lostCountPct = Math.max(0, Math.round((100 - wonCountPct - openCountPct) * 10) / 10);

                const C = 2 * Math.PI * 50;
                const wonDash = (wonMoneyPct / 100) * C;
                const openDash = (openMoneyPct / 100) * C;
                const lostDash = (lostMoneyPct / 100) * C;

                const rawPts: any[] = timeseries || [];
                const availableYears: string[] = Array.from(
                  new Set(rawPts.map((p: any) => String(p.period || '').slice(0, 4)).filter(Boolean)),
                ).sort();

                // Apply local chart zoom (without touching global filters!)
                let pts: any[] = [];
                if (mountainZoom === 'by_year') {
                  const byYearMap = new Map<string, any>();
                  for (const p of rawPts) {
                    const y = String(p.period || '').slice(0, 4);
                    if (!y) continue;
                    const prev = byYearMap.get(y) || {
                      period: `${y} г.`,
                      totalLeads: 0,
                      wonLeads: 0,
                      lostLeads: 0,
                      openLeads: 0,
                      revenue: 0,
                      lostValue: 0,
                      openValue: 0,
                    };
                    prev.totalLeads += Number(p.totalLeads || 0);
                    prev.wonLeads += Number(p.wonLeads || 0);
                    prev.lostLeads += Number(p.lostLeads || 0);
                    prev.openLeads += Number(p.openLeads || 0);
                    prev.revenue += Number(p.revenue || 0);
                    prev.lostValue += Number(p.lostValue || 0);
                    prev.openValue += Number(p.openValue || 0);
                    byYearMap.set(y, prev);
                  }
                  pts = Array.from(byYearMap.values());
                } else if (mountainZoom === 'last6') {
                  pts = rawPts.slice(-6);
                } else if (mountainZoom === 'last12') {
                  pts = rawPts.slice(-12);
                } else if (mountainZoom === 'all') {
                  pts = rawPts;
                } else if (availableYears.includes(mountainZoom)) {
                  pts = rawPts.filter((p: any) => String(p.period || '').startsWith(mountainZoom));
                } else {
                  pts = rawPts.slice(-12);
                }

                const n = pts.length;
                const W = 1080;
                const H = 300;
                const padL = 62;
                const padR = 32;
                const padT = 30;
                const padB = 44;
                const chartW = W - padL - padR;
                const chartH = H - padT - padB;
                const baseY = padT + chartH;

                const getWon = (p: any) => (mountainMode === 'count' ? Number(p.wonLeads || 0) : Number(p.revenue || 0));
                const getLost = (p: any) => (mountainMode === 'count' ? Number(p.lostLeads || 0) : Number(p.lostValue || 0));
                const getOpen = (p: any) => (mountainMode === 'count' ? Number(p.openLeads || 0) : Number(p.openValue || 0));

                const rawMax = Math.max(
                  ...pts.map((p: any) => Math.max(getWon(p), getLost(p), getOpen(p))),
                  1,
                );
                const maxVal = Math.ceil(rawMax * 1.12);

                const xAt = (i: number) => (n <= 1 ? padL + chartW / 2 : padL + (i / (n - 1)) * chartW);
                const yAt = (val: number) => padT + chartH - (Math.min(val, maxVal) / maxVal) * chartH;

                // Smooth monotone cubic Bezier path builder so mountains look smooth and never overshoot baseY
                const buildSmoothPath = (getter: (p: any) => number) => {
                  if (n === 0) return { strokePath: '', areaPath: '' };
                  const points = pts.map((p: any, i: number) => ({ x: xAt(i), y: yAt(getter(p)) }));
                  if (points.length === 1) {
                    const pt = points[0];
                    const strokePath = `M ${padL} ${pt.y} L ${W - padR} ${pt.y}`;
                    const areaPath = `${strokePath} L ${W - padR} ${baseY} L ${padL} ${baseY} Z`;
                    return { strokePath, areaPath };
                  }
                  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
                  for (let i = 0; i < points.length - 1; i++) {
                    const p0 = points[i];
                    const p1 = points[i + 1];
                    const cpx1 = p0.x + (p1.x - p0.x) * 0.42;
                    const cpx2 = p1.x - (p1.x - p0.x) * 0.42;
                    d += ` C ${cpx1.toFixed(1)} ${p0.y.toFixed(1)}, ${cpx2.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
                  }
                  const areaPath = `${d} L ${points[points.length - 1].x.toFixed(1)} ${baseY} L ${points[0].x.toFixed(1)} ${baseY} Z`;
                  return { strokePath: d, areaPath };
                };

                const lostSmooth = buildSmoothPath(getLost);
                const openSmooth = buildSmoothPath(getOpen);
                const wonSmooth = buildSmoothPath(getWon);

                const activeIdx =
                  hoveredPointIdx != null && hoveredPointIdx >= 0 && hoveredPointIdx < n
                    ? hoveredPointIdx
                    : n > 0
                    ? n - 1
                    : null;
                const activePt = activeIdx != null ? pts[activeIdx] : null;
                const labelStep = Math.max(1, Math.ceil(n / 12));
                const showValueBadges = n <= 12;

                const fmtCompact = (v: number) => {
                  if (mountainMode === 'money') {
                    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)} млрд`;
                    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} млн`;
                    if (v >= 1_000) return `${Math.round(v / 1_000)} тыс`;
                  }
                  return fmtCount(v);
                };

                return (
                  <div className="space-y-6">
                    {/* FULL-WIDTH SMOOTH MOUNTAIN CHART */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
                      {/* Header & Instant Zoom Controls */}
                      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div>
                          <h3 className="text-base font-bold text-slate-900 dark:text-white">
                            График-горы: Успешно реализованные (Won) vs Нереализованные (Отказ)
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Наведите курсор на любой месяц для точных цифр • Переключайте масштаб и годы прямо на графике без изменения общего фильтра
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {/* Zoom & Year selector pills */}
                          <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                            {[
                              { id: 'last6', label: '6 мес.' },
                              { id: 'last12', label: '12 мес.' },
                              { id: 'all', label: `Все (${rawPts.length})` },
                              ...(availableYears.length > 1 ? [{ id: 'by_year', label: 'По годам' }] : []),
                              ...availableYears.map((y) => ({ id: y, label: `${y} г.` })),
                            ].map((z) => (
                              <button
                                key={z.id}
                                type="button"
                                onClick={() => {
                                  setMountainZoom(z.id);
                                  setHoveredPointIdx(null);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                  mountainZoom === z.id
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                }`}
                              >
                                {z.label}
                              </button>
                            ))}
                          </div>

                          {/* Metric mode toggle */}
                          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                            <button
                              type="button"
                              onClick={() => setMountainMode('count')}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                mountainMode === 'count'
                                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              Сделки (шт.)
                            </button>
                            <button
                              type="button"
                              onClick={() => setMountainMode('money')}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                mountainMode === 'money'
                                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              Бюджет (сум)
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Interactive Live Readout Bar for Hovered / Selected Period */}
                      {activePt && (
                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-bold">
                              Период: {activePt.period}
                            </span>
                            <span className="text-slate-500">
                              Всего сделок: <strong className="text-slate-900 dark:text-white">{fmtCount(activePt.totalLeads)}</strong>
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-5">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                              <span className="text-slate-500">Успешно (Won):</span>
                              <strong className="text-emerald-600 dark:text-emerald-400 text-sm">
                                {fmtCount(activePt.wonLeads)} шт.
                              </strong>
                              <span className="text-slate-400">({fmtMoney(activePt.revenue)} сум)</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                              <span className="text-slate-500">Нереализовано (Отказ):</span>
                              <strong className="text-rose-600 dark:text-rose-400 text-sm">
                                {fmtCount(activePt.lostLeads)} шт.
                              </strong>
                              <span className="text-slate-400">({fmtMoney(activePt.lostValue)} сум)</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                              <span className="text-slate-500">В работе:</span>
                              <strong className="text-blue-600 dark:text-blue-400">
                                {fmtCount(activePt.openLeads)} шт.
                              </strong>
                            </div>

                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">
                              Win Rate: {activePt.totalLeads > 0 ? Math.round((activePt.wonLeads / activePt.totalLeads) * 100) : 0}%
                            </span>
                          </div>
                        </div>
                      )}

                      {/* SVG Smooth Mountain Canvas */}
                      {n > 0 ? (
                        <div className="w-full overflow-x-auto">
                          <svg
                            viewBox={`0 0 ${W} ${H}`}
                            className="w-full h-[300px] min-w-[680px] select-none"
                            onMouseLeave={() => setHoveredPointIdx(null)}
                          >
                            <defs>
                              <linearGradient id="smoothWonGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity="0.52" />
                                <stop offset="85%" stopColor="#10b981" stopOpacity="0.08" />
                                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                              </linearGradient>
                              <linearGradient id="smoothLostGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.42" />
                                <stop offset="85%" stopColor="#f43f5e" stopOpacity="0.06" />
                                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                              </linearGradient>
                              <linearGradient id="smoothOpenGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
                                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>

                            {/* Horizontal grid lines */}
                            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                              const y = padT + chartH * (1 - ratio);
                              const val = Math.round(maxVal * ratio);
                              return (
                                <g key={ratio}>
                                  <line
                                    x1={padL}
                                    y1={y}
                                    x2={W - padR}
                                    y2={y}
                                    stroke="currentColor"
                                    className="text-slate-100 dark:text-slate-800"
                                    strokeDasharray="4 4"
                                  />
                                  <text
                                    x={padL - 10}
                                    y={y + 4}
                                    textAnchor="end"
                                    className="fill-slate-400 text-[11px] font-medium"
                                  >
                                    {fmtCompact(val)}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Smooth Mountains: Lost (Red), Open (Blue), Won (Green) */}
                            <path d={lostSmooth.areaPath} fill="url(#smoothLostGrad)" />
                            <path
                              d={lostSmooth.strokePath}
                              fill="none"
                              stroke="#f43f5e"
                              strokeWidth="2.6"
                              strokeLinecap="round"
                            />

                            <path d={openSmooth.areaPath} fill="url(#smoothOpenGrad)" />
                            <path
                              d={openSmooth.strokePath}
                              fill="none"
                              stroke="#3b82f6"
                              strokeWidth="2"
                              strokeDasharray="5 4"
                              strokeLinecap="round"
                            />

                            <path d={wonSmooth.areaPath} fill="url(#smoothWonGrad)" />
                            <path
                              d={wonSmooth.strokePath}
                              fill="none"
                              stroke="#10b981"
                              strokeWidth="3"
                              strokeLinecap="round"
                            />

                            {/* Active hover crosshair vertical line */}
                            {activeIdx != null && (
                              <line
                                x1={xAt(activeIdx)}
                                y1={padT}
                                x2={xAt(activeIdx)}
                                y2={baseY}
                                stroke="#6366f1"
                                strokeWidth="1.5"
                                strokeDasharray="3 3"
                              />
                            )}

                            {/* Points, non-overlapping labels & invisible hover columns */}
                            {pts.map((p: any, i: number) => {
                              const x = xAt(i);
                              const wVal = getWon(p);
                              const lVal = getLost(p);
                              const oVal = getOpen(p);
                              const yWon = yAt(wVal);
                              const yLost = yAt(lVal);
                              const yOpen = yAt(oVal);
                              const isHovered = activeIdx === i;
                              const showXLabel = i % labelStep === 0 || i === n - 1 || isHovered;

                              // Anti-collision label positioning: only render text on chart if zoomed-in (<=12 pts) OR hovered
                              const shouldShowPointText = isHovered || showValueBadges;
                              const tooClose = Math.abs(yWon - yLost) < 20;
                              const wonLabelY = tooClose
                                ? yWon <= yLost
                                  ? Math.max(16, yWon - 10)
                                  : Math.min(baseY - 6, yWon + 15)
                                : Math.max(16, yWon - 9);
                              const lostLabelY = tooClose
                                ? yLost < yWon
                                  ? Math.max(16, yLost - 10)
                                  : Math.min(baseY - 6, yLost + 15)
                                : Math.max(16, yLost - 9);

                              const colWidth = n > 1 ? chartW / (n - 1) : chartW;

                              return (
                                <g key={p.period}>
                                  {/* Dots */}
                                  <circle
                                    cx={x}
                                    cy={yLost}
                                    r={isHovered ? 6 : 3.5}
                                    fill="#f43f5e"
                                    stroke="#ffffff"
                                    strokeWidth={isHovered ? 2 : 1.2}
                                  />
                                  <circle
                                    cx={x}
                                    cy={yOpen}
                                    r={isHovered ? 5 : 2.5}
                                    fill="#3b82f6"
                                    stroke="#ffffff"
                                    strokeWidth="1.2"
                                  />
                                  <circle
                                    cx={x}
                                    cy={yWon}
                                    r={isHovered ? 6.5 : 4}
                                    fill="#10b981"
                                    stroke="#ffffff"
                                    strokeWidth={isHovered ? 2.2 : 1.5}
                                  />

                                  {/* Non-overlapping pill badges when zoomed in or hovered */}
                                  {shouldShowPointText && lVal > 0 && (
                                    <text
                                      x={x}
                                      y={lostLabelY}
                                      textAnchor="middle"
                                      className={`fill-rose-600 dark:fill-rose-400 font-bold ${
                                        isHovered ? 'text-[11px]' : 'text-[10px]'
                                      }`}
                                    >
                                      {fmtCompact(lVal)}
                                    </text>
                                  )}

                                  {shouldShowPointText && wVal > 0 && (
                                    <text
                                      x={x}
                                      y={wonLabelY}
                                      textAnchor="middle"
                                      className={`fill-emerald-600 dark:fill-emerald-400 font-extrabold ${
                                        isHovered ? 'text-[11px]' : 'text-[10px]'
                                      }`}
                                    >
                                      {fmtCompact(wVal)}
                                    </text>
                                  )}

                                  {/* X-axis Period Label */}
                                  {showXLabel && (
                                    <text
                                      x={x}
                                      y={baseY + 22}
                                      textAnchor="middle"
                                      className={`${
                                        isHovered
                                          ? 'fill-indigo-600 dark:fill-indigo-400 font-extrabold text-[11px]'
                                          : 'fill-slate-500 dark:fill-slate-400 font-semibold text-[10px]'
                                      }`}
                                    >
                                      {p.period}
                                    </text>
                                  )}

                                  {/* Full-height invisible hover target */}
                                  <rect
                                    x={x - colWidth / 2}
                                    y={padT}
                                    width={colWidth}
                                    height={chartH + padB}
                                    fill="transparent"
                                    className="cursor-pointer"
                                    onMouseEnter={() => setHoveredPointIdx(i)}
                                    onClick={() => setHoveredPointIdx(i)}
                                  />
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      ) : (
                        <div className="h-56 flex items-center justify-center text-xs text-slate-400">
                          Нет данных за выбранный период
                        </div>
                      )}
                    </div>

                    {/* PORTFOLIO STRUCTURE DONUT & STACKED BAR BANNER */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                        <div className="flex items-center gap-5">
                          <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                            <svg viewBox="0 0 120 120" className="w-28 h-28 -rotate-90">
                              <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="14" />
                              <circle cx="60" cy="60" r="50" fill="none" stroke="#10b981" strokeWidth="14" strokeDasharray={`${wonDash} ${C}`} strokeDashoffset={0} />
                              <circle cx="60" cy="60" r="50" fill="none" stroke="#3b82f6" strokeWidth="14" strokeDasharray={`${openDash} ${C}`} strokeDashoffset={-wonDash} />
                              <circle cx="60" cy="60" r="50" fill="none" stroke="#f43f5e" strokeWidth="14" strokeDasharray={`${lostDash} ${C}`} strokeDashoffset={-(wonDash + openDash)} />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                              <span className="text-[9px] uppercase text-slate-400 font-semibold">Win Rate</span>
                              <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                                {kpis.winRateClosed}%
                              </span>
                            </div>
                          </div>

                          <div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                              Структура портфеля и сделок (%)
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">
                              Соотношение выигранного бюджета, активного пайплайна и отказов
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                            <div className="text-emerald-600 dark:text-emerald-400 font-bold">Успешно ({wonMoneyPct}%)</div>
                            <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{fmtMoney(kpis.totalRevenue)}</div>
                            <div className="text-[11px] text-slate-500">{fmtCount(kpis.wonLeads)} сделок ({wonCountPct}%)</div>
                          </div>
                          <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                            <div className="text-blue-600 dark:text-blue-400 font-bold">В работе ({openMoneyPct}%)</div>
                            <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{fmtMoney(kpis.openPipelineValue)}</div>
                            <div className="text-[11px] text-slate-500">{fmtCount(kpis.openLeads)} сделок ({openCountPct}%)</div>
                          </div>
                          <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20">
                            <div className="text-rose-600 dark:text-rose-400 font-bold">В отказе ({lostMoneyPct}%)</div>
                            <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{fmtMoney(kpis.lostRevenue)}</div>
                            <div className="text-[11px] text-slate-500">{fmtCount(kpis.lostLeads)} сделок ({lostCountPct}%)</div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
                            <span>Распределение всех сделок ({fmtCount(kpis.totalLeads)} шт.):</span>
                            <span>{wonCountPct}% / {openCountPct}% / {lostCountPct}%</span>
                          </div>
                          <div className="w-full h-3.5 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
                            <div style={{ width: `${wonCountPct}%` }} className="bg-emerald-500 h-full" />
                            <div style={{ width: `${openCountPct}%` }} className="bg-blue-500 h-full" />
                            <div style={{ width: `${lostCountPct}%` }} className="bg-rose-500 h-full" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

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
          {activeTab === 'managers' && (() => {
            const totalDeptRev = Math.max(
              managers.reduce((acc: number, m: any) => acc + (m.revenue || 0), 0),
              1,
            );
            const maxMgrRevOrPipe = Math.max(
              ...managers.map((m: any) => (m.revenue || 0) + (m.openValue || 0)),
              1,
            );

            return (
            <div className="space-y-6">
              {/* Visual Charts for Managers: Revenue vs Pipeline Bars & Discipline Health */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chart 1: Revenue & Pipeline Potential Share */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Выручка, потенциал в работе и доля в отделе (%)
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Зелёный — принесённая выручка (Won) • Синий — активный пайплайн в работе
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {managers.slice(0, 12).map((m: any) => {
                      const revShare = Math.round(((m.revenue || 0) / totalDeptRev) * 1000) / 10;
                      const wonW = Math.round(((m.revenue || 0) / maxMgrRevOrPipe) * 100);
                      const openW = Math.round(((m.openValue || 0) / maxMgrRevOrPipe) * 100);
                      return (
                        <div key={m.managerId} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                              {m.managerName}
                            </span>
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                {fmtMoney(m.revenue)}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                                {revShare}% отдела
                              </span>
                            </div>
                          </div>
                          <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                            <div
                              style={{ width: `${wonW}%` }}
                              className="bg-emerald-500 h-full"
                              title={`Выручка: ${fmtMoney(m.revenue)}`}
                            />
                            <div
                              style={{ width: `${openW}%` }}
                              className="bg-blue-500 h-full"
                              title={`В работе: ${fmtMoney(m.openValue)}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Chart 2: 100% Stacked CRM Discipline Health per Manager */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Индикатор дисциплины открытых сделок (100% шкала здоровья)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Зелёный: задача поставлена вовремя • Оранжевый: без задач • Красный: задача просрочена
                    </p>
                  </div>
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {managers
                      .filter((m: any) => (m.openLeads || 0) > 0)
                      .slice(0, 12)
                      .map((m: any) => {
                        const openTot = Math.max(m.openLeads || 0, 1);
                        const noTask = Math.min(openTot, m.noTaskLeads || 0);
                        const overdue = Math.min(openTot - noTask, m.overdueTasksLeads || 0);
                        const healthy = Math.max(0, openTot - noTask - overdue);

                        const healthyPct = Math.round((healthy / openTot) * 100);
                        const noTaskPct = Math.round((noTask / openTot) * 100);
                        const overduePct = Math.max(0, 100 - healthyPct - noTaskPct);

                        return (
                          <div key={`disc-${m.managerId}`} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                                {m.managerName} <span className="text-slate-400 font-normal">({m.openLeads} откр.)</span>
                              </span>
                              <div className="flex items-center gap-2 text-[11px]">
                                <span className="text-emerald-600 font-semibold">Норма: {healthyPct}%</span>
                                {noTask > 0 && <span className="text-orange-500 font-semibold">Без задач: {noTaskPct}%</span>}
                                {overdue > 0 && <span className="text-rose-500 font-semibold">Просроч.: {overduePct}%</span>}
                              </div>
                            </div>
                            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                              <div style={{ width: `${healthyPct}%` }} className="bg-emerald-500 h-full" />
                              <div style={{ width: `${noTaskPct}%` }} className="bg-orange-500 h-full" />
                              <div style={{ width: `${overduePct}%` }} className="bg-rose-500 h-full" />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>

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
            </div>
            );
          })()}

          {/* ================= TAB 3: MARKETING, LEAD SOURCES & TAGS ================= */}
          {activeTab === 'marketing' && (() => {
            const sourcesArr: any[] = marketing.utmSources || [];
            const totalSrcRevenue = Math.max(
              sourcesArr.reduce((acc: number, s: any) => acc + (s.revenue || 0), 0),
              1,
            );
            return (
            <div className="space-y-6">
              {/* Dual Comparison Chart: Share of Leads % vs Share of Revenue % per Source */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Сравнение источников: Доля лидов (%) vs Доля выручки (%) и Конверсия (CR%)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Показывает, какие источники дают реальные деньги в кассу (зелёная шкала), а какие генерируют только поток заявок без оплат (синяя шкала)
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400">
                      <span className="w-2.5 h-2.5 rounded-xs bg-blue-500" /> Доля лидов %
                    </span>
                    <span className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Доля выручки %
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sourcesArr.slice(0, 8).map((s: any) => {
                    const leadPct = s.sharePercent ?? 0;
                    const revPct = Math.round(((s.revenue || 0) / totalSrcRevenue) * 1000) / 10;
                    return (
                      <div key={`chart-${s.source}`} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-900 dark:text-white truncate max-w-[210px]">{s.source}</span>
                          <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold">
                            CR: {s.winRate}%
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="w-24 text-slate-500">Лиды ({fmtCount(s.totalLeads)}):</span>
                            <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div style={{ width: `${Math.min(100, leadPct)}%` }} className="bg-blue-500 h-full rounded-full" />
                            </div>
                            <span className="w-11 text-right font-semibold text-blue-600 dark:text-blue-400">{leadPct}%</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="w-24 text-slate-500">Выручка:</span>
                            <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div style={{ width: `${Math.min(100, revPct)}%` }} className="bg-emerald-500 h-full rounded-full" />
                            </div>
                            <span className="w-11 text-right font-semibold text-emerald-600 dark:text-emerald-400">{revPct}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* AmoCRM Lead Sources */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        Эффективность по источникам сделок (AmoCRM Источники)
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Системный фильтр «Источник сделок» из AmoCRM (_embedded.source), UTM и телефония
                      </p>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold">
                      Источников: {(marketing.utmSources || []).length}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="p-2.5 text-left">Источник сделки (AmoCRM)</th>
                          <th className="p-2.5 text-right">Лиды</th>
                          <th className="p-2.5 text-right">Доля %</th>
                          <th className="p-2.5 text-right">Продажи</th>
                          <th className="p-2.5 text-right">Отказ</th>
                          <th className="p-2.5 text-right">CR%</th>
                          <th className="p-2.5 text-right">Выручка</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {(marketing.utmSources || []).map((u: any) => (
                          <tr key={u.source} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="p-2.5 font-semibold text-slate-900 dark:text-white">{u.source}</td>
                            <td className="p-2.5 text-right font-bold">{fmtCount(u.totalLeads)}</td>
                            <td className="p-2.5 text-right text-slate-500">{u.sharePercent ?? 0}%</td>
                            <td className="p-2.5 text-right text-emerald-600 font-semibold">{fmtCount(u.wonLeads)}</td>
                            <td className="p-2.5 text-right text-rose-500">{fmtCount(u.lostLeads)}</td>
                            <td className="p-2.5 text-right font-semibold">{u.winRate}%</td>
                            <td className="p-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(u.revenue)}</td>
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
            </div>
            );
          })()}

          {/* ================= TAB 4: LOSS REASONS ================= */}
          {activeTab === 'losses_ltv' && (() => {
            const reasons: any[] = lossesAndLtv.lossReasons || [];
            const maxLostCount = Math.max(...reasons.map((r: any) => r.lostLeads || 0), 1);
            let cum = 0;
            const paretoItems = reasons.slice(0, 12).map((r: any) => {
              cum = Math.min(100, Math.round((cum + (r.sharePercent || 0)) * 10) / 10);
              return { ...r, cumulativePercent: cum };
            });

            return (
            <div className="space-y-6">
              {/* Pareto 80/20 Chart (Bars + Cumulative % Line) */}
              {paretoItems.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Диаграмма Парето (80/20) по причинам отказа (Свечи потерь + Накопительный %)
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Столбцы — количество потерянных сделок • Линия сверху — накопительный процент от всех отказов (зона до 80% выделена красным)
                      </p>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold">
                      Зона Парето 80% потерь
                    </span>
                  </div>

                  <div className="h-52 flex items-end gap-3 pt-8 pb-2 px-2 overflow-x-auto">
                    {paretoItems.map((item: any) => {
                      const barH = Math.max(12, Math.round(((item.lostLeads || 0) / maxLostCount) * 140));
                      const inParetoZone = item.cumulativePercent <= 85;
                      return (
                        <div key={`pareto-${item.reason}`} className="flex-1 min-w-[76px] flex flex-col items-center">
                          <span
                            className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded mb-1 ${
                              inParetoZone
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                            }`}
                          >
                            ∑ {item.cumulativePercent}%
                          </span>
                          <div
                            style={{ height: `${barH}px` }}
                            className={`w-8 rounded-t-lg transition-all ${
                              inParetoZone
                                ? 'bg-gradient-to-t from-rose-600 to-rose-400 shadow-xs'
                                : 'bg-slate-300 dark:bg-slate-700'
                            }`}
                            title={`${item.reason}: ${item.lostLeads} сделок (${item.sharePercent}%) | Накопительно: ${item.cumulativePercent}%`}
                          />
                          <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 mt-1.5 truncate max-w-[84px] text-center">
                            {item.reason}
                          </span>
                          <span className="text-[10px] text-rose-500 font-bold">{item.sharePercent}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Причины отказа (Почему теряются сделки и бюджет)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Данные собираются из системной причины отказа AmoCRM и кастомного списочного поля «Rad etish sababi» / «Причина отказа»
                  </p>
                </div>
                <span className="text-xs px-3 py-1 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold border border-rose-500/20">
                  Причин отказа: {(lossesAndLtv.lossReasons || []).length}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="p-3 text-left rounded-l-lg">Причина отказа</th>
                      <th className="p-3 text-right">Потеряно сделок</th>
                      <th className="p-3 text-right">Доля от всех отказов %</th>
                      <th className="p-3 text-right">Упущенная сумма</th>
                      <th className="p-3 text-right rounded-r-lg">Средний бюджет отказа</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {(lossesAndLtv.lossReasons || []).map((lr: any) => (
                      <tr key={lr.reason} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">{lr.reason}</td>
                        <td className="p-3 text-right font-bold text-rose-500">{fmtCount(lr.lostLeads)}</td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-2 justify-end">
                            <div className="w-24 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-rose-500 h-full rounded-full"
                                style={{ width: `${Math.min(100, lr.sharePercent || 0)}%` }}
                              />
                            </div>
                            <span className="font-semibold w-12 text-right">{lr.sharePercent}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-bold text-rose-600 dark:text-rose-400">
                          {fmtMoney(lr.lostValue)}
                        </td>
                        <td className="p-3 text-right text-slate-600 dark:text-slate-300 font-medium">
                          {fmtMoney(lr.avgLostCheck ?? (lr.lostLeads > 0 ? Math.round(lr.lostValue / lr.lostLeads) : 0))}
                        </td>
                      </tr>
                    ))}
                    {(lossesAndLtv.lossReasons || []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400">
                          Нет закрытых в отказ сделок за выбранный период
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            </div>
            );
          })()}

          {/* ================= TAB 5: CUSTOM FIELDS BI (LISTS & OPTIONS) ================= */}
          {activeTab === 'custom_fields' && (() => {
            const listGroups: any[] = marketing.customFieldsLists || [];
            const visibleGroups =
              selectedCustomFieldName === 'ALL'
                ? listGroups
                : listGroups.filter((g: any) => g.fieldName === selectedCustomFieldName);

            return (
              <div className="space-y-5">
                {/* Filter header card */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        Аналитика по списочным кастомным полям сделок AmoCRM (Поля с выборками)
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Отфильтрованы только поля со списками. На каждое поле и каждую выборку показаны: сделки, доля внутри поля, продажи (Won), отказы (Lost), в работе, Win Rate %, выручка и средний чек.
                      </p>
                    </div>
                    <span className="text-xs px-3 py-1 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold border border-indigo-500/20 whitespace-nowrap">
                      Списочных полей: {listGroups.length}
                    </span>
                  </div>

                  {/* Pill buttons for selecting a list field */}
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setSelectedCustomFieldName('ALL')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        selectedCustomFieldName === 'ALL'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      Все списочные поля ({listGroups.length})
                    </button>
                    {listGroups.map((g: any) => (
                      <button
                        key={g.fieldName}
                        type="button"
                        onClick={() => setSelectedCustomFieldName(g.fieldName)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                          selectedCustomFieldName === g.fieldName
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {g.fieldName} <span className="opacity-75">({fmtCount(g.totalFilled)})</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Analytical card per list field */}
                {visibleGroups.map((group: any) => (
                  <div
                    key={group.fieldName}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden"
                  >
                    <div className="px-5 py-3.5 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold">
                          {group.fieldName}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Вариантов выбора: <strong className="text-slate-800 dark:text-slate-200">{group.optionsCount}</strong>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs">
                        <span className="text-slate-600 dark:text-slate-300">
                          Заполнено сделок: <strong className="text-slate-900 dark:text-white">{fmtCount(group.totalFilled)}</strong>
                        </span>
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Продаж (Won): <strong>{fmtCount(group.wonFilled)}</strong>
                        </span>
                        <span className="text-rose-500">
                          Отказ (Lost): <strong>{fmtCount(group.lostFilled)}</strong>
                        </span>
                        <span className="text-blue-500">
                          В работе: <strong>{fmtCount(group.openFilled)}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                          Win Rate поля: {group.winRate}%
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          Выручка: {fmtMoney(group.wonValue)}
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto max-h-[480px]">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 sticky top-0 z-10">
                          <tr>
                            <th className="p-3 text-left">Выборка (Вариант выбора)</th>
                            <th className="p-3 text-right">Сделок</th>
                            <th className="p-3 text-right">Доля в поле %</th>
                            <th className="p-3 text-right">Продаж (Won)</th>
                            <th className="p-3 text-right">Отказ (Lost)</th>
                            <th className="p-3 text-right">В работе</th>
                            <th className="p-3 text-center">Структура (Won / Open / Lost %)</th>
                            <th className="p-3 text-right">Win Rate %</th>
                            <th className="p-3 text-right">Выручка</th>
                            <th className="p-3 text-right">Средний чек</th>
                            <th className="p-3 text-right">В работе (Сумма)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {(group.options || []).map((opt: any, idx: number) => (
                            <tr key={`${group.fieldName}-${opt.fieldValue}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="p-3 font-semibold text-slate-900 dark:text-white">{opt.fieldValue}</td>
                              <td className="p-3 text-right font-bold">{fmtCount(opt.totalLeads)}</td>
                              <td className="p-3 text-right">
                                <div className="inline-flex items-center gap-2 justify-end">
                                  <div className="w-16 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                    <div
                                      className="bg-indigo-500 h-full rounded-full"
                                      style={{ width: `${Math.min(100, opt.shareOfField || 0)}%` }}
                                    />
                                  </div>
                                  <span className="font-semibold w-10 text-right">{opt.shareOfField || 0}%</span>
                                </div>
                              </td>
                              <td className="p-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                                {fmtCount(opt.wonLeads)}
                              </td>
                              <td className="p-3 text-right text-rose-500">{fmtCount(opt.lostLeads)}</td>
                              <td className="p-3 text-right text-blue-500">{fmtCount(opt.openLeads)}</td>
                              <td className="p-3">
                                {(() => {
                                  const tot = Math.max(opt.totalLeads || 0, 1);
                                  const wP = Math.round(((opt.wonLeads || 0) / tot) * 100);
                                  const oP = Math.round(((opt.openLeads || 0) / tot) * 100);
                                  const lP = Math.max(0, 100 - wP - oP);
                                  return (
                                    <div className="flex items-center gap-1.5 justify-center">
                                      <div
                                        className="w-24 h-2 rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-700"
                                        title={`Won: ${wP}% | Open: ${oP}% | Lost: ${lP}%`}
                                      >
                                        <div style={{ width: `${wP}%` }} className="bg-emerald-500 h-full" />
                                        <div style={{ width: `${oP}%` }} className="bg-blue-500 h-full" />
                                        <div style={{ width: `${lP}%` }} className="bg-rose-500 h-full" />
                                      </div>
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="p-3 text-right">
                                <span
                                  className={`px-2 py-0.5 rounded font-bold ${
                                    opt.winRate >= 20
                                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                      : opt.winRate >= 10
                                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                      : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  {opt.winRate}%
                                </span>
                              </td>
                              <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                {fmtMoney(opt.revenue ?? opt.wonValue ?? 0)}
                              </td>
                              <td className="p-3 text-right text-slate-600 dark:text-slate-300">
                                {fmtMoney(opt.avgCheck ?? 0)}
                              </td>
                              <td className="p-3 text-right text-blue-600 dark:text-blue-400 font-medium">
                                {fmtMoney(opt.openValue ?? 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                {visibleGroups.length === 0 && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-400">
                    Нет данных по списочным кастомным полям за выбранный период
                  </div>
                )}
              </div>
            );
          })()}

          {/* ================= TAB 6: RISK DEALS AUDIT ================= */}
          {activeTab === 'risk_audit' && (() => {
            const riskDeals: any[] = lossesAndLtv.riskDeals || [];
            const riskBudget = riskDeals.reduce((acc: number, d: any) => acc + (d.price || 0), 0);
            const openPipe = Math.max(kpis?.openPipelineValue || 0, riskBudget, 1);
            const riskSharePct = Math.min(100, Math.round((riskBudget / openPipe) * 1000) / 10);
            const safeSharePct = Math.max(0, Math.round((100 - riskSharePct) * 10) / 10);

            const noTaskBudget = riskDeals.filter((d: any) => d.riskType === 'no_task').reduce((a: number, d: any) => a + (d.price || 0), 0);
            const overdueBudget = riskDeals.filter((d: any) => d.riskType === 'overdue_task').reduce((a: number, d: any) => a + (d.price || 0), 0);
            const staleBudget = riskDeals.filter((d: any) => d.riskType === 'stale_deal').reduce((a: number, d: any) => a + (d.price || 0), 0);

            return (
            <div className="space-y-6">
              {/* Pipeline Risk Thermometer Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Термометр риска открытого пайплайна (% бюджета под угрозой)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Доля бюджета в ТОП-25 проблемных сделках относительно всего открытого пайплайна ({fmtMoney(kpis?.openPipelineValue || 0)})
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                      В безопасности: {safeSharePct}%
                    </span>
                    <span className="px-3 py-1 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold">
                      В зоне риска: {fmtMoney(riskBudget)} ({riskSharePct}%)
                    </span>
                  </div>
                </div>

                <div className="w-full h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                  <div style={{ width: `${safeSharePct}%` }} className="bg-emerald-500 h-full" title={`В порядке: ${safeSharePct}%`} />
                  <div style={{ width: `${riskSharePct}%` }} className="bg-gradient-to-r from-amber-500 to-rose-600 h-full" title={`Под угрозой: ${riskSharePct}%`} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/20 flex items-center justify-between text-xs">
                    <span className="text-orange-600 dark:text-orange-400 font-semibold">Без поставленной задачи:</span>
                    <span className="font-bold text-slate-900 dark:text-white">{fmtMoney(noTaskBudget)}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 flex items-center justify-between text-xs">
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">С просроченной задачей:</span>
                    <span className="font-bold text-slate-900 dark:text-white">{fmtMoney(overdueBudget)}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center justify-between text-xs">
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">Без движения &gt; 14 дней:</span>
                    <span className="font-bold text-slate-900 dark:text-white">{fmtMoney(staleBudget)}</span>
                  </div>
                </div>
              </div>

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
            );
          })()}
        </>
      )}

        </div>

        {/* Docked AI Assistant Panel on Desktop (>= 1280px) */}
        {effectiveAccountId && isWideScreen && (
          <aside
            className={`w-[420px] 2xl:w-[460px] shrink-0 sticky top-4 h-[calc(100vh-2rem)] z-30 transition-all ${
              chatOpen ? 'block' : 'hidden'
            }`}
          >
            <AiChatDrawer
              accountId={effectiveAccountId}
              isOpen={chatOpen}
              onClose={() => setChatOpen(false)}
              pipelineId={appliedFilters.pipelineId}
              pipelineName={pipelines.find((p: any) => p.id === appliedFilters.pipelineId)?.name}
              filters={{
                managerIds: appliedFilters.managerIds,
                tagIds: appliedFilters.tagIds,
                dateFrom: appliedFilters.dateFrom || undefined,
                dateTo: appliedFilters.dateTo || undefined,
              }}
              modelName={aiStatus.data?.model}
              biData={data}
              activeBiTab={activeTab}
              variant="docked"
            />
          </aside>
        )}
      </div>

      {/* Slide-over Drawer for Mobile / Tablets (< 1280px) */}
      {effectiveAccountId && !isWideScreen && (
        <AiChatDrawer
          accountId={effectiveAccountId}
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          pipelineId={appliedFilters.pipelineId}
          pipelineName={pipelines.find((p: any) => p.id === appliedFilters.pipelineId)?.name}
          filters={{
            managerIds: appliedFilters.managerIds,
            tagIds: appliedFilters.tagIds,
            dateFrom: appliedFilters.dateFrom || undefined,
            dateTo: appliedFilters.dateTo || undefined,
          }}
          modelName={aiStatus.data?.model}
          biData={data}
          activeBiTab={activeTab}
          variant="overlay"
        />
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
    </div>
  );
}
