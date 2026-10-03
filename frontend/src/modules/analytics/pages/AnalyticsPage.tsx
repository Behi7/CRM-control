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
  Sparkles,
  ChevronDown,
  AlertTriangle,
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
import StageTimeBarChart from '../components/charts/StageTimeBarChart';

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
  const { t, lang, formatDuration } = useLanguage();
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

  const [expandedPipelines, setExpandedPipelines] = useState<Record<number, boolean>>({});

  const togglePipelineExpand = (pId: number) => {
    setExpandedPipelines((prev) => ({
      ...prev,
      [pId]: !prev[pId],
    }));
  };

  const expandAllPipelines = (pipelineIds: number[]) => {
    const next: Record<number, boolean> = {};
    pipelineIds.forEach((id) => {
      next[id] = true;
    });
    setExpandedPipelines(next);
  };

  const collapseAllPipelines = () => {
    setExpandedPipelines({});
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
                  <div className="space-y-4 animate-in fade-in-50 duration-200">
                    <StageTimeBarChart
                      items={statsQuery.data.items || []}
                      onStageClick={handleStageClick}
                    />
                    <StagesStatsTable
                      items={statsQuery.data.items || []}
                      onStageClick={handleStageClick}
                    />
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-500">
                    {lang === 'uz' ? 'Tanlangan voronka bo\'yicha ma\'lumot yo\'q' : 'Нет данных по этапам для выбранной воронки'}
                  </div>
                )
              ) : (
                // All pipelines view (collapsed by default, expandable with chart & table)
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
                  <div className="space-y-4">
                    {/* Control Bar: Expand all / Collapse all */}
                    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {lang === 'uz'
                          ? `Jami ${allStatsQuery.data.pipelines.length} ta voronka (ochish uchun bosing)`
                          : `Всего воронок: ${allStatsQuery.data.pipelines.length} (нажмите на воронку для просмотра графиков и деталей)`}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => expandAllPipelines(allStatsQuery.data!.pipelines.map((p) => p.pipelineId))}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 transition-colors cursor-pointer"
                        >
                          {lang === 'uz' ? 'Barchasini ochish' : 'Развернуть все'}
                        </button>
                        <button
                          type="button"
                          onClick={collapseAllPipelines}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                        >
                          {lang === 'uz' ? 'Barchasini yopish' : 'Свернуть все'}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {allStatsQuery.data.pipelines.map((p) => {
                        const isExpanded = !!expandedPipelines[p.pipelineId];
                        const workingStages = (p.items || []).filter(
                          (s) => s.externalId !== '142' && s.externalId !== '143' && (s.avgSecondsActual || 0) > 0,
                        );
                        const bottleneck = workingStages.reduce<any>((max, s) => {
                          if (!max || (s.avgSecondsActual || 0) > (max.avgSecondsActual || 0)) return s;
                          return max;
                        }, null);

                        return (
                          <div
                            key={p.pipelineId}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden transition-all"
                          >
                            {/* Pipeline Card Header (Clickable anywhere to expand/collapse) */}
                            <div
                              onClick={() => togglePipelineExpand(p.pipelineId)}
                              className="px-5 py-4 bg-slate-50/80 dark:bg-slate-800/50 hover:bg-slate-100/70 dark:hover:bg-slate-800/80 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                                  <ChevronDown
                                    size={18}
                                    className={`transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                                      {p.pipelineName}
                                    </h3>
                                    {bottleneck && !isExpanded && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                                        <AlertTriangle size={11} className="text-rose-500 shrink-0" />
                                        <span className="truncate max-w-[220px]">
                                          {lang === 'uz' ? 'Tor joy: ' : 'Затык: '}{bottleneck.name} ({formatDuration(bottleneck.avgSecondsActual)})
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    <span>{p.items?.length || 0} {lang === 'uz' ? 'bosqich' : 'этапов'}</span>
                                    <span>•</span>
                                    <span>{p.totalPassedLeads || 0} {lang === 'uz' ? 'o\'tgan' : 'прошедших'}</span>
                                    <span>•</span>
                                    <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                                      {p.totalActiveLeads || 0} {lang === 'uz' ? 'ishda' : 'в работе'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPipelineId(p.pipelineId);
                                    applyFilters();
                                  }}
                                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
                                >
                                  {lang === 'uz' ? 'Faqat shu voronkani tanlash' : 'Выбрать только эту воронку'}
                                </button>
                              </div>
                            </div>

                            {/* Pipeline Stages (Chart + Table) */}
                            {isExpanded && (
                              <div className="p-4 sm:p-5 space-y-4 animate-in fade-in-50 duration-200">
                                <StageTimeBarChart
                                  items={p.items || []}
                                  onStageClick={handleStageClick}
                                />
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
