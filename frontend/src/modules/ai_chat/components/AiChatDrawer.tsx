import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { userApi, FilterParams } from '@/api/client';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Trash2,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  Clock,
  Search,
  ChevronDown,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

interface AiChatDrawerProps {
  accountId: number;
  isOpen: boolean;
  onClose: () => void;
  pipelineId?: number | null;
  pipelineName?: string;
  filters?: FilterParams;
  modelName?: string;
  isAiEnabled?: boolean;
  biData?: any;
  activeBiTab?: string;
  variant?: 'overlay' | 'docked';
  pipelines?: Array<{ id: number; name: string }>;
}

const BI_AVAILABLE_BLOCKS = [
  { id: 'overview', label: 'Обзор', labelUz: 'Umumiy' },
  { id: 'time_stages', label: 'Время на этапах', labelUz: 'Bosqichlar vaqti' },
  { id: 'managers', label: 'Менеджеры', labelUz: 'Menejerlar' },
  { id: 'marketing', label: 'Источники', labelUz: 'Manbalar' },
  { id: 'losses', label: 'Отказы', labelUz: 'Rad etishlar' },
  { id: 'custom_fields', label: 'Списки', labelUz: 'Maydonlar' },
  { id: 'risk_deals', label: 'Зона риска', labelUz: 'Xavf zonasi' },
];

function tabToBlockId(tab?: string): string {
  if (tab === 'time_stages') return 'time_stages';
  if (tab === 'managers') return 'managers';
  if (tab === 'marketing') return 'marketing';
  if (tab === 'losses_ltv') return 'losses';
  if (tab === 'custom_fields') return 'custom_fields';
  if (tab === 'risk_audit') return 'risk_deals';
  return 'overview';
}

// Simple and safe markdown formatter for AI responses
function FormattedMessage({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }

        // Headers
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="font-bold text-slate-900 dark:text-slate-100 mt-2 text-sm">
              {formatInline(trimmed.replace('### ', ''))}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={idx} className="font-bold text-slate-900 dark:text-slate-100 mt-2.5 text-base border-b border-slate-200 dark:border-slate-800 pb-0.5">
              {formatInline(trimmed.replace('## ', ''))}
            </h3>
          );
        }

        // Bullet lists
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-2 ml-1">
              <span className="text-purple-600 dark:text-purple-400 font-bold shrink-0 mt-0.5">•</span>
              <span>{formatInline(trimmed.substring(2))}</span>
            </div>
          );
        }

        // Numbered lists (e.g. "1. ")
        const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numberedMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 ml-1">
              <span className="text-purple-600 dark:text-purple-400 font-semibold shrink-0 mt-0.5">
                {numberedMatch[1]}.
              </span>
              <span>{formatInline(numberedMatch[2])}</span>
            </div>
          );
        }

        return <p key={idx}>{formatInline(line)}</p>;
      })}
    </div>
  );
}

