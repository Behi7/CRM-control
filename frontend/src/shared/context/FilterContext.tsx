import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { userApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { decodeJwt } from '../../lib/jwt';
import { DatePreset, MultiSelectOption } from '../types/filters';
import { getPresetDates } from '../lib/dates';

export interface AppliedFilters {
  pipelineId: number | null;
  managerIds: number[];
  tagIds: number[];
  status: string;
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
}

interface FilterContextType {
  effectiveAccountId: number | null;
  pipelineId: number | null;
  setPipelineId: (id: number | null) => void;
  selectedManagers: number[];
  setSelectedManagers: (ids: number[]) => void;
  selectedTags: number[];
  setSelectedTags: (ids: number[]) => void;
  selectedStatus: string;
  setSelectedStatus: (status: string) => void;
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
  setDatePreset: (preset: DatePreset) => void;
  setCustomDates: (from: string, to: string) => void;
  applied: AppliedFilters;
  applyFilters: () => void;
  resetFilters: () => void;
  isDirty: boolean;
  pipelinesQuery: UseQueryResult<any, Error>;
  managersQuery: UseQueryResult<any, Error>;
  tagsQuery: UseQueryResult<any, Error>;
  pipelines: MultiSelectOption[];
  managers: MultiSelectOption[];
  tags: MultiSelectOption[];
}

const FilterContext = createContext<FilterContextType | null>(null);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const { accountId: paramAccountId } = useParams<{ accountId?: string }>();
  const { role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Resolve effective account ID
  const decodedAccountId = useMemo(() => {
    const token = localStorage.getItem('access_token');
    return decodeJwt(token)?.accountId ?? null;
  }, []);

  const storedAccId = Number(localStorage.getItem('active_account_id')) || null;
  const effectiveAccountId =
    (paramAccountId ? parseInt(paramAccountId, 10) : null) ??
    (role === 'viewer' ? decodedAccountId : storedAccId ?? 1);

  const prevAccountRef = useRef<number | null>(effectiveAccountId);

  // Initialize from searchParams
  const initPipelineId = Number(searchParams.get('pipeline')) || null;
  const initTagIds = (searchParams.get('tags') || '').split(',').filter(Boolean).map(Number).filter(Number.isInteger);
  const initStatus = searchParams.get('status') || 'all';
  const initManagerIds = (searchParams.get('managers') || '').split(',').filter(Boolean).map(Number).filter((n) => !isNaN(n) && n > 0);
  const initPreset = (searchParams.get('preset') || 'all') as DatePreset;
  let initFrom = searchParams.get('dateFrom') || '';
  let initTo = searchParams.get('dateTo') || '';
  if (initFrom && initTo && initFrom > initTo) {
    const tmp = initFrom;
    initFrom = initTo;
    initTo = tmp;
  }

  // Draft filters
  const [pipelineId, setPipelineId] = useState<number | null>(initPipelineId);
  const [selectedManagers, setSelectedManagers] = useState<number[]>(initManagerIds);
  const [selectedTags, setSelectedTags] = useState<number[]>(initTagIds);
  const [selectedStatus, setSelectedStatus] = useState<string>(initStatus);
  const [datePreset, setDatePresetState] = useState<DatePreset>(initPreset);
  const [dateFrom, setDateFrom] = useState<string>(initFrom);
  const [dateTo, setDateTo] = useState<string>(initTo);

  // Applied filters driving queries
  const [applied, setApplied] = useState<AppliedFilters>(() => ({
    pipelineId: initPipelineId,
    managerIds: initManagerIds,
    tagIds: initTagIds,
    status: initStatus,
    datePreset: initPreset,
    dateFrom: initFrom,
    dateTo: initTo,
  }));

  // Account queries
  const pipelinesQuery = useQuery({
    queryKey: ['pipelines', effectiveAccountId],
    queryFn: () => userApi.pipelines(effectiveAccountId!),
    enabled: !!effectiveAccountId,
  });

  const managersQuery = useQuery({
    queryKey: ['managers', effectiveAccountId],
    queryFn: () => userApi.managers(effectiveAccountId!),
    enabled: !!effectiveAccountId,
  });

  const tagsQuery = useQuery({
    queryKey: ['tags', effectiveAccountId],
    queryFn: () => userApi.tags(effectiveAccountId!),
    enabled: !!effectiveAccountId,
  });

  // Reset filters when active account changes
  useEffect(() => {
    if (prevAccountRef.current !== effectiveAccountId) {
      prevAccountRef.current = effectiveAccountId;
      setPipelineId(null);
      setSelectedTags([]);
      setSelectedManagers([]);
      setSelectedStatus('all');
      setApplied((prev) => ({
        ...prev,
        pipelineId: null,
        tagIds: [],
        managerIds: [],
        status: 'all',
      }));
    }
  }, [effectiveAccountId]);

  // Sync draft states if URL searchParams change externally (e.g. browser back/forward)
  useEffect(() => {
    const pId = Number(searchParams.get('pipeline')) || null;
    const tIds = (searchParams.get('tags') || '').split(',').filter(Boolean).map(Number).filter(Number.isInteger);
    const st = searchParams.get('status') || 'all';
    const mIds = (searchParams.get('managers') || '').split(',').filter(Boolean).map(Number).filter((n) => !isNaN(n) && n > 0);
    const dPreset = (searchParams.get('preset') || 'all') as DatePreset;
    let dFrom = searchParams.get('dateFrom') || '';
    let dTo = searchParams.get('dateTo') || '';
    if (dFrom && dTo && dFrom > dTo) {
      const tmp = dFrom;
      dFrom = dTo;
      dTo = tmp;
    }

    if (pId !== null && pId !== pipelineId) {
      setPipelineId(pId);
    }
    setSelectedTags((prev) => (prev.length === tIds.length && prev.every((v, i) => v === tIds[i]) ? prev : tIds));
    setSelectedStatus((prev) => (prev !== st ? st : prev));
    setSelectedManagers((prev) => (prev.length === mIds.length && prev.every((v, i) => v === mIds[i]) ? prev : mIds));
    setDatePresetState((prev) => (prev !== dPreset ? dPreset : prev));
    setDateFrom((prev) => (prev !== dFrom ? dFrom : prev));
    setDateTo((prev) => (prev !== dTo ? dTo : prev));
  }, [searchParams]);

  const updateUrlParams = (
    nextPipe: number | null,
    nextTags: number[],
    nextStatus: string,
    nextManagers: number[],
    nextPreset: DatePreset,
    nextFrom: string,
    nextTo: string,
  ) => {
    const next = new URLSearchParams(searchParams);
    if (nextPipe) next.set('pipeline', String(nextPipe));
    else next.delete('pipeline');
    if (nextTags.length > 0) next.set('tags', nextTags.join(','));
    else next.delete('tags');
    if (nextStatus && nextStatus !== 'all') next.set('status', nextStatus);
    else next.delete('status');
    if (nextManagers.length > 0) next.set('managers', nextManagers.join(','));
    else next.delete('managers');
    if (nextPreset && nextPreset !== 'all') next.set('preset', nextPreset);
    else next.delete('preset');
    if (nextFrom) next.set('dateFrom', nextFrom);
    else next.delete('dateFrom');
    if (nextTo) next.set('dateTo', nextTo);
    else next.delete('dateTo');
    setSearchParams(next);
  };

  // Auto-select first pipeline if none selected or selected is invalid for current account
  useEffect(() => {
    if (!pipelinesQuery.data?.items?.length) return;
    const items = pipelinesQuery.data.items;
    const exists = items.some((p: any) => p.id === pipelineId);
    if (!exists) {
      const firstId = items[0].id;
      setPipelineId(firstId);
      setApplied((prev) => ({ ...prev, pipelineId: firstId }));
      updateUrlParams(firstId, selectedTags, selectedStatus, selectedManagers, datePreset, dateFrom, dateTo);
    }
  }, [pipelinesQuery.data, pipelineId]);

  const setDatePreset = (preset: DatePreset) => {
    setDatePresetState(preset);
    if (preset !== 'custom') {
      const { from, to } = getPresetDates(preset);
      setDateFrom(from);
      setDateTo(to);
    }
  };

  const setCustomDates = (from: string, to: string) => {
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

  const isDirty =
    pipelineId !== applied.pipelineId ||
    selectedStatus !== applied.status ||
    datePreset !== applied.datePreset ||
    dateFrom !== applied.dateFrom ||
    dateTo !== applied.dateTo ||
    selectedTags.join(',') !== applied.tagIds.join(',') ||
    selectedManagers.join(',') !== applied.managerIds.join(',');

  const applyFilters = () => {
    setApplied({
      pipelineId,
      tagIds: [...selectedTags],
      status: selectedStatus,
      managerIds: [...selectedManagers],
      datePreset,
      dateFrom,
      dateTo,
    });
    updateUrlParams(pipelineId, selectedTags, selectedStatus, selectedManagers, datePreset, dateFrom, dateTo);
  };

  const resetFilters = () => {
    const firstId = pipelinesQuery.data?.items?.[0]?.id || pipelineId;
    setPipelineId(firstId);
    setSelectedTags([]);
    setSelectedStatus('all');
    setSelectedManagers([]);
    setDatePresetState('all');
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
    updateUrlParams(firstId, [], 'all', [], 'all', '', '');
  };

  const pipelines: MultiSelectOption[] = pipelinesQuery.data?.items || [];
  const managers: MultiSelectOption[] = managersQuery.data?.items || [];
  const tags: MultiSelectOption[] = tagsQuery.data?.items || [];

  return (
    <FilterContext.Provider
      value={{
        effectiveAccountId,
        pipelineId,
        setPipelineId,
        selectedManagers,
        setSelectedManagers,
        selectedTags,
        setSelectedTags,
        selectedStatus,
        setSelectedStatus,
        datePreset,
        dateFrom,
        dateTo,
        setDatePreset,
        setCustomDates,
        applied,
        applyFilters,
        resetFilters,
        isDirty,
        pipelinesQuery,
        managersQuery,
        tagsQuery,
        pipelines,
        managers,
        tags,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilterContext() {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    throw new Error('useFilterContext must be used within a FilterProvider');
  }
  return ctx;
}
