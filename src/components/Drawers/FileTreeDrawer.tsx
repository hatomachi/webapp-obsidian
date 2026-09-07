import React from 'react';
import { Folder, X, Plus } from 'lucide-react';
import { FileNode, VaultConfig } from '../../types';
import { FileTreeContent } from './FileTreeContent';

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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex md:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <aside className="relative flex flex-col w-[85vw] max-w-xs h-full bg-obsidian-sidebar border-r border-obsidian-border shadow-2xl z-10 animate-in slide-in-from-left duration-200 safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-obsidian-border shrink-0">
          <div className="flex items-center gap-2 truncate">
            <div className="w-6 h-6 rounded bg-purple-600/20 flex items-center justify-center shrink-0">
              <Folder className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <span className="font-semibold text-sm text-zinc-100 truncate">
              {activeVault?.name || 'ファイル一覧'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-obsidian-hover transition-colors ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tree Content */}
        <div className="flex-1 overflow-hidden">
          <FileTreeContent
            fileTree={fileTree}
            activeFilePath={activeFilePath}
            onSelectFile={(path) => {
              onSelectFile(path);
              onClose();
            }}
          />
        </div>

        {/* Footer Info */}
        <div className="p-3 border-t border-obsidian-border bg-zinc-900/40 shrink-0">
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
