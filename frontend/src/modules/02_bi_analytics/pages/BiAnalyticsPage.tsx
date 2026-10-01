import { useState, useRef, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign,
  Award,
  Tag as TagIcon,
  XCircle,
  Filter,
  ShieldAlert,
  Users,
  Target,
  RefreshCw,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import { py2Api } from '../api/bi-analytics.api';
import { userApi } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useLanguage } from '@/i18n/LanguageContext';
import { decodeJwt } from '@/lib/jwt';
import AiChatDrawer from '@/modules/ai_chat/components/AiChatDrawer';

import { DatePreset, BiTab, MultiSelectOption, getPresetDates } from '../types';
import MultiSelectDropdown from '../components/filters/MultiSelectDropdown';
import OverviewTab from '../components/tabs/OverviewTab';
import ManagersTab from '../components/tabs/ManagersTab';
import MarketingTab from '../components/tabs/MarketingTab';
import LossesTab from '../components/tabs/LossesTab';
import CustomFieldsTab from '../components/tabs/CustomFieldsTab';
import RiskAuditTab from '../components/tabs/RiskAuditTab';

export default function BiAnalyticsPage() {
  const { accountId: paramAccountId } = useParams<{ accountId?: string }>();
  const { role } = useAuth();
  const { t } = useLanguage();
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
  const marketing = data?.marketing || { utmSources: [], tagsBreakdown: [], customFieldsBreakdown: [], customFieldsLists: [] };
  const lossesAndLtv = data?.lossesAndLtv || { lossReasons: [], ltv: {}, riskDeals: [] };

  return (
    <div className="p-4 lg:p-6 mx-auto max-w-[1920px]">
      <div className="flex gap-6 items-start">
        {/* Main Analytics Content */}
        <div className={`space-y-6 ${chatOpen && isWideScreen ? 'flex-1 min-w-0' : 'w-full'}`}>
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

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
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
              <div className="flex items-center text-xs font-semibold text-slate-400 dark:text-slate-500">
                <Filter size={14} />
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

          {/* Navigation Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            {[
              { id: 'overview', label: 'Обзор и Финансы', icon: DollarSign },
              { id: 'managers', label: 'Менеджеры и Дисциплина', icon: Award },
              { id: 'marketing', label: 'Маркетинг и Теги', icon: TagIcon },
              { id: 'losses_ltv', label: 'Причины отказа', icon: XCircle },
              { id: 'custom_fields', label: 'Кастомные поля', icon: Filter },
              { id: 'risk_audit', label: 'Сделки в зоне риска', icon: ShieldAlert },
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

          {/* Main Tab Content */}
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
              {activeTab === 'overview' && (
                <OverviewTab kpis={kpis} timeseries={timeseries} lossesAndLtv={lossesAndLtv} />
              )}
              {activeTab === 'managers' && <ManagersTab managers={managers} />}
              {activeTab === 'marketing' && <MarketingTab marketing={marketing} />}
              {activeTab === 'losses_ltv' && <LossesTab lossReasons={lossesAndLtv.lossReasons || []} />}
              {activeTab === 'custom_fields' && (
                <CustomFieldsTab customFieldsLists={marketing.customFieldsLists || []} />
              )}
              {activeTab === 'risk_audit' && (
                <RiskAuditTab kpis={kpis} riskDeals={lossesAndLtv.riskDeals || []} />
              )}
            </>
          )}
        </div>

        {/* Docked AI Chat for Desktop (>= 1280px) */}
        {effectiveAccountId && isWideScreen && chatOpen && (
          <aside className="w-[420px] shrink-0 sticky top-4 max-h-[calc(100vh-2rem)] flex flex-col transition-all">
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
