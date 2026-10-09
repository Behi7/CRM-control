import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';

interface ThemeToggleProps {
  className?: string;
}

export default function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center justify-center p-1.5 rounded-lg border transition-all cursor-pointer select-none text-xs font-medium ${
        isDark
          ? 'bg-slate-800 hover:bg-slate-700 text-indigo-300 border-slate-700 hover:border-slate-600 shadow-sm'
          : 'bg-white hover:bg-slate-100 text-amber-500 border-slate-300/80 hover:border-slate-400 shadow-xs'
      } ${className}`}
      title={isDark ? 'Переключить на светлую тему' : 'Переключить на темную тему'}
      aria-label={isDark ? 'Переключить на светлую тему' : 'Переключить на темную тему'}
    >
      {isDark ? (
        <Moon size={16} className="text-indigo-300 animate-in -spin-in-90 duration-200" />
      ) : (
        <Sun size={16} className="text-amber-500 animate-in spin-in-90 duration-200" />
      )}
    </button>
  );
}
