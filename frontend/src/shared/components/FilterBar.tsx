import { Filter, Users, Tag as TagIcon, Check, X } from 'lucide-react';
import { useFilterContext } from '../context/FilterContext';
import { useLanguage } from '../../i18n/LanguageContext';
import MultiSelectDropdown from './MultiSelectDropdown';
import { ReactNode } from 'react';
import { DatePreset } from '../types/filters';

interface FilterBarProps {
  showStatus?: boolean;
  className?: string;
  children?: ReactNode;
  onApplyExtra?: () => void;
  onResetExtra?: () => void;
  isExtraDirty?: boolean;
}

export default function FilterBar({
  showStatus = true,
  className = '',
  children,
  onApplyExtra,
  onResetExtra,
  isExtraDirty = false,
}: FilterBarProps) {
  const { t, lang } = useLanguage();
  const {
    pipelineId,
    setPipelineId,
    pipelines,
    selectedStatus,
    setSelectedStatus,
    selectedManagers,
    setSelectedManagers,
    managers,
    selectedTags,
    setSelectedTags,
    tags,
    datePreset,
    setDatePreset,
    dateFrom,
    dateTo,
    setCustomDates,
    applied,
    applyFilters,
    resetFilters,
    isDirty,
  } = useFilterContext();

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
    <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs mb-4 space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center text-xs font-semibold text-slate-400 dark:text-slate-500">
          <Filter size={14} />
        </div>

        {/* Pipeline selector */}
        <select
          value={pipelineId ? String(pipelineId) : 'all'}
          onChange={(e) => {
            const val = e.target.value;
            const nextPipelineId = val === 'all' || !val ? null : parseInt(val, 10);
            setPipelineId(nextPipelineId);
          }}
          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200"
        >
          <option value="all">{t('pipeline_all')}</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {t('pipeline')}: {p.name}
            </option>
          ))}
        </select>

        {/* Deal status selector */}
        {showStatus && (
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
        )}

        {/* Multi-select Managers */}
        <MultiSelectDropdown
          label={lang === 'uz' ? 'Menejerlar' : 'Менеджеры'}
          placeholder={lang === 'uz' ? 'Barcha menejerlar' : 'Все менеджеры'}
          options={managers}
          selectedIds={selectedManagers}
          icon={<Users size={13} />}
          onChange={(nextIds) => setSelectedManagers(nextIds)}
        />

        {/* Multi-select Tags */}
        <MultiSelectDropdown
          label={lang === 'uz' ? 'Teglar' : 'Теги'}
          placeholder={lang === 'uz' ? 'Barcha teglar' : 'Все теги'}
          options={tags}
          selectedIds={selectedTags}
          prefix="#"
          icon={<TagIcon size={13} />}
          onChange={(nextIds) => setSelectedTags(nextIds)}
        />

        {/* Optional Module-specific Extra Filters */}
        {children}

        {/* Date presets */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          {datePresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setDatePreset(preset.id)}
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
              onChange={(e) => setCustomDates(e.target.value, dateTo)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200"
            />
            <span className="text-slate-400">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setCustomDates(dateFrom, e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200"
            />
          </div>
        )}

        {/* Action buttons: Qo'llash / Применить & Bekor qilish / Сбросить */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => {
              applyFilters();
              onApplyExtra?.();
            }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              (isDirty || isExtraDirty)
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md ring-2 ring-indigo-400/40'
                : 'bg-indigo-600/90 hover:bg-indigo-600 text-white shadow-xs'
            }`}
          >
            <Check size={14} />
            <span>{lang === 'uz' ? 'Qo‘llash' : 'Применить'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              resetFilters();
              onResetExtra?.();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 dark:hover:border-rose-700 text-xs font-medium transition-colors cursor-pointer"
          >
            <X size={14} />
            <span>{t('reset')}</span>
          </button>
        </div>
      </div>

      {/* Active multi-select badges */}
      {(selectedManagers.length > 0 || selectedTags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          {selectedManagers.map((id) => {
            const m = managers.find((x) => x.id === id);
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
            const tg = tags.find((x) => x.id === id);
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
  );
}
