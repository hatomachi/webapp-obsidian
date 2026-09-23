import React, { useState, useEffect } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  Image as ImageIcon,
  FileArchive,
  File,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  Loader2,
  PlusCircle,
  Table,
} from 'lucide-react';
import { FileNode } from '../../types';

interface FileTreeContentProps {
  fileTree: FileNode[];
  activeFilePath: string;
  onSelectFile: (path: string) => void;
  onExpandFolder?: (node: FileNode) => Promise<void>;
  onLoadMore?: (node: FileNode) => Promise<void>;
  className?: string;
}

export const FileTreeContent: React.FC<FileTreeContentProps> = ({
  fileTree,
  activeFilePath,
  onSelectFile,
  onExpandFolder,
  onLoadMore,
  className = '',
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
  const [filterText, setFilterText] = useState('');

  // Automatically expand parent folders of the active file
  useEffect(() => {
    if (!activeFilePath) return;
    const parts = activeFilePath.split('/');
    if (parts.length <= 1) return;

    setExpandedFolders((prev) => {
      const next = new Set(prev);
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        next.add(currentPath);
      }
      return next;
    });
  }, [activeFilePath]);

  const toggleFolder = async (node: FileNode) => {
    const isCurrentlyExpanded = expandedFolders.has(node.path);

    if (isCurrentlyExpanded) {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
      return;
    }

    // Expanding folder: if not loaded yet and has onExpandFolder, fetch on-demand
    if (node.isLoaded === false && onExpandFolder) {
      setLoadingFolders((prev) => new Set(prev).add(node.path));
      try {
        await onExpandFolder(node);
      } catch (err) {
        console.error('Failed to expand folder:', err);
      } finally {
        setLoadingFolders((prev) => {
          const next = new Set(prev);
          next.delete(node.path);
          return next;
        });
      }
    }

    setExpandedFolders((prev) => new Set(prev).add(node.path));
  };

  const renderNodes = (nodes: FileNode[], depth = 0) => {
    return nodes.map((node) => {
      const isFolder = node.type === 'tree';
      const isExpanded = expandedFolders.has(node.path);
      const isSelected = activeFilePath === node.path;

      // Filter logic if filterText is present
      if (filterText.trim()) {
        const query = filterText.toLowerCase();
        const hasMatchingChild = (n: FileNode): boolean => {
          if (n.name.toLowerCase().includes(query)) return true;
          if (n.children) return n.children.some(hasMatchingChild);
          return false;
        };
        if (!hasMatchingChild(node)) return null;
      }

      if (isFolder) {
        const shouldExpand = filterText.trim() ? true : isExpanded;
        const isFolderLoading = loadingFolders.has(node.path) || !!node.isLoading;
        return (
          <div key={node.path} className="select-none">
            <button
              type="button"
              onClick={() => toggleFolder(node)}
              style={{ paddingLeft: `${depth * 14 + 10}px` }}
              className="w-full flex items-center gap-2 py-2 px-2.5 text-xs text-zinc-300 hover:text-white hover:bg-obsidian-hover active:bg-zinc-800 rounded-lg transition-colors text-left group min-h-[38px]"
            >
              <span className="text-zinc-500 group-hover:text-zinc-300 p-0.5">
                {isFolderLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                ) : shouldExpand ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </span>
              {shouldExpand ? (
                <FolderOpen className="w-4 h-4 text-purple-400/90 shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-purple-400/70 shrink-0" />
              )}
              <span className="truncate font-medium">{node.name}</span>
            </button>

            {shouldExpand && node.children && (
              <div className="border-l border-zinc-800/80 ml-4 pl-1">
                {renderNodes(node.children, depth + 1)}
              </div>
            )}
          </div>
        );
      }

      // Load more virtual node (pagination button)
      if (node.type === 'load_more') {
        const isThisLoading = loadingFolders.has(node.path) || !!node.isLoading;
        return (
          <button
            key={node.path}
            type="button"
            disabled={isThisLoading}
            onClick={async () => {
              if (onLoadMore && !isThisLoading) {
                setLoadingFolders((prev) => new Set(prev).add(node.path));
                try {
                  await onLoadMore(node);
                } finally {
                  setLoadingFolders((prev) => {
                    const next = new Set(prev);
                    next.delete(node.path);
                    return next;
                  });
                }
              }
            }}
            style={{ paddingLeft: `${depth * 14 + 14}px` }}
            className="w-full flex items-center gap-2 py-2 px-2.5 text-xs text-purple-400 hover:text-purple-200 hover:bg-purple-950/40 active:bg-purple-900/50 rounded-lg transition-colors text-left min-h-[36px] font-medium"
          >
            {isThisLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400 shrink-0" />
            ) : (
              <PlusCircle className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            )}
            <span>{node.name || 'さらに読み込む...'}</span>
          </button>
        );
      }

      // File name display (.md hides extension, others keep extension)
      const isMd = node.name.toLowerCase().endsWith('.md');
      const displayName = isMd ? node.name.replace(/\.md$/, '') : node.name;
      const ext = node.name.includes('.') ? node.name.split('.').pop()?.toLowerCase() || '' : '';
      const iconColor = isSelected ? 'text-purple-400' : 'text-zinc-500';

      const renderFileIcon = () => {
        if (ext === 'base' || ext === 'bases' || node.name.toLowerCase().endsWith('.base.md')) {
          return <Table className={`w-4 h-4 shrink-0 ${iconColor}`} />;
        }
        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
          return <ImageIcon className={`w-4 h-4 shrink-0 ${iconColor}`} />;
        }
        if (['yaml', 'yml', 'json', 'js', 'ts', 'jsx', 'tsx', 'py', 'sh', 'bash', 'sql', 'css', 'html', 'toml', 'ini', 'env'].includes(ext)) {
          return <FileCode className={`w-4 h-4 shrink-0 ${iconColor}`} />;
        }
        if (['zip', 'tar', 'gz', 'bz2', '7z', 'rar'].includes(ext)) {
          return <FileArchive className={`w-4 h-4 shrink-0 ${iconColor}`} />;
        }
        if (isMd || ext === 'txt') {
          return <FileText className={`w-4 h-4 shrink-0 ${iconColor}`} />;
        }
        return <File className={`w-4 h-4 shrink-0 ${iconColor}`} />;
      };

      return (
        <button
          key={node.path}
          type="button"
          onClick={() => onSelectFile(node.path)}
          style={{ paddingLeft: `${depth * 14 + 26}px` }}
          className={`w-full flex items-center gap-2 py-2 px-2.5 text-xs rounded-lg transition-all text-left min-h-[38px] ${
            isSelected
              ? 'bg-purple-600/25 text-purple-200 font-semibold border-l-2 border-purple-500 shadow-sm'
              : 'text-zinc-300 hover:text-white hover:bg-obsidian-hover active:bg-zinc-800'
          }`}
        >
          {renderFileIcon()}
          <span className="truncate">{displayName}</span>
        </button>
      );
    });
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Quick Tree Filter */}
      <div className="p-2 border-b border-zinc-800/60">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="ツリー内を絞り込み..."
            className="w-full bg-zinc-900/90 border border-zinc-700/60 rounded-lg pl-8 pr-7 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500/80"
          />
          {filterText && (
            <button
              type="button"
              onClick={() => setFilterText('')}
              className="absolute right-2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tree list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {fileTree.length === 0 ? (
          <div className="text-center py-12 px-4 text-xs text-zinc-500">
            ファイルがありません
          </div>
        ) : (
          renderNodes(fileTree)
        )}
      </div>
    </div>
  );
};
