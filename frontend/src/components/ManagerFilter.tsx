import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export interface ManagerItem {
  id: number;
  name: string;
}

interface ManagerFilterProps {
  managers?: ManagerItem[];
  selectedManagers: number[];
  onChange: (selected: number[]) => void;
  showIcon?: boolean;
}

export const ManagerFilter: React.FC<ManagerFilterProps> = ({
  managers = [],
  selectedManagers,
  onChange,
  showIcon = false,
}) => {
  const { t } = useLanguage();

  if (!managers || managers.length === 0) return null;

  const isAllSelected = selectedManagers.length === 0;

  const handleSelectAll = () => {
    onChange([]);
  };

  const handleToggleManager = (id: number) => {
    const isSelected = selectedManagers.includes(id);
    const next = isSelected
      ? selectedManagers.filter((x) => x !== id)
      : [...selectedManagers, id];
    onChange(next);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm mb-4">
      <div className="flex justify-between items-center mb-2">
        <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">
          {t('filter_managers')}
        </label>
        {!isAllSelected && (
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-xs text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
          >
            {t('reset')} ({selectedManagers.length})
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSelectAll}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
            isAllSelected
              ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
          }`}
        >
          {t('all')}
        </button>
        {managers.map((m) => {
          const isSelected = selectedManagers.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => handleToggleManager(m.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
            >
              {showIcon && <span className="mr-1">👤</span>}
              {m.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};
