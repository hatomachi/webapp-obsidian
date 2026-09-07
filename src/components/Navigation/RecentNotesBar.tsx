import React from 'react';
import { ArrowLeft, ArrowRight, History, FileText } from 'lucide-react';

interface RecentNotesBarProps {
  recentNotes: string[];
  activeFilePath: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onSelectFile: (path: string) => void;
}

export const RecentNotesBar: React.FC<RecentNotesBarProps> = ({
  recentNotes,
  activeFilePath,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onSelectFile,
}) => {
  if (recentNotes.length === 0) return null;

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

      {/* History Icon */}
      <History className="w-3.5 h-3.5 text-zinc-500 shrink-0 ml-0.5" />

      {/* Recent Notes Horizontal Scrollable Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {recentNotes.map((path) => {
          const fileName = (path.split('/').pop() || '').replace(/\.md$/, '');
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
        })}
      </div>
    </div>
  );
};
