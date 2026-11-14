import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Sparkles, CheckCircle2, ArrowLeft, MessageCircle, Mail, Phone, X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export interface ModuleUpsellViewProps {
  icon: React.ReactNode;
  moduleName: string;
  tagline: string;
  description: string;
  features: string[];
}

export default function ModuleUpsellView({
  icon,
  moduleName,
  tagline,
  description,
  features,
}: ModuleUpsellViewProps) {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const [showContactModal, setShowContactModal] = useState(false);

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-10 shadow-xl relative overflow-hidden text-center animate-in fade-in zoom-in-95 duration-200">
        {/* Background decorative glow */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-purple-500/10 dark:bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-blue-500/10 dark:bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Badge & Lock */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 text-xs font-bold mb-6">
          <Lock size={12} className="shrink-0" />
          <span>{t('module_upsell_badge')}</span>
        </div>

        {/* Big Icon */}
        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-purple-500/10 to-indigo-500/10 dark:from-purple-500/20 dark:to-indigo-500/20 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-5 shadow-sm">
          {icon}
        </div>

        {/* Module Title */}
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-2">
          {moduleName}
        </h1>
        <p className="text-sm font-semibold text-purple-600 dark:text-purple-400 mb-4">
          {tagline}
        </p>

        {/* Description */}
        <p className="text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto mb-8 leading-relaxed">
          {description}
        </p>

        {/* Key Features List */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 mb-8 text-left space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
            <Sparkles size={14} className="text-amber-500" />
            <span>{lang === 'uz' ? 'Imkoniyatlar va foyda' : 'Что входит в этот модуль:'}</span>
          </div>
          {features.map((feature, idx) => (
            <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200 leading-snug">
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
              <span>{feature}</span>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setShowContactModal(true)}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs shadow-lg shadow-purple-600/25 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Sparkles size={16} />
            <span>{t('module_upsell_btn')}</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/bi')}
            className="w-full sm:w-auto px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <ArrowLeft size={15} />
            <span>{t('module_upsell_back')}</span>
          </button>
        </div>

        {/* Contact info prompt modal */}
        {showContactModal && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={() => setShowContactModal(false)}
          >
            <div
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 text-left shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X size={18} />
              </button>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    {lang === 'uz' ? 'Modulni ulash' : 'Подключение модуля'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {moduleName}
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-5">
                {t('module_upsell_contact_prompt')}
              </p>

              <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
                  <MessageCircle size={18} className="text-blue-500 shrink-0" />
                  <div className="text-xs">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {lang === 'uz' ? 'Qo‘llab-quvvatlash xizmati' : 'Служба заботы и продаж'}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                      Telegram / WhatsApp
                    </div>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
                  <Mail size={18} className="text-purple-500 shrink-0" />
                  <div className="text-xs">
                    <div className="font-semibold text-slate-900 dark:text-white">Email</div>
                    <div className="text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                      support@amocrm-analytics.com
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                className="mt-6 w-full py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs transition-colors cursor-pointer"
              >
                {lang === 'uz' ? 'Tushundim' : 'Понятно'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
