import React, { useState, useRef, useEffect } from 'react';
import {
  Edit2,
  Check,
  X,
  Loader2,
  Plus,
} from 'lucide-react';
import { BaseRow, BaseColumn } from './types';

interface EditableCellProps {
  row: BaseRow;
  col: BaseColumn;
  value: any;
  isSaving: boolean;
  onSave: (newValue: any) => Promise<boolean>;
  children: React.ReactNode;
}

export const EditableCell: React.FC<EditableCellProps> = ({
  col,
  value,
  isSaving,
  onSave,
  children,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState<any>('');
  const [newTagText, setNewTagText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // If column is not editable, render regular content directly
  if (!col.isEditable) {
    return <>{children}</>;
  }

  // Handle Boolean toggle directly on click without opening editor
  const handleBooleanToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSaving || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSave(!value);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = () => {
    if (isSaving || isSubmitting) return;
    setDraftValue(value ?? '');
    setNewTagText('');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleSave = async (newValueToSave?: any) => {
    if (isSaving || isSubmitting) return;
    setIsSubmitting(true);
    try {
      let val = newValueToSave !== undefined ? newValueToSave : draftValue;
      // Convert numeric string to number if original value was a number
      if (typeof value === 'number' && typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) {
        val = Number(val);
      }
      const success = await onSave(val);
      if (success) {
        setIsEditing(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auto-focus input on open
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if ('select' in inputRef.current && typeof inputRef.current.select === 'function') {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  const keyLower = col.id.toLowerCase();
  const isStatusCol = keyLower.includes('status') || keyLower === 'state';
  const isPriorityCol = keyLower.includes('priority');
  const isBoolean = typeof value === 'boolean';
  const isArray = Array.isArray(value);

  // Saving state indicator
  if (isSaving || isSubmitting) {
    return (
      <div className="flex items-center gap-1.5 py-1 px-2 bg-purple-950/60 rounded border border-purple-500/40 text-purple-300 text-xs shadow-sm">
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-purple-400" />
        <span className="truncate text-[11px] font-mono">保存中...</span>
      </div>
    );
  }

  // Active editing mode
  if (isEditing) {
    // 1. Status picker with quick badges
    if (isStatusCol) {
      const statusCandidates = ['未着手', '進行中', '完了', '保留', '中止'];
      return (
        <div
          className="p-1.5 bg-zinc-900 border border-purple-500/60 rounded-lg shadow-xl min-w-[200px] z-20 space-y-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] text-zinc-400 font-semibold flex items-center justify-between">
            <span>ステータスを選択</span>
            <button
              type="button"
              onClick={cancelEditing}
              className="text-zinc-500 hover:text-zinc-300 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {statusCandidates.map((cand) => (
              <button
                key={cand}
                type="button"
                onClick={() => handleSave(cand)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  draftValue === cand
                    ? 'bg-purple-600 border-purple-400 text-white shadow'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-purple-500 hover:text-purple-200'
                }`}
              >
                {cand}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 pt-1 border-t border-zinc-800">
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') cancelEditing();
              }}
              placeholder="または自由入力..."
              className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
            />
            <button
              type="button"
              onClick={() => handleSave()}
              className="p-1 rounded bg-purple-600 hover:bg-purple-500 text-white shrink-0 shadow"
              title="保存"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      );
    }

    // 2. Priority picker with quick badges
    if (isPriorityCol) {
      const priorityCandidates = ['低', '中', '高', '緊急'];
      return (
        <div
          className="p-1.5 bg-zinc-900 border border-purple-500/60 rounded-lg shadow-xl min-w-[180px] z-20 space-y-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] text-zinc-400 font-semibold flex items-center justify-between">
            <span>優先度を選択</span>
            <button
              type="button"
              onClick={cancelEditing}
              className="text-zinc-500 hover:text-zinc-300 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {priorityCandidates.map((cand) => (
              <button
                key={cand}
                type="button"
                onClick={() => handleSave(cand)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  draftValue === cand
                    ? 'bg-purple-600 border-purple-400 text-white shadow'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-purple-500 hover:text-purple-200'
                }`}
              >
                {cand}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 pt-1 border-t border-zinc-800">
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') cancelEditing();
              }}
              placeholder="または自由入力..."
              className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
            />
            <button
              type="button"
              onClick={() => handleSave()}
              className="p-1 rounded bg-purple-600 hover:bg-purple-500 text-white shrink-0 shadow"
              title="保存"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      );
    }

    // 3. Array / Tags editing
    if (isArray) {
      const currentList: any[] = Array.isArray(draftValue) ? draftValue : [];
      const handleRemoveTag = (idx: number) => {
        const next = currentList.filter((_, i) => i !== idx);
        setDraftValue(next);
      };
      const handleAddTag = () => {
        if (!newTagText.trim()) return;
        const next = [...currentList, newTagText.trim()];
        setDraftValue(next);
        setNewTagText('');
      };

      return (
        <div
          className="p-2 bg-zinc-900 border border-purple-500/60 rounded-lg shadow-xl min-w-[220px] z-20 space-y-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] text-zinc-400 font-semibold flex items-center justify-between">
            <span>タグ / リストの編集</span>
            <button
              type="button"
              onClick={cancelEditing}
              className="text-zinc-500 hover:text-zinc-300 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-1">
            {currentList.map((tag, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-950/70 border border-purple-800/60 text-[11px] text-purple-300"
              >
                <span>{String(tag)}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(idx)}
                  className="hover:text-rose-400 transition-colors p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newTagText}
              onChange={(e) => setNewTagText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="新しいタグを入力してEnter..."
              className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
            />
            <button
              type="button"
              onClick={handleAddTag}
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 shrink-0"
              title="タグ追加"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex justify-end gap-1.5 pt-1 border-t border-zinc-800">
            <button
              type="button"
              onClick={cancelEditing}
              className="px-2 py-0.5 rounded text-xs text-zinc-400 hover:text-zinc-200"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => handleSave(currentList)}
              className="px-2.5 py-0.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium flex items-center gap-1 shadow"
            >
              <Check className="w-3 h-3" />
              保存
            </button>
          </div>
        </div>
      );
    }

    // 4. Default Text / Number / General editing
    const isMultiLine = typeof draftValue === 'string' && draftValue.length > 50;

    return (
      <div
        className="p-1 bg-zinc-900 border border-purple-500/60 rounded-lg shadow-xl min-w-[200px] z-20 space-y-1"
        onClick={(e) => e.stopPropagation()}
      >
        {isMultiLine ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            rows={3}
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handleSave();
              }
              if (e.key === 'Escape') cancelEditing();
            }}
            className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-purple-500 resize-y"
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') cancelEditing();
            }}
            className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-purple-500 font-mono"
          />
        )}
        <div className="flex items-center justify-between pt-0.5">
          <span className="text-[10px] text-zinc-500">
            {isMultiLine ? 'Ctrl+Enterで保存' : 'Enterで保存'}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={cancelEditing}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200"
              title="キャンセル (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              className="p-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium flex items-center gap-0.5 shadow"
              title="保存 (Enter)"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Inactive mode: Render children with edit affordance
  return (
    <div
      onClick={isBoolean ? handleBooleanToggle : startEditing}
      className="group/cell relative cursor-pointer hover:bg-purple-950/30 hover:border-purple-800/40 rounded px-1.5 py-1 -mx-1.5 -my-1 border border-transparent transition-all flex items-center justify-between min-h-[26px]"
      title={isBoolean ? 'クリックで切り替え' : 'クリックして編集'}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <Edit2 className="w-3 h-3 text-purple-400/60 opacity-0 group-hover/cell:opacity-100 transition-opacity ml-1.5 shrink-0" />
    </div>
  );
};
