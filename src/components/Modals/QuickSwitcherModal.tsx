import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, FileText, X } from 'lucide-react';
import { SearchResult } from '../../types';

interface QuickSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  allFilePaths: string[];
  onSelectFile: (path: string) => void;
}

export const QuickSwitcherModal: React.FC<QuickSwitcherModalProps> = ({
  isOpen,
  onClose,
  allFilePaths,
  onSelectFile,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const results: SearchResult[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: SearchResult[] = allFilePaths.map((path) => {
      const parts = path.split('/');
      const name = parts[parts.length - 1];
      const dir = parts.slice(0, -1).join('/');
      return { path, name, dir };
    });

    if (!q) {
      return list.slice(0, 30);
    }

    return list
      .filter((item) => {
        return (
          item.name.toLowerCase().includes(q) ||
          item.dir.toLowerCase().includes(q) ||
          item.path.toLowerCase().includes(q)
        );
      })
      .slice(0, 50);
  }, [allFilePaths, query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-16 sm:pt-24">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input */}
        <div className="flex items-center px-4 py-3 border-b border-zinc-800 gap-2.5">
          <Search className="w-5 h-5 text-purple-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ノートを検索... (Quick Switcher)"
            className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-zinc-500 hover:text-zinc-300 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Results List */}
        <div className="max-h-[60vh] overflow-y-auto p-2 divide-y divide-zinc-800/40">
          {results.length === 0 ? (
            <div className="text-center py-8 text-xs text-zinc-500">
              一致するノートが見つかりません
            </div>
          ) : (
            results.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => {
                  onSelectFile(item.path);
                  onClose();
                }}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-800 text-left transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-zinc-800 group-hover:bg-purple-950/40 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-zinc-400 group-hover:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-200 group-hover:text-purple-300 truncate">
                    {item.name.replace(/\.md$/, '')}
                  </div>
                  {item.dir && (
                    <div className="text-[11px] text-zinc-500 truncate">{item.dir}</div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-zinc-950/60 border-t border-zinc-800/60 text-[11px] text-zinc-500 flex justify-between">
          <span>{results.length} 件表示</span>
          <span>Esc または外側タップで閉じる</span>
        </div>
      </div>
    </div>
  );
};
