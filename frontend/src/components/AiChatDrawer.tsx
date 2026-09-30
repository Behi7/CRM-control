import React, { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { userApi, FilterParams } from '../api/client';
import { useLanguage } from '../i18n/LanguageContext';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Trash2,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
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
  biData?: any;
  activeBiTab?: string;
  variant?: 'overlay' | 'docked';
}

const BI_AVAILABLE_BLOCKS = [
  { id: 'overview', label: '1. Обзор' },
  { id: 'managers', label: '2. Менеджеры' },
  { id: 'marketing', label: '3. Источники' },
  { id: 'losses', label: '4. Отказы' },
  { id: 'custom_fields', label: '5. Списки' },
  { id: 'risk_deals', label: '6. Зона риска' },
];

function tabToBlockId(tab?: string): string {
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
  biData,
  activeBiTab,
  variant = 'overlay',
}: AiChatDrawerProps) {
  const { lang, t } = useLanguage();
  const [input, setInput] = useState('');

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

      return userApi.sendAiChat(accountId, {
        message: userText,
        history,
        pipelineId: pipelineId || undefined,
        filters: filters,
        lang,
        biData: biData || undefined,
        biSelectedBlocks: biData ? selectedBiBlocks : undefined,
      });
    },
    onSuccess: (data) => {
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

  const quickPrompts = biData
    ? [
        {
          icon: Lightbulb,
          label: 'Аудит показателей',
          query: 'Проведи аудит текущих показателей и воронки продаж',
        },
        {
          icon: AlertTriangle,
          label: 'Утечки бюджета',
          query: 'Где мы теряем больше всего денег и почему?',
        },
        {
          icon: TrendingDown,
          label: 'Менеджеры и дисциплина',
          query: 'Оцени работу менеджеров и соблюдение CRM-дисциплины',
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
      className={`w-full bg-white dark:bg-slate-900 flex flex-col ${
        variant === 'docked'
          ? 'h-full rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden'
          : 'w-screen max-w-lg shadow-2xl border-l border-slate-200 dark:border-slate-800'
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
            title={variant === 'docked' ? 'Свернуть панель ИИ' : undefined}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>
      </div>

          {/* Interactive BI Blocks Context Selector (when in BI Module 02) */}
          {biData && (
            <div className="bg-white dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  Контекст экрана для ИИ:
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
                  {selectedBiBlocks.length === BI_AVAILABLE_BLOCKS.length ? 'Сбросить к текущей' : '⚡ Выбрать всё'}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {BI_AVAILABLE_BLOCKS.map((block) => {
                  const active = selectedBiBlocks.includes(block.id);
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
                      {active ? '✓ ' : '+ '} {block.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chat Messages */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/60"
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
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        {chatCard}
      </div>
    </div>
  );
}
