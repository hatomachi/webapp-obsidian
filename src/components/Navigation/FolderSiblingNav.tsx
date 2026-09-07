import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Folder, FileText } from 'lucide-react';

interface FolderSiblingNavProps {
  activeFilePath: string;
  allFilePaths: string[];
  onSelectFile: (path: string) => void;
}

export const FolderSiblingNav: React.FC<FolderSiblingNavProps> = ({
  activeFilePath,
  allFilePaths,
  onSelectFile,
}) => {
  // Extract folder path and siblings
  const { folderName, siblings, prevNote, nextNote } = useMemo(() => {
    if (!activeFilePath) {
      return { folderName: '', siblings: [], prevNote: null, nextNote: null };
    }

    const parts = activeFilePath.split('/');
    const dir = parts.slice(0, -1).join('/');
    parts.pop();
    const folder = parts.length > 0 ? parts[parts.length - 1] : 'ルート';

    // Get all files in the same directory
    const folderFiles = allFilePaths
      .filter((p) => {
        const pParts = p.split('/');
        const pDir = pParts.slice(0, -1).join('/');
        return pDir === dir;
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const currentIndex = folderFiles.indexOf(activeFilePath);
    const prev = currentIndex > 0 ? folderFiles[currentIndex - 1] : null;
    const next = currentIndex >= 0 && currentIndex < folderFiles.length - 1 ? folderFiles[currentIndex + 1] : null;

    // Filter siblings (excluding current file)
    const otherSiblings = folderFiles
      .filter((p) => p !== activeFilePath)
      .map((p) => ({
        path: p,
        name: (p.split('/').pop() || '').replace(/\.md$/, ''),
      }));

    return {
      folderName: folder,
      siblings: otherSiblings,
      prevNote: prev ? { path: prev, name: (prev.split('/').pop() || '').replace(/\.md$/, '') } : null,
      nextNote: next ? { path: next, name: (next.split('/').pop() || '').replace(/\.md$/, '') } : null,
    };
  }, [activeFilePath, allFilePaths]);

  // If there are no other siblings and no prev/next, return null
  if (siblings.length === 0 && !prevNote && !nextNote) {
    return null;
  }

  return (
    <div className="mt-12 pt-6 border-t border-zinc-800/80 max-w-4xl mx-auto px-4 select-none">
      {/* Previous / Next Note Buttons */}
      {(prevNote || nextNote) && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {prevNote ? (
            <button
              type="button"
              onClick={() => onSelectFile(prevNote.path)}
              className="flex flex-col items-start p-3 bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 rounded-xl transition-all text-left group"
            >
              <span className="flex items-center gap-1 text-[11px] text-zinc-500 group-hover:text-purple-400 mb-1">
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>前のノート</span>
              </span>
              <span className="text-xs font-semibold text-zinc-300 group-hover:text-white truncate w-full">
                {prevNote.name}
              </span>
            </button>
          ) : (
            <div />
          )}

          {nextNote ? (
            <button
              type="button"
              onClick={() => onSelectFile(nextNote.path)}
              className="flex flex-col items-end p-3 bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 rounded-xl transition-all text-right group"
            >
              <span className="flex items-center gap-1 text-[11px] text-zinc-500 group-hover:text-purple-400 mb-1">
                <span>次のノート</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-semibold text-zinc-300 group-hover:text-white truncate w-full">
                {nextNote.name}
              </span>
            </button>
          ) : (
            <div />
          )}
        </div>
      )}

      {/* Same Folder Files Grid */}
      {siblings.length > 0 && (
        <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 mb-2.5">
            <Folder className="w-3.5 h-3.5 text-purple-400" />
            <span>同じフォルダ「{folderName}」の他のノート ({siblings.length}件)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {siblings.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => onSelectFile(item.path)}
                className="flex items-center gap-2 p-2 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800/80 hover:border-purple-500/40 rounded-lg text-xs text-zinc-300 hover:text-white transition-all text-left truncate"
              >
                <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="truncate">{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
