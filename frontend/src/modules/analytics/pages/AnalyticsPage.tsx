import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  DollarSign,
  Award,
  Tag as TagIcon,
  XCircle,
  Filter,
  ShieldAlert,
  Clock,
  Target,
  RefreshCw,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { analyticsApi, FilterParams } from '../api/analytics.api';
import { userApi } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useLanguage } from '@/i18n/LanguageContext';
import AiChatDrawer from '@/modules/ai_chat/components/AiChatDrawer';
import { useFilterContext } from '@/shared/context/FilterContext';
import FilterBar from '@/shared/components/FilterBar';
import MultiSelectDropdown from '../components/filters/MultiSelectDropdown';
import StagesStatsTable from '../components/StagesStatsTable';

import { AnalyticsTab, MultiSelectOption } from '../types';
import OverviewTab from '../components/tabs/OverviewTab';
import ManagersTab from '../components/tabs/ManagersTab';
import MarketingTab from '../components/tabs/MarketingTab';
import LossesTab from '../components/tabs/LossesTab';
import CustomFieldsTab from '../components/tabs/CustomFieldsTab';
import RiskAuditTab from '../components/tabs/RiskAuditTab';

interface AnalyticsPageProps {
  defaultTab?: AnalyticsTab;
}

export default function AnalyticsPage({ defaultTab = 'overview' }: AnalyticsPageProps) {
  const { t, lang } = useLanguage();
  const { role } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const [chatOpen, setChatOpen] = useState(false);
  const [isWideScreen, setIsWideScreen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1280 : true,
  );

  const paramTab = searchParams.get('tab') as AnalyticsTab | null;
  const [activeTab, setActiveTab] = useState<AnalyticsTab>(() => paramTab || defaultTab);

  useEffect(() => {
    if (paramTab && paramTab !== activeTab) {
      setActiveTab(paramTab);
    }
  }, [paramTab]);

  const handleTabChange = (tabId: AnalyticsTab) => {
    setActiveTab(tabId);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const handleResize = () => {
      setIsWideScreen(window.innerWidth >= 1280);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const {
    effectiveAccountId,
    applied,
    pipelineId,
    setPipelineId,
    applyFilters,
    pipelines,
  } = useFilterContext();

  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([]);

  // Time Analytics Query (Stages Stats)
  const timeFilters: FilterParams = useMemo(() => ({
    tagIds: applied.tagIds,
    managerIds: applied.managerIds,
    dateFrom: applied.dateFrom || undefined,
    dateTo: applied.dateTo || undefined,
    status: applied.status,
  }), [applied]);

  const statsQuery = useQuery({
    queryKey: ['stats', applied.pipelineId, timeFilters],
    queryFn: () => analyticsApi.stagesStats(applied.pipelineId!, timeFilters),
    enabled: !!applied.pipelineId,
  });

  const allStatsQuery = useQuery({
    queryKey: ['all-stats', effectiveAccountId, timeFilters],
    queryFn: () => analyticsApi.allStagesStats(effectiveAccountId!, timeFilters),
    enabled: !!effectiveAccountId && !applied.pipelineId,
  });

  const [collapsedPipelines, setCollapsedPipelines] = useState<Record<number, boolean>>({});

  const togglePipelineCollapse = (pId: number) => {
    setCollapsedPipelines((prev) => ({
      ...prev,
      [pId]: !prev[pId],
    }));
  };

  const handleStageClick = (stageId: number) => {
    const path = role === 'admin' ? `/admin/stage/${stageId}` : `/stage/${stageId}`;
    const params = new URLSearchParams();
    if (applied.tagIds.length > 0) params.set('tags', applied.tagIds.join(','));
    if (applied.status && applied.status !== 'all') params.set('status', applied.status);
    if (applied.managerIds.length > 0) params.set('managers', applied.managerIds.join(','));
    if (applied.dateFrom) params.set('dateFrom', applied.dateFrom);
    if (applied.dateTo) params.set('dateTo', applied.dateTo);
    const qs = params.toString();
    navigate(qs ? `${path}?${qs}` : path);
  };

  // AI Status query
  const aiStatus = useQuery({
    queryKey: ['ai-status', effectiveAccountId],
    queryFn: () => userApi.getAiStatus(effectiveAccountId!),
    enabled: !!effectiveAccountId,
  });

  const prevSourcesRef = useRef<MultiSelectOption[]>([]);

  // BI Analytics Query with full status filter support
  const biQuery = useQuery({
    queryKey: [
      'analytics-data',
      effectiveAccountId,
      applied.pipelineId,
      applied.dateFrom,
      applied.dateTo,
      applied.status,
      applied.managerIds,
      applied.tagIds,
      selectedSourceIds,
    ],
    queryFn: () => {
      const activeSourceNames = selectedSourceIds
        .map((id: number) => prevSourcesRef.current.find((s) => s.id === id)?.name)
        .filter(Boolean) as string[];
      return analyticsApi.analytics(effectiveAccountId!, {
        pipelineId: applied.pipelineId,
        dateFrom: applied.dateFrom || undefined,
        dateTo: applied.dateTo || undefined,
        status: applied.status,
        managerIds: applied.managerIds.length > 0 ? applied.managerIds : undefined,
        tagIds: applied.tagIds.length > 0 ? applied.tagIds : undefined,
        sources: activeSourceNames.length > 0 ? activeSourceNames : undefined,
      });
    },
    enabled: !!effectiveAccountId,
  });

  if (biQuery.data?.filtersMeta?.sources?.length) {
    prevSourcesRef.current = biQuery.data.filtersMeta.sources;
  }

  const enrichMut = useMutation({
    mutationFn: () => analyticsApi.triggerEnrich(effectiveAccountId!),
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['analytics-data', effectiveAccountId] });
      }, 4000);
    },
  });

  const data = biQuery.data;
  const kpis = data?.kpis;
  const sourcesList: MultiSelectOption[] = data?.filtersMeta?.sources || [];
  const managers = data?.managers || [];
  const timeseries = data?.timeseries || [];
  const marketing = data?.marketing || { utmSources: [], tagsBreakdown: [], customFieldsBreakdown: [], customFieldsLists: [] };
  const lossesAndLtv = data?.lossesAndLtv || { lossReasons: [], ltv: {}, riskDeals: [] };

  const tabLabels: Record<AnalyticsTab, { label: string; icon: any }> = {
    overview: { label: lang === 'uz' ? 'Umumiy va Moliya' : 'Обзор и Финансы', icon: DollarSign },
    time_stages: { label: lang === 'uz' ? 'Bosqichlar vaqti' : 'Время на этапах', icon: Clock },
    managers: { label: lang === 'uz' ? 'Menejerlar' : 'Менеджеры и Дисциплина', icon: Award },
    marketing: { label: lang === 'uz' ? 'Marketing va UTM' : 'Маркетинг и Теги', icon: TagIcon },
    losses_ltv: { label: lang === 'uz' ? 'Rad sabablari' : 'Причины отказа', icon: XCircle },
    custom_fields: { label: lang === 'uz' ? 'AmoCRM maydonlari' : 'Кастомные поля', icon: Filter },
    risk_audit: { label: lang === 'uz' ? 'Xavfli bitimlar' : 'Сделки в зоне риска', icon: ShieldAlert },
  };

  return (
    <div className="p-4 lg:p-6 mx-auto max-w-[1920px]">
      <div className="flex gap-6 items-start">
        {/* Main Analytics Content */}
        <div className={`space-y-6 ${chatOpen && isWideScreen ? 'flex-1 min-w-0' : 'w-full'}`}>
          {/* Page Header */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
                {lang === 'uz' ? 'AmoCRM Sotuvlar Tahlili' : 'Детальная аналитика продаж AmoCRM'}
              </h1>
              {data?.account && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {lang === 'uz' ? 'Hisob: ' : 'Аккаунт: '}
                  <strong className="text-slate-700 dark:text-slate-200">{data.account.subdomain}.{data.account.baseDomain}</strong>
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
                <span>
                  {enrichMut.isPending
                    ? (lang === 'uz' ? 'Tahlil yangilanmoqda...' : 'Обогащаем БД...')
                    : (lang === 'uz' ? 'AmoCRM ma\'lumotlarini yangilash' : 'Обогатить БД из AmoCRM')}
                </span>
              </button>
            </div>
          </div>

          {/* Unified Filter Bar with extra Sources filter */}
          <FilterBar showStatus={true}>
            {sourcesList.length > 0 && (
              <MultiSelectDropdown
                label={lang === 'uz' ? 'Manbalar' : 'Источники'}
                placeholder={lang === 'uz' ? 'Barcha manbalar' : 'Все источники'}
                options={sourcesList}
                selectedIds={selectedSourceIds}
                icon={<Target size={13} />}
                onChange={(nextIds) => setSelectedSourceIds(nextIds)}
              />
            )}
          </FilterBar>

          {/* Navigation Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            {(Object.keys(tabLabels) as AnalyticsTab[]).map((tabId) => {
              const { label, icon: Icon } = tabLabels[tabId];
              const active = activeTab === tabId;
              return (
                <button
                  key={tabId}
                  onClick={() => handleTabChange(tabId)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    active
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Main Tab Content */}
          {activeTab === 'time_stages' ? (
            <div className="space-y-4">
              {applied.pipelineId ? (
                // Single pipeline view
                statsQuery.isLoading ? (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-500">
                    {lang === 'uz' ? 'Bosqichlar vaqti yuklanmoqda...' : 'Загрузка аналитики времени на этапах...'}
                  </div>
                ) : statsQuery.isError ? (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-2xl p-6 text-sm">
                    {lang === 'uz' ? 'Xatolik yuz berdi: ' : 'Ошибка загрузки этапов: '}
                    {(statsQuery.error as any)?.message || 'Неизвестная ошибка'}
                  </div>
                ) : statsQuery.data ? (
                  <StagesStatsTable
                    items={statsQuery.data.items || []}
                    onStageClick={handleStageClick}
                  />
                ) : (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-500">
                    {lang === 'uz' ? 'Tanlangan voronka bo\'yicha ma\'lumot yo\'q' : 'Нет данных по этапам для выбранной воронки'}
                  </div>
                )
              ) : (
                // All pipelines view
                allStatsQuery.isLoading ? (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-500">
                    {lang === 'uz' ? 'Barcha voronkalar bo\'yicha bosqichlar vaqti yuklanmoqda...' : 'Загрузка аналитики времени по всем воронкам...'}
                  </div>
                ) : allStatsQuery.isError ? (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-2xl p-6 text-sm">
                    {lang === 'uz' ? 'Xatolik yuz berdi: ' : 'Ошибка загрузки этапов: '}
                    {(allStatsQuery.error as any)?.message || 'Неизвестная ошибка'}
                  </div>
                ) : allStatsQuery.data?.pipelines?.length ? (
                  <div className="space-y-6">
                    {allStatsQuery.data.pipelines.map((p) => {
                      const isCollapsed = !!collapsedPipelines[p.pipelineId];
                      return (
                        <div
                          key={p.pipelineId}
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden transition-all"
                        >
                          {/* Pipeline Card Header */}
                          <div className="px-5 py-4 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => togglePipelineCollapse(p.pipelineId)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
                              >
                                <ChevronDown
                                  size={18}
                                  className={`transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
                                />
                              </button>
                              <div>
                                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                  <span>{p.pipelineName}</span>
                                </h3>
                                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                  <span>{p.items?.length || 0} {lang === 'uz' ? 'bosqich' : 'этапов'}</span>
                                  <span>•</span>
                                  <span>{p.totalPassedLeads || 0} {lang === 'uz' ? 'o\'tgan bitimlar' : 'прошедших сделок'}</span>
                                  <span>•</span>
                                  <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                                    {p.totalActiveLeads || 0} {lang === 'uz' ? 'ish jarayonida' : 'в работе'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setPipelineId(p.pipelineId);
                                  applyFilters();
                                }}
                                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
                              >
                                {lang === 'uz' ? 'Faqat shu voronkani tanlash' : 'Выбрать только эту воронку'}
                              </button>
                            </div>
                          </div>

                          {/* Pipeline Stages Table */}
                          {!isCollapsed && (
                            <div className="p-4">
                              <StagesStatsTable
                                items={p.items || []}
                                onStageClick={handleStageClick}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-500">
                    {lang === 'uz' ? 'Voronkalar bo\'yicha ma\'lumot topilmadi' : 'Нет данных по воронкам'}
                  </div>
                )
              )}
            </div>
          ) : biQuery.isLoading ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-500">
              {lang === 'uz' ? 'Chuqur tahlil yuklanmoqda...' : 'Загрузка глубокой аналитики AmoCRM...'}
            </div>
          ) : biQuery.isError ? (
            <div className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-2xl p-6 text-sm">
              {lang === 'uz' ? 'Xatolik yuz berdi: ' : 'Ошибка загрузки аналитики: '}
              {(biQuery.error as any)?.message || 'Неизвестная ошибка'}
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
        {aiStatus.data?.enabled && effectiveAccountId && isWideScreen && chatOpen && (
          <aside className="w-[420px] 2xl:w-[460px] shrink-0 sticky top-0 h-screen -my-4 lg:-my-6 -mr-4 lg:-mr-6 flex flex-col border-l border-slate-200 dark:border-slate-800 z-30 transition-all bg-white dark:bg-slate-900 overflow-hidden">
            <AiChatDrawer
              accountId={effectiveAccountId}
              isOpen={chatOpen}
              onClose={() => setChatOpen(false)}
              pipelineId={applied.pipelineId}
              pipelineName={pipelines.find((p) => p.id === applied.pipelineId)?.name}
              filters={{
                managerIds: applied.managerIds,
                tagIds: applied.tagIds,
                dateFrom: applied.dateFrom || undefined,
                dateTo: applied.dateTo || undefined,
              }}
              modelName={aiStatus.data?.model}
              isAiEnabled={aiStatus.data?.enabled}
              biData={biQuery.data}
              activeBiTab={activeTab}
              variant="docked"
            />
          </aside>
        )}

        {/* Floating AI Button (Green cloud) - Only if AI key configured */}
        {aiStatus.data?.enabled && !chatOpen && (
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all cursor-pointer group"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </span>
            <Sparkles size={18} className="text-yellow-300 fill-yellow-300 group-hover:scale-110 transition-transform" />
            <span className="text-sm">ИИ-Аналитик</span>
          </button>
        )}

        {/* Drawer overlay for non-wide screens */}
        {aiStatus.data?.enabled && effectiveAccountId && !isWideScreen && chatOpen && (
          <AiChatDrawer
            accountId={effectiveAccountId}
            isOpen={chatOpen}
            onClose={() => setChatOpen(false)}
            pipelineId={applied.pipelineId}
            pipelineName={pipelines.find((p) => p.id === applied.pipelineId)?.name}
            filters={{
              managerIds: applied.managerIds,
              tagIds: applied.tagIds,
              dateFrom: applied.dateFrom || undefined,
              dateTo: applied.dateTo || undefined,
            }}
            modelName={aiStatus.data?.model}
            isAiEnabled={aiStatus.data?.enabled}
            biData={biQuery.data}
            activeBiTab={activeTab}
            variant="overlay"
          />
        )}
      </div>
    </div>
  );
}
