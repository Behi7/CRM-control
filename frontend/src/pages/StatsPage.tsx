import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { userApi, adminApi, FilterParams } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { Sparkles } from 'lucide-react';
import AiChatDrawer from '../components/AiChatDrawer';
import { useFilterContext } from '../shared/context/FilterContext';
import FilterBar from '../shared/components/FilterBar';
import StagesStatsTable from '../modules/analytics/components/StagesStatsTable';

export default function StatsPage() {
  const { accountId: paramAccountId } = useParams();
  const { role } = useAuth();
  const { t } = useLanguage();
  const nav = useNavigate();
  const [chatOpen, setChatOpen] = useState(false);

  const {
    effectiveAccountId,
    pipelineId,
    applied,
    pipelines,
  } = useFilterContext();

  const adminAccounts = useQuery({
    queryKey: ['adminAccounts'],
    queryFn: adminApi.listAccounts,
    enabled: role === 'admin' && !paramAccountId,
  });

  const aiStatus = useQuery({
    queryKey: ['ai-status', effectiveAccountId],
    queryFn: () => userApi.getAiStatus(effectiveAccountId!),
    enabled: !!effectiveAccountId,
  });

  const filters: FilterParams = useMemo(() => ({
    tagIds: applied.tagIds,
    managerIds: applied.managerIds,
    dateFrom: applied.dateFrom || undefined,
    dateTo: applied.dateTo || undefined,
    status: applied.status,
  }), [applied]);

  const stats = useQuery({
    queryKey: ['stats', applied.pipelineId, filters],
    queryFn: () => userApi.stagesStats(applied.pipelineId!, filters),
    enabled: !!applied.pipelineId,
  });

  // Admin client selection if no accountId in route
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

  const handleStageClick = (stageId: number) => {
    const path = role === 'admin' ? `/admin/stage/${stageId}` : `/stage/${stageId}`;
    const params = new URLSearchParams();
    if (applied.tagIds.length > 0) params.set('tags', applied.tagIds.join(','));
    if (applied.status && applied.status !== 'all') params.set('status', applied.status);
    if (applied.managerIds.length > 0) params.set('managers', applied.managerIds.join(','));
    if (applied.dateFrom) params.set('dateFrom', applied.dateFrom);
    if (applied.dateTo) params.set('dateTo', applied.dateTo);
    const qs = params.toString();
    nav(qs ? `${path}?${qs}` : path);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Unified Filter Bar */}
        <FilterBar showStatus={true} />

        {/* Stages Stats Table */}
        {stats.data && (
          <StagesStatsTable
            items={stats.data.items || []}
            onStageClick={handleStageClick}
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

        {/* AI Chat Drawer */}
        {aiStatus.data?.enabled && effectiveAccountId && (
          <AiChatDrawer
            accountId={effectiveAccountId}
            isOpen={chatOpen}
            onClose={() => setChatOpen(false)}
            pipelineId={pipelineId}
            pipelineName={pipelines.find((p) => p.id === pipelineId)?.name}
            filters={filters}
            modelName={aiStatus.data?.model}
            isAiEnabled={aiStatus.data?.enabled}
          />
        )}
      </div>
    </div>
  );
}
