import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';
import { MultiSelectOption } from '../../types';

export interface MultiSelectDropdownProps {
  label: string;
  placeholder: string;
  options: MultiSelectOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  prefix?: string;
  icon?: React.ReactNode;
}

export default function MultiSelectDropdown({
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
            ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-semibold'
            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
      >
        {icon}
        <span>
          {selectedIds.length === 0
            ? placeholder
            : `${label} (${selectedIds.length})`}
        </span>
        {selectedIds.length > 0 && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            className="ml-0.5 px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[10px] font-bold hover:bg-rose-500 transition-colors"
          >
            ×
          </span>
        )}
        <ChevronDown size={13} className={`opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-2.5 space-y-2 animate-in fade-in-50">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-200"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] px-1 text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span>Выбрано: {selectedIds.length}</span>
            <div className="space-x-2">
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Все
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-rose-500 hover:underline cursor-pointer"
              >
                Сброс
              </button>
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1 text-xs">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-slate-400 text-xs">Ничего не найдено</div>
            ) : (
              filtered.map((item) => {
                const checked = selectedIds.includes(item.id);
                return (
                  <label
                    key={item.id}
                    onClick={() => toggleId(item.id)}
                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer select-none transition-colors ${
                      checked
                        ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div
                        className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
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