function formatInline(str: string): React.ReactNode[] {
  const parts = str.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="bg-slate-100 dark:bg-slate-800 text-purple-700 dark:text-purple-300 px-1 py-0.5 rounded text-xs font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export default function AiChatDrawer({
  accountId,
  isOpen,
  onClose,
  pipelineId,
  pipelineName,
  filters,
  modelName,
  isAiEnabled,
  biData,
  activeBiTab,
  variant = 'overlay',
  pipelines = [],
}: AiChatDrawerProps) {
  const { lang, t } = useLanguage();
  const [input, setInput] = useState('');

  const [selectedPipelineForStages, setSelectedPipelineForStages] = useState<number | 'all'>(() => {
    return pipelineId || 'all';
  });

  const [pipelineModalOpen, setPipelineModalOpen] = useState(false);
  const [pipelineSearchQuery, setPipelineSearchQuery] = useState('');

  useEffect(() => {
    if (pipelineId) {
      setSelectedPipelineForStages(pipelineId);
    }
  }, [pipelineId]);

  const filteredPipelines = useMemo(() => {
    if (!pipelineSearchQuery) return pipelines;
    const q = pipelineSearchQuery.toLowerCase();
    return pipelines.filter((p) => p.name.toLowerCase().includes(q));
  }, [pipelines, pipelineSearchQuery]);

  const getStageBlockLabel = () => {
    let pName = '';
    if (selectedPipelineForStages === 'all') {
      pName = lang === 'uz' ? 'Barcha voronkalar' : 'Все воронки';
    } else {
      const pObj = pipelines.find((p) => p.id === selectedPipelineForStages);
      pName = pObj?.name || (pipelineName ? pipelineName : (lang === 'uz' ? 'Voronka' : 'Воронка'));
    }
    return lang === 'uz' ? `Bosqichlar vaqti: ${pName}` : `Время на этапах: ${pName}`;
  };

  const storageKey = biData
    ? `amocrm_ai_chat_bi_${accountId}`
    : `amocrm_ai_chat_${accountId}_${pipelineId || 'all'}`;

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      {
        id: 'welcome',
        role: 'model',
        text: t('ai_welcome_text'),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  });

  // Save messages to localStorage when updated
  useEffect(() => {
    try {
      if (messages.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(messages));
      }
    } catch {}
  }, [messages, storageKey]);

  const [selectedBiBlocks, setSelectedBiBlocks] = useState<string[]>(() => [tabToBlockId(activeBiTab)]);
  const prevTabRef = useRef(activeBiTab);

  // When activeBiTab changes in the main UI, automatically select ONLY that new block
  useEffect(() => {
    if (activeBiTab && activeBiTab !== prevTabRef.current) {
      prevTabRef.current = activeBiTab;
      setSelectedBiBlocks([tabToBlockId(activeBiTab)]);
    }
  }, [activeBiTab]);

  // Update welcome message ONLY if there are no user messages yet
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === 'welcome') {
        return [
          {
            id: 'welcome',
            role: 'model',
            text: t('ai_welcome_text'),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ];
      }
      return prev;
    });
  }, [lang, t]);

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (smooth = true) => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && messages.length > 1) {
      scrollToBottom(true);
    }
  }, [messages]);

  const sendMut = useMutation({
    mutationFn: (userText: string) => {
      const history = messages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, text: m.text }));

      const targetPipeId = selectedPipelineForStages !== 'all' ? selectedPipelineForStages : (pipelineId || undefined);
      return userApi.sendAiChat(accountId, {
        message: userText,
        history,
        pipelineId: targetPipeId,
        stagePipelineChoice: selectedPipelineForStages,
        filters: filters,
        lang,
        biData: biData || undefined,
        biSelectedBlocks: biData ? selectedBiBlocks : undefined,
      });
    },
    onSuccess: (data: any) => {
      const modelMsg: ChatMessage = {
        id: String(Date.now()),
        role: 'model',
        text: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, modelMsg]);
    },
    onError: (err: any) => {
      const errMsg: ChatMessage = {
        id: String(Date.now()),
        role: 'model',
        text: t('ai_error_prefix', { msg: err.message || t('error') }),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errMsg]);
    },
  });

  const handleSend = (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || sendMut.isPending) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    sendMut.mutate(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickPrompts = (biData || activeBiTab)
    ? [
        {
          icon: Clock,
          label: lang === 'uz' ? 'Tor joylar va bosqichlar' : 'Узкие места на этапах',
          query: lang === 'uz' ? 'Bosqichlar vaqtini tahlil qil va eng katta tor joylar (затык) qayerdaligini ko‘rsat' : 'Проанализируй время на этапах и покажи, где самые сильные узкие места (затыки) и почему сделки тормозят',
        },
        {
          icon: Lightbulb,
          label: lang === 'uz' ? 'Ko‘rsatkichlar auditi' : 'Аудит показателей',
          query: lang === 'uz' ? 'Joriy ko‘rsatkichlar va savdo voronkasini audit qil' : 'Проведи аудит текущих показателей и воронки продаж',
        },
        {
          icon: AlertTriangle,
          label: lang === 'uz' ? 'Byudjet yo‘qotishlari' : 'Утечки бюджета',
          query: lang === 'uz' ? 'Qayerda eng ko‘p pul yo‘qotyapmiz va nima sababdan?' : 'Где мы теряем больше всего денег и почему?',
        },
        {
          icon: TrendingDown,
          label: lang === 'uz' ? 'Menejerlar va intizom' : 'Менеджеры и дисциплина',
          query: lang === 'uz' ? 'Menejerlar ishi va CRM intizomini tahlil qil' : 'Оцени работу менеджеров и соблюдение CRM-дисциплины',
        },
      ]
    : [
        {
          icon: TrendingDown,
          label: t('ai_prompt_bottleneck_label'),
          query: t('ai_prompt_bottleneck_query'),
        },
        {
          icon: AlertTriangle,
          label: t('ai_prompt_skips_label'),
          query: t('ai_prompt_skips_query'),
        },
        {
          icon: Lightbulb,
          label: t('ai_prompt_advice_label'),
          query: t('ai_prompt_advice_query'),
        },
      ];

  const handleClearHistory = () => {
    const welcomeMsg: ChatMessage = {
      id: 'welcome',
      role: 'model',
      text: t('ai_dialog_cleared'),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages([welcomeMsg]);
    try {
      localStorage.setItem(storageKey, JSON.stringify([welcomeMsg]));
    } catch {}
  };

  if (!isOpen && variant !== 'docked') return null;

  const chatCard = (
    <div
      className={`w-full h-full bg-white dark:bg-slate-900 flex flex-col relative ${
        variant === 'docked'
          ? 'border-0 overflow-hidden'
          : 'w-screen max-w-lg h-full shadow-2xl border-l border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-purple-950 to-indigo-950 text-white flex justify-between items-center shrink-0 shadow">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-purple-600/30 border border-purple-400/40 flex items-center justify-center text-purple-300">
              <Sparkles size={20} className="fill-yellow-400 text-yellow-400" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          <div>
            <h3 className="font-bold text-base text-white">{t('ai_title')}</h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleClearHistory}
            title={t('ai_clear_dialog')}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={onClose}
            title={variant === 'docked' ? (lang === 'uz' ? 'AI panelini yopish' : 'Свернуть панель ИИ') : undefined}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Warning banner if AI is not enabled for this account */}
      {isAiEnabled === false && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800/60 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertTriangle size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{lang === 'uz' ? 'AI analitik yoqilmagan (Gemini API kaliti kiritilmagan).' : 'ИИ-Аналитик не активирован (в настройках аккаунта не указан API-ключ Gemini).'}</span>
        </div>
      )}

      {/* Interactive BI Blocks Context Selector (when in BI Module 02 or Analytics view) */}
      {(biData || activeBiTab || accountId) && (
        <div className="bg-white dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-200">
              {lang === 'uz' ? 'AI uchun ekran konteksti:' : 'Контекст экрана для ИИ:'}
            </span>
            <button
              type="button"
              onClick={() => {
                if (selectedBiBlocks.length === BI_AVAILABLE_BLOCKS.length) {
                  setSelectedBiBlocks([tabToBlockId(activeBiTab)]);
                } else {
                  setSelectedBiBlocks(BI_AVAILABLE_BLOCKS.map((b) => b.id));
                }
              }}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold cursor-pointer"
            >
              {selectedBiBlocks.length === BI_AVAILABLE_BLOCKS.length
                ? (lang === 'uz' ? 'Joriyga qaytarish' : 'Сбросить к текущей')
                : (lang === 'uz' ? '⚡ Hammasini tanlash' : '⚡ Выбрать всё')}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {BI_AVAILABLE_BLOCKS.map((block) => {
              const active = selectedBiBlocks.includes(block.id);

              if (block.id === 'time_stages') {
                if (active) {
                  return (
                    <div
                      key="time_stages"
                      className="inline-flex items-center gap-1 bg-emerald-600 text-white pl-2.5 pr-1.5 py-1 rounded-lg text-[11px] font-semibold shadow-xs"
                    >
                      <button
                        type="button"
                        onClick={() => setPipelineModalOpen(true)}
                        className="flex items-center gap-1 hover:opacity-90 cursor-pointer"
                        title={lang === 'uz' ? 'Voronkani o‘zgartirish' : 'Изменить воронку'}
                      >
                        <span>✓ {getStageBlockLabel()}</span>
                        <ChevronDown size={11} className="opacity-80 shrink-0" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBiBlocks((prev) => prev.filter((id) => id !== 'time_stages'));
                        }}
                        className="hover:bg-emerald-700 rounded p-0.5 transition-colors cursor-pointer"
                        title={lang === 'uz' ? 'Olib tashlash' : 'Убрать'}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                }
                return (
                  <button
                    key="time_stages"
                    type="button"
                    onClick={() => setPipelineModalOpen(true)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer flex items-center gap-1"
                  >
                    <span>+ {lang === 'uz' ? block.labelUz : block.label}</span>
                    <ChevronDown size={11} className="opacity-60 shrink-0" />
                  </button>
                );
              }

              return (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => {
                    if (active) {
                      if (selectedBiBlocks.length > 1) {
                        setSelectedBiBlocks(selectedBiBlocks.filter((id) => id !== block.id));
                      }
                    } else {
                      setSelectedBiBlocks([...selectedBiBlocks, block.id]);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    active
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {active ? '✓ ' : '+ '} {lang === 'uz' ? block.labelUz : block.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

          {/* Chat Messages */}
          <div
            ref={messagesContainerRef}
            className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/60"
          >
            {messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-xs ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-tr-xs'
                        : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-tl-xs'
                    }`}
                  >
                    {isUser ? (
                      <p className="text-sm whitespace-pre-wrap">{m.text}</p>
                    ) : (
                      <FormattedMessage text={m.text} />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 px-1">{m.timestamp}</span>
                </div>
              );
            })}

            {sendMut.isPending && (
              <div className="flex items-start gap-2">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl rounded-tl-xs px-4 py-3 shadow-xs flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                  <Loader2 size={16} className="animate-spin text-purple-600 dark:text-purple-400" />
                  <span>{t('ai_analyzing')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick prompt suggestions */}
          <div className="px-4 py-2 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
            {quickPrompts.map((qp, i) => {
              const Icon = qp.icon;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSend(qp.query)}
                  disabled={sendMut.isPending}
                  className="shrink-0 text-xs px-2.5 py-1.5 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200/60 dark:border-purple-800/60 font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Icon size={12} className="text-purple-600 dark:text-purple-400" />
                  <span>{qp.label}</span>
                </button>
              );
            })}
          </div>

          {/* Input Box */}
          <div className="p-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <div className="relative flex items-center">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={t('ai_input_placeholder')}
                disabled={sendMut.isPending}
                className="w-full pr-12 pl-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white dark:focus:bg-slate-800 resize-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim() || sendMut.isPending}
                className="absolute right-2 p-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {sendMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-1.5">
              {t('ai_footer_hint')}
            </p>
          </div>

      {/* Compulsory Pipeline Selector Modal for Stage Time Analysis */}
      {pipelineModalOpen && (
        <div
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-2xs z-50 flex items-center justify-center p-3 animate-in fade-in duration-150"
          onClick={() => setPipelineModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Clock size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {lang === 'uz' ? 'Voronkani tanlang' : 'Выберите воронку'}
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {lang === 'uz' ? 'Bosqichlar vaqti va tor joylar tahlili uchun' : 'Для анализа этапов и скорости сделок'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPipelineModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Search filter if pipelines > 4 */}
            {pipelines && pipelines.length > 4 && (
              <div className="p-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={pipelineSearchQuery}
                    onChange={(e) => setPipelineSearchQuery(e.target.value)}
                    placeholder={lang === 'uz' ? 'Voronka qidirish...' : 'Поиск воронки...'}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-lg text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}

            {/* Pipelines List */}
            <div className="p-2 space-y-1 overflow-y-auto max-h-[320px]">
              {/* Option 1: All Pipelines */}
              {(!pipelineSearchQuery || (lang === 'uz' ? 'barcha voronkalar' : 'все воронки').includes(pipelineSearchQuery.toLowerCase())) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPipelineForStages('all');
                    if (!selectedBiBlocks.includes('time_stages')) {
                      setSelectedBiBlocks([...selectedBiBlocks, 'time_stages']);
                    }
                    setPipelineModalOpen(false);
                  }}
                  className={`w-full text-left p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                    selectedPipelineForStages === 'all' && selectedBiBlocks.includes('time_stages')
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🌐</span>
                    <div>
                      <div>{lang === 'uz' ? 'Barcha voronkalar' : 'Все воронки'}</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        {lang === 'uz' ? 'Barcha voronkalardagi bosqichlar umumiy ko‘rinishi' : 'Сводка по всем активным воронкам'}
                      </div>
                    </div>
                  </div>
                  {selectedPipelineForStages === 'all' && selectedBiBlocks.includes('time_stages') && (
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold">✓</span>
                  )}
                </button>
              )}

              {/* List of individual pipelines */}
              {filteredPipelines.map((pipe) => {
                const isSelected = selectedPipelineForStages === pipe.id && selectedBiBlocks.includes('time_stages');
                return (
                  <button
                    key={pipe.id}
                    type="button"
                    onClick={() => {
                      setSelectedPipelineForStages(pipe.id);
                      if (!selectedBiBlocks.includes('time_stages')) {
                        setSelectedBiBlocks([...selectedBiBlocks, 'time_stages']);
                      }
                      setPipelineModalOpen(false);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">📊</span>
                      <span className="truncate">{pipe.name}</span>
                    </div>
                    {isSelected && (
                      <span className="text-indigo-600 dark:text-indigo-400 font-bold">✓</span>
                    )}
                  </button>
                );
              })}

              {filteredPipelines.length === 0 && pipelines.length > 0 && (
                <div className="p-4 text-center text-xs text-slate-400">
                  {lang === 'uz' ? 'Voronka topilmadi' : 'Воронки не найдены'}
                </div>
              )}

              {pipelines.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400">
                  {lang === 'uz' ? 'Voronkalar yuklanmoqda...' : 'Загрузка списка воронок...'}
                </div>
              )}
            </div>

            {/* Footer if already selected */}
            {selectedBiBlocks.includes('time_stages') && (
              <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between items-center text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBiBlocks(selectedBiBlocks.filter((id) => id !== 'time_stages'));
                    setPipelineModalOpen(false);
                  }}
                  className="text-rose-600 dark:text-rose-400 hover:underline font-semibold cursor-pointer"
                >
                  {lang === 'uz' ? '✕ Kontekstdan olib tashlash' : '✕ Убрать из контекста'}
                </button>
                <button
                  type="button"
                  onClick={() => setPipelineModalOpen(false)}
                  className="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-300 cursor-pointer"
                >
                  {lang === 'uz' ? 'Yopish' : 'Закрыть'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (variant === 'docked') {
    return chatCard;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 h-full">
        {chatCard}
      </div>
    </div>
  );
}
