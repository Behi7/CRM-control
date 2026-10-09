import { useLanguage } from '../i18n/LanguageContext';
import { Globe } from 'lucide-react';

interface LanguageSwitcherProps {
  className?: string;
  showIcon?: boolean;
}

export default function LanguageSwitcher({ className = '', showIcon = false }: LanguageSwitcherProps) {
  const { lang, setLang } = useLanguage();

  return (
    <div
      className={`inline-flex items-center rounded-lg p-0.5 bg-slate-200/80 dark:bg-slate-800 border border-slate-300/80 dark:border-slate-700 text-xs font-semibold ${className}`}
    >
      {showIcon && <Globe size={13} className="ml-1.5 mr-0.5 text-slate-500 dark:text-slate-400" />}
      <button
        type="button"
        onClick={() => setLang('ru')}
        className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
          lang === 'ru'
            ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
        }`}
      >
        RU
      </button>
      <button
        type="button"
        onClick={() => setLang('uz')}
        className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
          lang === 'uz'
            ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs font-bold'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
        }`}
      >
        UZ
      </button>
    </div>
  );
}

