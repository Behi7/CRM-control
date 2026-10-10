import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Check, X, ShieldAlert, Sparkles, Loader2 } from 'lucide-react';
import { qcApi, QcRule } from '../api/qcApi';
import { useLanguage } from '../../../i18n/LanguageContext';

interface RulesSettingsTabProps {
  accountId: number;
  pipelines: Array<{ id: number; name: string }>;
  pipelineId?: number;
}

export default function RulesSettingsTab({ accountId, pipelines, pipelineId }: RulesSettingsTabProps) {
  const { lang } = useLanguage();
  const queryClient = useQueryClient();

  const [selectedPipelineId, setSelectedPipelineId] = useState<number | undefined>(
    pipelineId || pipelines[0]?.id
  );

  useEffect(() => {
    if (pipelineId) {
      setSelectedPipelineId(pipelineId);
    }
  }, [pipelineId]);

  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPenalty, setNewPenalty] = useState(15);

  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPenalty, setEditPenalty] = useState(15);

  const { data: rules, isLoading } = useQuery({
    queryKey: ['qc-rules', accountId, selectedPipelineId],
    queryFn: () => qcApi.listRules(accountId, selectedPipelineId),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => qcApi.createRule(accountId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qc-rules', accountId] });
      setIsAdding(false);
      setNewTitle('');
      setNewDesc('');
      setNewPenalty(15);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => qcApi.updateRule(accountId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qc-rules', accountId] });
      setEditingRuleId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (ruleId: number) => qcApi.deleteRule(accountId, ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qc-rules', accountId] });
    },
  });

  const handleStartEdit = (rule: QcRule) => {
    setEditingRuleId(rule.id);
    setEditTitle(rule.title);
    setEditDesc(rule.description || '');
    setEditPenalty(rule.penaltyPoints);
  };

  const handleSaveEdit = (ruleId: number) => {
    if (!editTitle.trim()) return;
    updateMut.mutate({
      id: ruleId,
      data: {
        title: editTitle.trim(),
        description: editDesc.trim() || undefined,
        penaltyPoints: editPenalty,
      },
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createMut.mutate({
      pipelineId: selectedPipelineId ?? null,
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      penaltyPoints: newPenalty,
      sortOrder: (rules?.length || 0) + 1,
      isActive: true,
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Pipeline Selector Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shadow-xs">
        <div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
            {lang === 'uz' ? 'Tekshirish qoidalari uchun voronka:' : 'Воронка для законов проверки:'}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedPipelineId(undefined)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                selectedPipelineId === undefined
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {lang === 'uz' ? 'Barcha voronkalar (Umumiy)' : 'Все воронки (Общие правила)'}
            </button>
            {pipelines.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPipelineId(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  selectedPipelineId === p.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsAdding(!isAdding)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer shrink-0"
        >
          <Plus size={16} />
          <span>{lang === 'uz' ? 'Yangi qoida qo\'shish' : 'Добавить закон проверки'}</span>
        </button>
      </div>

      {/* Add New Rule Form */}
      {isAdding && (
        <form
          onSubmit={handleCreate}
          className="bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 p-4 rounded-xl space-y-3 animate-in fade-in"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-blue-900 dark:text-blue-200">
              {lang === 'uz' ? 'Yangi reglament qoidasi' : 'Новое правило регламента звонков'}
            </span>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {lang === 'uz' ? 'Qoida nomi (masalan, Narxni aniq aytdi)' : 'Название закона (например, Озвучил стоимость)'}
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={lang === 'uz' ? 'Masalan: Mijoz bilan salomlashdi' : 'Например: Поздоровался и представился'}
                className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {lang === 'uz' ? 'Jarima bali (agar buzilsa)' : 'Штрафной балл (при нарушении)'}
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={newPenalty}
                onChange={(e) => setNewPenalty(Number(e.target.value))}
                className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {lang === 'uz' ? 'AI uchun izoh / nima tekshirilishi kerak' : 'Инструкция для ИИ (что именно проверить)'}
            </label>
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder={lang === 'uz' ? 'Menejer ismini va kompaniya nomini aytdimi...' : 'Проверить, назвал ли менеджер имя и компанию в первые 20 секунд...'}
              className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              {lang === 'uz' ? 'Bekor qilish' : 'Отмена'}
            </button>
            <button
              type="submit"
              disabled={createMut.isPending}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
            >
              {createMut.isPending ? '...' : (lang === 'uz' ? 'Qo\'shish' : 'Сохранить закон')}
            </button>
          </div>
        </form>
      )}

      {/* Rules List */}
      {isLoading ? (
        <div className="py-12 flex items-center justify-center gap-2 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
          <span>{lang === 'uz' ? 'Yuklanmoqda...' : 'Загрузка законов...'}</span>
        </div>
      ) : rules && rules.length > 0 ? (
        <div className="space-y-2.5">
          {rules.map((rule, idx) => {
            const isEditing = editingRuleId === rule.id;

            return (
              <div
                key={rule.id}
                className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between gap-4 transition-all"
              >
                {isEditing ? (
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="col-span-2 p-1.5 border border-slate-300 dark:border-slate-700 rounded text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      />
                      <input
                        type="number"
                        value={editPenalty}
                        onChange={(e) => setEditPenalty(Number(e.target.value))}
                        className="p-1.5 border border-slate-300 dark:border-slate-700 rounded text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <input
                      type="text"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Инструкция для ИИ..."
                      className="w-full p-1.5 border border-slate-300 dark:border-slate-700 rounded text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingRuleId(null)}
                        className="text-xs text-slate-400 hover:text-slate-600"
                      >
                        {lang === 'uz' ? 'Bekor' : 'Отмена'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(rule.id)}
                        className="text-xs px-3 py-1 bg-blue-600 text-white rounded font-medium"
                      >
                        {lang === 'uz' ? 'Saqlash' : 'Сохранить'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3.5">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                            {rule.title}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 font-medium border border-rose-200/60 dark:border-rose-900/40">
                            -{rule.penaltyPoints} {lang === 'uz' ? 'ball' : 'баллов'}
                          </span>
                        </div>
                        {rule.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {rule.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(rule)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        title={lang === 'uz' ? 'Tahrirlash' : 'Редактировать'}
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMut.mutate(rule.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        title={lang === 'uz' ? 'O\'chirish' : 'Удалить'}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-400">
          {lang === 'uz'
            ? 'Ushbu voronka uchun qoidalar hali yo\'q. "Yangi qoida qo\'shish" tugmasini bosing.'
            : 'Для этой воронки пока нет правил. Нажмите «Добавить закон проверки» выше.'}
        </div>
      )}
    </div>
  );
}

