import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign,
  Award,
  Tag as TagIcon,
  XCircle,
  Filter,
  ShieldAlert,
  Target,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { py2Api } from '../api/bi-analytics.api';
import { userApi } from '@/api/client';
import { useLanguage } from '@/i18n/LanguageContext';
import AiChatDrawer from '@/modules/ai_chat/components/AiChatDrawer';
import { useFilterContext } from '@/shared/context/FilterContext';
import FilterBar from '@/shared/components/FilterBar';
import MultiSelectDropdown from '@/shared/components/MultiSelectDropdown';

import { BiTab, MultiSelectOption } from '../types';
import OverviewTab from '../components/tabs/OverviewTab';
import ManagersTab from '../components/tabs/ManagersTab';
import MarketingTab from '../components/tabs/MarketingTab';
import LossesTab from '../components/tabs/LossesTab';
import CustomFieldsTab from '../components/tabs/CustomFieldsTab';
import RiskAuditTab from '../components/tabs/RiskAuditTab';

export default function BiAnalyticsPage() {
  const { t } = useLanguage();
  const qc = useQueryClient();
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

  const {
    effectiveAccountId,
    applied,
    pipelineId,
    pipelines,
  } = useFilterContext();

  const [activeTab, setActiveTab] = useState<BiTab>('overview');
  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([]);

  // AI Status query
  const aiStatus = useQuery({
    queryKey: ['ai-status', effectiveAccountId],
    queryFn: () => userApi.getAiStatus(effectiveAccountId!),
    enabled: !!effectiveAccountId,
  });

  const prevSourcesRef = useRef<MultiSelectOption[]>([]);

  const biQuery = useQuery({
    queryKey: [
      'py2-bi-analytics',
      effectiveAccountId,
      applied.pipelineId,
      applied.dateFrom,
      applied.dateTo,
      applied.managerIds,
      applied.tagIds,
      selectedSourceIds,
    ],
    queryFn: () => {
      const activeSourceNames = selectedSourceIds
        .map((id: number) => prevSourcesRef.current.find((s) => s.id === id)?.name)
        .filter(Boolean) as string[];
      return py2Api.analytics(effectiveAccountId!, {
        pipelineId: applied.pipelineId,
        dateFrom: applied.dateFrom || undefined,
        dateTo: applied.dateTo || undefined,
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
    mutationFn: () => py2Api.triggerEnrich(effectiveAccountId!),
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['py2-bi-analytics', effectiveAccountId] });
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

          {/* Unified Filter Bar with extra Sources filter */}
          <FilterBar showStatus={false}>
            {sourcesList.length > 0 && (
              <MultiSelectDropdown
                label="Источники"
                placeholder="Все источники"
                options={sourcesList}
                selectedIds={selectedSourceIds}
                icon={<Target size={13} />}
                onChange={(nextIds) => setSelectedSourceIds(nextIds)}
              />
            )}
          </FilterBar>

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
              pipelineId={applied.pipelineId}
              pipelineName={pipelines.find((p) => p.id === applied.pipelineId)?.name}
              filters={{
                managerIds: applied.managerIds,
                tagIds: applied.tagIds,
                dateFrom: applied.dateFrom || undefined,
                dateTo: applied.dateTo || undefined,
              }}
              modelName={aiStatus.data?.model}
            />
          </aside>
        )}

        {/* Floating AI Button (Mobile / Non-Wide) */}
        {aiStatus.data?.enabled && (!isWideScreen || !chatOpen) && (
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
        {effectiveAccountId && !isWideScreen && chatOpen && (
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
          />
        )}
      </div>
    </div>
  );
}
