import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  X,
  Plus,
} from 'lucide-react';
import { FileNode, VaultConfig } from '../../types';

interface FileTreeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  fileTree: FileNode[];
  activeFilePath: string;
  onSelectFile: (path: string) => void;
  activeVault: VaultConfig | null;
  onOpenSettings: () => void;
}

export const FileTreeDrawer: React.FC<FileTreeDrawerProps> = ({
  isOpen,
  onClose,
  fileTree,
  activeFilePath,
  onSelectFile,
  activeVault,
  onOpenSettings,
}) => {
  // Set of expanded folder paths
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderNodes = (nodes: FileNode[], depth = 0) => {
    return nodes.map((node) => {
      const isFolder = node.type === 'tree';
      const isExpanded = expandedFolders.has(node.path);
      const isSelected = activeFilePath === node.path;

      if (isFolder) {
        return (
          <div key={node.path} className="select-none">
            <button
              type="button"
              onClick={() => toggleFolder(node.path)}
              style={{ paddingLeft: `${depth * 12 + 10}px` }}
              className="w-full flex items-center gap-1.5 py-1.5 px-2 text-xs text-zinc-300 hover:text-white hover:bg-obsidian-hover rounded-md transition-colors text-left group"
            >
              <span className="text-zinc-500 group-hover:text-zinc-400">
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </span>
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-purple-400/80 shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-purple-400/60 shrink-0" />
              )}
              <span className="truncate font-medium">{node.name}</span>
            </button>

            {isExpanded && node.children && (
              <div className="border-l border-zinc-800 ml-4">
                {renderNodes(node.children, depth + 1)}
              </div>
            )}
          </div>
        );
      }

      // Markdown file
      const displayName = node.name.replace(/\.md$/, '');

      return (
        <button
          key={node.path}
          type="button"
          onClick={() => {
            onSelectFile(node.path);
            onClose();
          }}
          style={{ paddingLeft: `${depth * 12 + 24}px` }}
          className={`w-full flex items-center gap-2 py-1.5 px-2 text-xs rounded-md transition-all text-left ${
            isSelected
              ? 'bg-purple-600/20 text-purple-300 font-semibold border-l-2 border-purple-500'
              : 'text-zinc-300 hover:text-white hover:bg-obsidian-hover'
          }`}
        >
          <FileText
            className={`w-3.5 h-3.5 shrink-0 ${
              isSelected ? 'text-purple-400' : 'text-zinc-500'
            }`}
          />
          <span className="truncate">{displayName}</span>
        </button>
      );
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <aside className="relative flex flex-col w-[80vw] max-w-xs h-full bg-obsidian-sidebar border-r border-obsidian-border shadow-2xl z-10 animate-in slide-in-from-left duration-200 safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-obsidian-border">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-purple-600/20 flex items-center justify-center">
              <Folder className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <span className="font-semibold text-sm text-zinc-100 truncate">
              {activeVault?.name || 'ファイル一覧'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-obsidian-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tree Content */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {fileTree.length === 0 ? (
            <div className="text-center py-12 px-4 text-xs text-zinc-500">
              {activeVault ? 'ファイルがありません' : 'Vaultが設定されていません'}
            </div>
          ) : (
            renderNodes(fileTree)
          )}
        </div>

        {/* Footer Info */}
        <div className="p-3 border-t border-obsidian-border bg-zinc-900/40">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <div className="truncate text-[11px]">
              {activeVault?.owner}/{activeVault?.repo} ({activeVault?.branch || 'main'})
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
              title="Vault管理"
              className="p-1 text-purple-400 hover:text-purple-300 hover:bg-purple-950/30 rounded"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};
