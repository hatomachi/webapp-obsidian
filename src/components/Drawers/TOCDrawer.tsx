import React from 'react';
import { ListTree, X, Hash, History } from 'lucide-react';
import { TOCItem } from '../../types';

interface TOCDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tocList: TOCItem[];
  onOpenHistory?: () => void;
}

export const TOCDrawer: React.FC<TOCDrawerProps> = ({ isOpen, onClose, tocList, onOpenHistory }) => {
  const handleScrollToHeading = (id: string) => {
    onClose();
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 150);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <aside className="relative flex flex-col w-[80vw] max-w-xs h-full bg-obsidian-sidebar border-l border-obsidian-border shadow-2xl z-10 animate-in slide-in-from-right duration-200 safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-obsidian-border">
          <div className="flex items-center gap-2">
            <ListTree className="w-4 h-4 text-purple-400" />
            <span className="font-semibold text-sm text-zinc-100">目次 (TOC)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-obsidian-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* TOC Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {tocList.length === 0 ? (
            <div className="text-center py-12 px-4 text-xs text-zinc-500">
              見出しがありません
            </div>
          ) : (
            tocList.map((item) => {
              const indentLevel = Math.max(0, item.level - 1);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleScrollToHeading(item.id)}
                  style={{ paddingLeft: `${indentLevel * 12 + 8}px` }}
                  className="w-full flex items-center gap-1.5 py-1.5 px-2 text-xs text-left rounded-md text-zinc-300 hover:text-white hover:bg-obsidian-hover transition-colors group"
                >
                  <Hash className="w-3 h-3 text-zinc-600 group-hover:text-purple-400 shrink-0" />
                  <span className="truncate leading-snug">{item.text}</span>
                </button>
              );
            })
          )}
        </div>

        {/* History Action Footer */}
        {onOpenHistory && (
          <div className="p-3 border-t border-obsidian-border bg-zinc-900/40">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenHistory();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800/50 text-purple-300 text-xs font-medium transition-colors active:scale-95"
            >
              <History className="w-3.5 h-3.5" />
              <span>変更履歴を表示</span>
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};
