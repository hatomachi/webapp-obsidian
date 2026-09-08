import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ChevronLeft, Folder, FileText, X, Layers } from 'lucide-react';

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

interface SubFolderItem {
  name: string;
  path: string;
  fileCount: number;
}

interface FileItem {
  name: string;
  path: string;
}

export const BreadcrumbNav: React.FC<BreadcrumbNavProps> = ({
  activeFilePath,
  allFilePaths,
  onSelectFile,
}) => {
  // Path for the folder whose contents are displayed in the bottom sheet
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

  // Extract direct subfolders and direct files belonging to selectedFolderForSheet
  const { currentSubFolders, currentFiles } = useMemo(() => {
    if (selectedFolderForSheet === null) {
      return { currentSubFolders: [], currentFiles: [] };
    }

    const targetPrefix = selectedFolderForSheet === '' ? '' : `${selectedFolderForSheet}/`;
    const folderMap = new Map<string, number>();
    const fileList: FileItem[] = [];

    for (const path of allFilePaths) {
      if (targetPrefix === '') {
        // Root directory
        const slashIdx = path.indexOf('/');
        if (slashIdx === -1) {
          fileList.push({ path, name: path.replace(/\.md$/, '') });
        } else {
          const folderName = path.slice(0, slashIdx);
          folderMap.set(folderName, (folderMap.get(folderName) || 0) + 1);
        }
      } else if (path.startsWith(targetPrefix)) {
        const remainder = path.slice(targetPrefix.length);
        const slashIdx = remainder.indexOf('/');
        if (slashIdx === -1) {
          fileList.push({ path, name: remainder.replace(/\.md$/, '') });
        } else {
          const folderName = remainder.slice(0, slashIdx);
          folderMap.set(folderName, (folderMap.get(folderName) || 0) + 1);
        }
      }
    }

    const folderList: SubFolderItem[] = Array.from(folderMap.entries())
      .map(([name, count]) => ({
        name,
        path: targetPrefix ? `${targetPrefix}${name}` : name,
        fileCount: count,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    fileList.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    return { currentSubFolders: folderList, currentFiles: fileList };
  }, [selectedFolderForSheet, allFilePaths]);

  // Handle navigating up to parent directory in bottom sheet
  const handleGoBack = () => {
    if (!selectedFolderForSheet) return;
    const parts = selectedFolderForSheet.split('/');
    if (parts.length <= 1) {
      setSelectedFolderForSheet('');
    } else {
      setSelectedFolderForSheet(parts.slice(0, -1).join('/'));
    }
  };

  if (!activeFilePath) return null;

  const totalItems = currentSubFolders.length + currentFiles.length;

  return (
    <>
      {/* Breadcrumb Strip */}
      <nav
        aria-label="Breadcrumb navigation"
        className="flex items-center gap-1 px-3 py-1.5 bg-zinc-900/60 border-b border-obsidian-border text-xs text-zinc-400 overflow-x-auto no-scrollbar select-none"
      >
        {/* Root icon button */}
        <button
          type="button"
          onClick={() => setSelectedFolderForSheet('')}
          className="p-1 -ml-1 text-purple-400/80 hover:text-purple-300 hover:bg-purple-950/30 rounded transition-colors shrink-0"
          title="ルート階層のフォルダ・ノートを表示"
        >
          <Folder className="w-3.5 h-3.5" />
        </button>

        {/* If root file */}
        {breadcrumbs.length === 1 && (
          <button
            type="button"
            onClick={() => setSelectedFolderForSheet('')}
            title="同じ階層（ルート）のノート・フォルダを表示"
            className="inline-flex items-center gap-1 font-semibold text-purple-300 hover:text-purple-200 hover:bg-purple-950/40 px-1.5 py-0.5 rounded transition-colors truncate"
          >
            <span className="truncate">{breadcrumbs[0].name}</span>
            <Layers className="w-3 h-3 text-purple-400/70 shrink-0" />
          </button>
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
                  onClick={() => {
                    // Open the parent folder of this crumb to show sibling folders
                    const parentDir = crumb.fullDirPath.split('/').slice(0, -1).join('/');
                    setSelectedFolderForSheet(parentDir);
                  }}
                  className="hover:text-zinc-200 hover:bg-zinc-800/80 px-1.5 py-0.5 rounded transition-colors truncate max-w-[120px]"
                  title={`"${crumb.name}" と同じ階層のフォルダ一覧を表示`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            );
          })}
      </nav>

      {/* Bottom Sheet Modal for drill-down navigation */}
      {selectedFolderForSheet !== null &&
        typeof document !== 'undefined' &&
        createPortal(
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
                <div className="flex items-center gap-2 truncate flex-1 mr-2">
                  {selectedFolderForSheet !== '' && (
                    <button
                      type="button"
                      onClick={handleGoBack}
                      title="親階層へ戻る"
                      className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60 rounded-lg transition-colors shrink-0"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  )}
                  <Folder className="w-4 h-4 text-purple-400 shrink-0" />
                  <div className="text-xs font-semibold text-zinc-200 truncate">
                    {selectedFolderForSheet || 'ルート (Root)'}
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-900/50 text-purple-300 font-medium shrink-0">
                    {totalItems} 件
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFolderForSheet(null)}
                  className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-700 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content List: Folders & Files */}
              <div className="overflow-y-auto p-2 pb-6 space-y-3">
                {totalItems === 0 ? (
                  <div className="text-center py-8 text-xs text-zinc-500">
                    このフォルダには項目がありません
                  </div>
                ) : (
                  <>
                    {/* Folders Section */}
                    {currentSubFolders.length > 0 && (
                      <div>
                        {currentFiles.length > 0 && (
                          <div className="px-2 pb-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                            フォルダ ({currentSubFolders.length})
                          </div>
                        )}
                        <div className="space-y-1">
                          {currentSubFolders.map((folder) => {
                            const isCurrentActive =
                              activeFilePath.startsWith(`${folder.path}/`) ||
                              activeFilePath === folder.path;

                            return (
                              <button
                                key={folder.path}
                                type="button"
                                onClick={() => setSelectedFolderForSheet(folder.path)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs transition-all active:scale-[0.99] min-h-[46px] group ${
                                  isCurrentActive
                                    ? 'bg-purple-950/40 text-purple-200 border border-purple-800/50 font-medium'
                                    : 'text-zinc-200 hover:bg-zinc-800/80 active:bg-zinc-800'
                                }`}
                              >
                                <div className="w-7 h-7 rounded-lg bg-purple-900/30 flex items-center justify-center shrink-0">
                                  <Folder className="w-4 h-4 text-purple-400" />
                                </div>
                                <span className="truncate flex-1 font-medium text-zinc-200">
                                  {folder.name}
                                </span>
                                {isCurrentActive && (
                                  <span className="text-[10px] font-semibold text-purple-400 bg-purple-950/80 px-2 py-0.5 rounded-md border border-purple-800/60 shrink-0">
                                    現在地
                                  </span>
                                )}
                                <span className="text-[11px] text-zinc-400 shrink-0 font-mono">
                                  {folder.fileCount} ノート
                                </span>
                                <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 shrink-0" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Notes Section */}
                    {currentFiles.length > 0 && (
                      <div>
                        {currentSubFolders.length > 0 && (
                          <div className="px-2 pt-2 pb-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider border-t border-zinc-800/60">
                            ノート ({currentFiles.length})
                          </div>
                        )}
                        <div className="space-y-1">
                          {currentFiles.map((f) => {
                            const isCurrent = f.path === activeFilePath;
                            return (
                              <button
                                key={f.path}
                                type="button"
                                onClick={() => {
                                  onSelectFile(f.path);
                                  setSelectedFolderForSheet(null);
                                }}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs transition-all active:scale-[0.99] min-h-[46px] ${
                                  isCurrent
                                    ? 'bg-purple-600/20 text-purple-300 font-bold border border-purple-500/40'
                                    : 'text-zinc-200 hover:bg-zinc-800/90 active:bg-zinc-800'
                                }`}
                              >
                                <div className="w-7 h-7 rounded-lg bg-zinc-800/60 flex items-center justify-center shrink-0">
                                  <FileText
                                    className={`w-4 h-4 ${
                                      isCurrent ? 'text-purple-400' : 'text-zinc-400'
                                    }`}
                                  />
                                </div>
                                <span className="truncate flex-1 font-medium">{f.name}</span>
                                {isCurrent && (
                                  <span className="text-[10px] uppercase font-semibold text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded-md shrink-0">
                                    閲覧中
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
