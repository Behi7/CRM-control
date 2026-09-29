import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Language, TranslationKey } from './translations';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  formatDuration: (seconds: number | null | undefined) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('app_lang');
    if (saved === 'ru' || saved === 'uz') return saved;
    return 'ru';
  });

  const setLang = (nextLang: Language) => {
    setLangState(nextLang);
    localStorage.setItem('app_lang', nextLang);
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    const dict = (translations[lang] || translations.ru) as Record<string, string>;
    let str: string = dict[key] || translations.ru[key] || (key as string);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    return str;
  };

  const formatDuration = (seconds: number | null | undefined): string => {
    if (seconds === null || seconds === undefined) return '—';
    if (!seconds) return lang === 'uz' ? '0 son' : '0 сек';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts: string[] = [];
    if (lang === 'uz') {
      if (d > 0) parts.push(`${d}k`);
      if (h > 0) parts.push(`${h}s`);
      if (m > 0) parts.push(`${m}d`);
      return parts.join(' ') || '<1d';
    } else {
      if (d > 0) parts.push(`${d}д`);
      if (h > 0) parts.push(`${h}ч`);
      if (m > 0) parts.push(`${m}м`);
      return parts.join(' ') || '<1м';
    }
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, formatDuration }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
