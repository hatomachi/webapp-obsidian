import React, { useState, useMemo } from 'react';
import { ChevronRight, Folder, FileText, X, Layers } from 'lucide-react';

interface BreadcrumbNavProps {
  activeFilePath: string;
  allFilePaths: string[];
  onSelectFile: (path: string) => void;
}

interface BreadcrumbPart {
  name: string;
  fullDirPath: string; // empty string for root, or "folder/subfolder"
  isFolder: boolean;
  isFile: boolean;
}

export const BreadcrumbNav: React.FC<BreadcrumbNavProps> = ({
  activeFilePath,
  allFilePaths,
  onSelectFile,
}) => {
  // Path for the folder whose files are displayed in the bottom sheet
  const [selectedFolderForSheet, setSelectedFolderForSheet] = useState<string | null>(null);

  const breadcrumbs: BreadcrumbPart[] = useMemo(() => {
    if (!activeFilePath) return [];
    const parts = activeFilePath.split('/');
    const result: BreadcrumbPart[] = [];
    let accumulated = '';

    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const part = parts[i];
      accumulated = accumulated ? `${accumulated}/${part}` : part;

      result.push({
        name: isLast ? part.replace(/\.md$/, '') : part,
        fullDirPath: isLast ? (parts.slice(0, -1).join('/') || '') : accumulated,
        isFolder: !isLast,
        isFile: isLast,
      });
    }
    return result;
  }, [activeFilePath]);

  // Current parent directory of the active file
  const currentParentDir = useMemo(() => {
    const parts = activeFilePath.split('/');
    return parts.slice(0, -1).join('/');
  }, [activeFilePath]);

  // Files belonging to the currently open bottom sheet folder
  const sheetFiles = useMemo(() => {
    if (selectedFolderForSheet === null) return [];
    const targetDir = selectedFolderForSheet;

    return allFilePaths
      .filter((path) => {
        const parts = path.split('/');
        const dir = parts.slice(0, -1).join('/');
        return dir === targetDir;
      })
      .map((path) => {
        const fileName = path.split('/').pop() || '';
        return {
          path,
          name: fileName.replace(/\.md$/, ''),
        };
      });
  }, [selectedFolderForSheet, allFilePaths]);

  if (!activeFilePath) return null;

  return (
    <>
      {/* Breadcrumb Strip */}
      <nav
        aria-label="Breadcrumb navigation"
        className="flex items-center gap-1 px-3 py-1.5 bg-zinc-900/60 border-b border-obsidian-border text-xs text-zinc-400 overflow-x-auto no-scrollbar select-none"
      >
        <Folder className="w-3.5 h-3.5 text-purple-400/80 shrink-0" />

        {/* If root file */}
        {breadcrumbs.length === 1 && (
          <span className="font-semibold text-zinc-200 truncate">
            {breadcrumbs[0].name}
          </span>
        )}

        {/* If nested file */}
        {breadcrumbs.length > 1 &&
          breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;

            if (isLast) {
              return (
                <React.Fragment key={crumb.name}>
                  <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                  <button
                    type="button"
                    onClick={() => setSelectedFolderForSheet(currentParentDir)}
                    title="同じフォルダのノートを表示"
                    className="inline-flex items-center gap-1 font-semibold text-purple-300 hover:text-purple-200 hover:bg-purple-950/40 px-1.5 py-0.5 rounded transition-colors truncate max-w-[180px] sm:max-w-[300px]"
                  >
                    <span className="truncate">{crumb.name}</span>
                    <Layers className="w-3 h-3 text-purple-400/70 shrink-0" />
                  </button>
                </React.Fragment>
              );
            }

            return (
              <React.Fragment key={crumb.fullDirPath}>
                {idx > 0 && <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />}
                <button
                  type="button"
                  onClick={() => setSelectedFolderForSheet(crumb.fullDirPath)}
                  className="hover:text-zinc-200 hover:bg-zinc-800/80 px-1.5 py-0.5 rounded transition-colors truncate max-w-[120px]"
                  title={`フォルダ "${crumb.name}" のノート一覧を表示`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            );
          })}
      </nav>

      {/* Bottom Sheet Modal for folder files */}
      {selectedFolderForSheet !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setSelectedFolderForSheet(null)}
          />

          {/* Sheet dialog */}
          <div className="relative w-full sm:max-w-md bg-zinc-900 border border-zinc-700/80 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden z-10 animate-in slide-in-from-bottom duration-200 safe-bottom max-h-[75vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-800/50">
              <div className="flex items-center gap-2 truncate">
                <Folder className="w-4 h-4 text-purple-400 shrink-0" />
                <div className="text-xs font-semibold text-zinc-200 truncate">
                  {selectedFolderForSheet || 'ルート (Root)'}
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-900/50 text-purple-300 font-medium shrink-0">
                  {sheetFiles.length} 件
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFolderForSheet(null)}
                className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* File List (Large touch targets for mobile) */}
            <div className="overflow-y-auto p-2 divide-y divide-zinc-800/40">
              {sheetFiles.length === 0 ? (
                <div className="text-center py-8 text-xs text-zinc-500">
                  このフォルダに他のMarkdownファイルはありません
                </div>
              ) : (
                sheetFiles.map((f) => {
                  const isCurrent = f.path === activeFilePath;
                  return (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => {
                        onSelectFile(f.path);
                        setSelectedFolderForSheet(null);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-xs transition-all active:scale-[0.99] min-h-[46px] ${
                        isCurrent
                          ? 'bg-purple-600/20 text-purple-300 font-bold border border-purple-500/40'
                          : 'text-zinc-200 hover:bg-zinc-800/90 active:bg-zinc-800'
                      }`}
                    >
                      <FileText
                        className={`w-4 h-4 shrink-0 ${
                          isCurrent ? 'text-purple-400' : 'text-zinc-400'
                        }`}
                      />
                      <span className="truncate flex-1 font-medium">{f.name}</span>
                      {isCurrent && (
                        <span className="text-[10px] uppercase font-semibold text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded-md">
                          閲覧中
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
