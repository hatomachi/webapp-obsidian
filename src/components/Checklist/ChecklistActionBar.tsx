import React from 'react';
import { CheckSquare, Save, RotateCcw, Undo2, Loader2 } from 'lucide-react';

interface ChecklistActionBarProps {
  totalTasks: number;
  completedTasks: number;
  pendingChangeCount: number;
  isSaving: boolean;
  onSave: () => void;
  onResetAll: () => void;
  onDiscard: () => void;
}

export const ChecklistActionBar: React.FC<ChecklistActionBarProps> = ({
  totalTasks,
  completedTasks,
  pendingChangeCount,
  isSaving,
  onSave,
  onResetAll,
  onDiscard,
}) => {
  if (totalTasks === 0) return null;

  const percent = Math.round((completedTasks / totalTasks) * 100);
  const hasChanges = pendingChangeCount > 0;

  return (
    <div className="w-full max-w-4xl mx-auto px-2 sm:px-4 py-1">
      <div
        className={`flex items-center justify-between gap-2 sm:gap-3 px-3 py-2 rounded-xl border transition-all ${
          hasChanges
            ? 'bg-zinc-900/95 border-purple-500/60 shadow-lg shadow-purple-950/20'
            : 'bg-zinc-900/70 border-zinc-800/80'
        }`}
      >
        {/* Left: Progress & Counter */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 whitespace-nowrap">
            <CheckSquare className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>
              {completedTasks}/{totalTasks}
            </span>
            <span className="text-zinc-500 font-normal">({percent}%)</span>
          </div>

          {/* Mini progress bar */}
          <div className="w-16 sm:w-28 h-1.5 bg-zinc-800 rounded-full overflow-hidden shrink-0">
            <div
              className={`h-full transition-all duration-300 ${
                percent === 100 ? 'bg-emerald-500' : 'bg-purple-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Pending Changes Badge */}
          {hasChanges && (
            <span className="hidden sm:inline-flex items-center text-[10px] font-medium text-purple-300 bg-purple-950/60 border border-purple-800/60 px-1.5 py-0.5 rounded-md whitespace-nowrap">
              未保存 {pendingChangeCount}件
            </span>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Discard / Undo */}
          {hasChanges && (
            <button
              type="button"
              onClick={onDiscard}
              disabled={isSaving}
              className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
              title="変更を破棄して元に戻す"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">戻す</span>
            </button>
          )}

          {/* Reset All */}
          <button
            type="button"
            onClick={onResetAll}
            disabled={isSaving || completedTasks === 0}
            className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-30 disabled:hover:bg-transparent"
            title="全てのチェックを外してリセット"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="text-xs">全解除</span>
          </button>

          {/* Save to GitHub */}
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || !hasChanges}
            className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all shadow-sm ${
              hasChanges
                ? 'bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white'
                : 'bg-zinc-800/60 text-zinc-500 cursor-not-allowed opacity-50'
            }`}
            title={hasChanges ? '現在のチェック状態をGitHubへコミット' : '未保存の変更はありません'}
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>反映</span>
          </button>
        </div>
      </div>
    </div>
  );
};
