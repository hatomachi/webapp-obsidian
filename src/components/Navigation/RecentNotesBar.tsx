import React from 'react';
import { ArrowLeft, ArrowRight, History, FileText, Sparkles, RotateCw } from 'lucide-react';
import { RecentUpdatedFile } from '../../types';
import { RecentBarMode } from '../../hooks/useNoteHistory';

interface RecentNotesBarProps {
  recentNotes: string[];
  recentUpdatedNotes: RecentUpdatedFile[];
  barMode: RecentBarMode;
  isRefreshingUpdated: boolean;
  onToggleMode: () => void;
  onRefreshUpdated: () => void;
  activeFilePath: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onSelectFile: (path: string) => void;
}

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return '';
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 0) return '今';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return '今';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay === 1) return '昨日';
    if (diffDay < 7) return `${diffDay}d`;
    const d = new Date(isoString);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return '';
  }
}

export const RecentNotesBar: React.FC<RecentNotesBarProps> = ({
  recentNotes,
  recentUpdatedNotes,
  barMode,
  isRefreshingUpdated,
  onToggleMode,
  onRefreshUpdated,
  activeFilePath,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onSelectFile,
}) => {
  // If no items in either mode and not loading, hide bar
  if (recentNotes.length === 0 && recentUpdatedNotes.length === 0 && !isRefreshingUpdated) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-obsidian-sidebar/80 border-b border-obsidian-border text-xs select-none">
      {/* Back / Forward Controls */}
      <div className="flex items-center gap-0.5 shrink-0 pr-1.5 border-r border-zinc-800">
        <button
          type="button"
          onClick={onGoBack}
          disabled={!canGoBack}
          aria-label="Go back to previous note"
          title="前のノートに戻る"
          className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onGoForward}
          disabled={!canGoForward}
          aria-label="Go forward to next note"
          title="次のノートに進む"
          className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Mode Toggle Button (Recent Updated ⇄ Recent Opened) */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onToggleMode}
          title={
            barMode === 'updated'
              ? '現在「最近更新」表示中。クリックで「最近開いた」に切替'
              : '現在「最近開いた」表示中。クリックで「最近更新」に切替'
          }
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all ${
            barMode === 'updated'
              ? 'bg-purple-900/60 text-purple-200 hover:bg-purple-800/70 border border-purple-700/60 shadow-sm'
              : 'bg-zinc-800/90 text-zinc-300 hover:text-white hover:bg-zinc-700/80 border border-zinc-700/60'
          }`}
        >
          {barMode === 'updated' ? (
            <>
              <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
              <span>最近更新</span>
            </>
          ) : (
            <>
              <History className="w-3 h-3 text-zinc-400 shrink-0" />
              <span>最近開いた</span>
            </>
          )}
        </button>

        {/* Refresh button (only in updated mode) */}
        {barMode === 'updated' && (
          <button
            type="button"
            onClick={onRefreshUpdated}
            disabled={isRefreshingUpdated}
            title="最新のコミット・更新ノートを再取得"
            className="p-1 rounded-md text-zinc-400 hover:text-purple-300 hover:bg-purple-950/50 transition-colors disabled:opacity-40"
          >
            <RotateCw className={`w-3 h-3 ${isRefreshingUpdated ? 'animate-spin text-purple-400' : ''}`} />
          </button>
        )}
      </div>

      {/* Horizontal Scrollable Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
        {barMode === 'updated' ? (
          recentUpdatedNotes.length === 0 && isRefreshingUpdated ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] text-zinc-500">
              <RotateCw className="w-3 h-3 animate-spin text-purple-400" />
              <span>更新履歴を取得中...</span>
            </div>
          ) : recentUpdatedNotes.length === 0 ? (
            <span className="text-[11px] text-zinc-500 italic px-2">更新ノートなし</span>
          ) : (
            recentUpdatedNotes.map((item) => {
              const rawName = item.path.split('/').pop() || '';
              const fileName = item.path.toLowerCase().endsWith('.md') ? rawName.replace(/\.md$/, '') : rawName;
              const isCurrent = item.path === activeFilePath;
              const isAi = item.commitType === 'ai';
              const timeAgo = formatRelativeTime(item.authorDate);

              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => onSelectFile(item.path)}
                  title={`${item.path}\n更新: ${item.authorName} (${new Date(item.authorDate).toLocaleString()})\nコミット: ${item.commitMessage}`}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all ${
                    isCurrent
                      ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow-sm'
                      : isAi
                      ? 'bg-purple-950/40 text-purple-200 hover:text-white hover:bg-purple-900/50 border border-purple-800/40'
                      : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 border border-zinc-700/40'
                  }`}
                >
                  {isAi ? (
                    <span className="shrink-0 text-[10px]" title="AIコミット">🤖</span>
                  ) : (
                    <FileText className={`w-3 h-3 shrink-0 ${isCurrent ? 'text-purple-400' : 'text-zinc-500'}`} />
                  )}
                  <span className="truncate max-w-[120px] sm:max-w-[180px]">{fileName}</span>
                  {timeAgo && (
                    <span
                      className={`text-[9px] ml-0.5 px-1 py-0.2 rounded ${
                        isCurrent ? 'bg-purple-500/30 text-purple-200' : 'bg-zinc-700/60 text-zinc-400'
                      }`}
                    >
                      {timeAgo}
                    </span>
                  )}
                </button>
              );
            })
          )
        ) : (
          /* Opened Notes Mode */
          recentNotes.length === 0 ? (
            <span className="text-[11px] text-zinc-500 italic px-2">閲覧履歴なし</span>
          ) : (
            recentNotes.map((path) => {
              const rawName = path.split('/').pop() || '';
              const fileName = path.toLowerCase().endsWith('.md') ? rawName.replace(/\.md$/, '') : rawName;
              const isCurrent = path === activeFilePath;

              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => onSelectFile(path)}
                  title={path}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all ${
                    isCurrent
                      ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow-sm'
                      : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 border border-zinc-700/40'
                  }`}
                >
                  <FileText className={`w-3 h-3 shrink-0 ${isCurrent ? 'text-purple-400' : 'text-zinc-500'}`} />
                  <span className="truncate max-w-[120px] sm:max-w-[180px]">{fileName}</span>
                </button>
              );
            })
          )
        )}
      </div>
    </div>
  );
};

