import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from './components/Layout/Header';
import { FileTreeDrawer } from './components/Drawers/FileTreeDrawer';
import { TOCDrawer } from './components/Drawers/TOCDrawer';
import { QuickSwitcherModal } from './components/Modals/QuickSwitcherModal';
import { EditModal } from './components/Modals/EditModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { MarkdownViewer } from './components/MarkdownViewer/MarkdownViewer';
import { VaultManager } from './services/VaultManager';
import { GitHubService } from './services/GitHubService';
import { VaultConfig, FileNode, UIPreferences } from './types';
import { extractTOC } from './utils/markdownUtils';
import { extractTitle } from './utils/encoding';
import { FileTreeContent } from './components/Drawers/FileTreeContent';
import { BreadcrumbNav } from './components/Navigation/BreadcrumbNav';
import { RecentNotesBar } from './components/Navigation/RecentNotesBar';
import { FolderSiblingNav } from './components/Navigation/FolderSiblingNav';
import { useNoteHistory } from './hooks/useNoteHistory';
import { Loader2, AlertCircle, Plus, Send, Check } from 'lucide-react';

const DEFAULT_UI_PREFS: UIPreferences = {
  enableDesktopSidebar: true,
  enableBreadcrumbs: true,
  enableRecentNotes: true,
  enableFooterNav: true,
};

export const App: React.FC = () => {
  // Vaults State
  const [vaults, setVaults] = useState<VaultConfig[]>([]);
  const [activeVaultId, setActiveVaultId] = useState<string | null>(null);

  // File & Content State
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [currentSha, setCurrentSha] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Quick Append Input State
  const [quickNoteText, setQuickNoteText] = useState('');
  const [isAppending, setIsAppending] = useState(false);

  // Toast State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);

  // UI Preferences State
  const [uiPrefs, setUiPrefs] = useState<UIPreferences>(() => {
    try {
      const saved = localStorage.getItem('webapp_obsidian_ui_preferences');
      if (saved) {
        return { ...DEFAULT_UI_PREFS, ...JSON.parse(saved) };
      }
    } catch {
      // ignore
    }
    return DEFAULT_UI_PREFS;
  });

  const handleUpdateUIPrefs = (prefs: UIPreferences) => {
    setUiPrefs(prefs);
    try {
      localStorage.setItem('webapp_obsidian_ui_preferences', JSON.stringify(prefs));
    } catch (e) {
      console.error('Failed to save UI preferences', e);
    }
  };

  // Modals & Drawers
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    return typeof window !== 'undefined' && window.innerWidth >= 768;
  });
  const [isTOCOpen, setIsTOCOpen] = useState<boolean>(false);
  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const showToast = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Load vaults on mount
  useEffect(() => {
    const loadedVaults = VaultManager.getVaults();
    setVaults(loadedVaults);
    const activeId = VaultManager.getActiveVaultId();
    if (activeId && loadedVaults.some((v) => v.id === activeId)) {
      setActiveVaultId(activeId);
    } else if (loadedVaults.length > 0) {
      setActiveVaultId(loadedVaults[0].id);
      VaultManager.setActiveVaultId(loadedVaults[0].id);
    } else {
      // Prompt user to add a vault if none exists
      setIsSettingsOpen(true);
    }
  }, []);

  const activeVault = useMemo(() => {
    return vaults.find((v) => v.id === activeVaultId) || null;
  }, [vaults, activeVaultId]);

  // Recursively extract all markdown file paths from fileTree
  const allFilePaths = useMemo(() => {
    const paths: string[] = [];
    const traverse = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === 'blob' && node.path.endsWith('.md')) {
          paths.push(node.path);
        }
        if (node.children) {
          traverse(node.children);
        }
      }
    };
    traverse(fileTree);
    return paths;
  }, [fileTree]);

  // Fetch File Tree for active vault
  const loadFileTree = useCallback(
    async (vault: VaultConfig) => {
      try {
        setIsRefreshing(true);
        setError(null);
        const tree = await GitHubService.fetchFileTree(vault);
        setFileTree(tree);

        // Find initial file to open
        const paths: string[] = [];
        const traverse = (nodes: FileNode[]) => {
          for (const node of nodes) {
            if (node.type === 'blob' && node.path.endsWith('.md')) {
              paths.push(node.path);
            }
            if (node.children) traverse(node.children);
          }
        };
        traverse(tree);

        const lastFileKey = `webapp_obsidian_last_file_${vault.id}`;
        const lastFile = localStorage.getItem(lastFileKey);

        if (lastFile && paths.includes(lastFile)) {
          loadFileContent(vault, lastFile);
        } else if (paths.length > 0) {
          // Prefer INDEX.md or README.md if available
          const indexFile =
            paths.find((p) => p.toLowerCase().includes('index') || p.toLowerCase().includes('readme')) ||
            paths[0];
          loadFileContent(vault, indexFile);
        } else {
          setActiveFilePath('');
          setContent('# ノートがありません\n\nこのVaultにはMarkdownファイルが見つかりませんでした。');
        }
      } catch (e: any) {
        console.error('Failed to load file tree:', e);
        setError(e.message || 'ファイルツリーの取得に失敗しました。');
      } finally {
        setIsRefreshing(false);
      }
    },
    []
  );

  // Load active vault tree on change
  useEffect(() => {
    if (activeVault) {
      loadFileTree(activeVault);
    }
  }, [activeVault, loadFileTree]);

  // Load a specific markdown file
  const loadFileContent = useCallback(async (vault: VaultConfig, path: string) => {
    setIsLoading(true);
    setError(null);
    setActiveFilePath(path);
    localStorage.setItem(`webapp_obsidian_last_file_${vault.id}`, path);

    try {
      const res = await GitHubService.fetchFileContent(vault, path);
      setContent(res.content);
      setCurrentSha(res.sha);
    } catch (e: any) {
      console.error('Failed to load file:', e);
      setError(`ファイル "${path}" の読み込みに失敗しました: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Note Navigation History & Recents Hook
  const { recentNotes, canGoBack, canGoForward, goBack, goForward } = useNoteHistory(
    activeVaultId,
    activeFilePath,
    useCallback(
      (path: string) => {
        if (activeVault) loadFileContent(activeVault, path);
      },
      [activeVault, loadFileContent]
    )
  );

  // Switch vault
  const handleSelectVault = (vaultId: string) => {
    setActiveVaultId(vaultId);
    VaultManager.setActiveVaultId(vaultId);
    setFileTree([]);
    setActiveFilePath('');
    setContent('');
  };

  // Toggle interactive task in viewer
  const handleToggleTask = async (
    lineIndex: number,
    lineText: string,
    checked: boolean
  ) => {
    if (!activeVault || !activeFilePath) return;

    // Optimistic UI update
    const previousContent = content;
    const lines = content.split('\n');
    if (lines[lineIndex] !== undefined) {
      const line = lines[lineIndex];
      lines[lineIndex] = checked
        ? line.replace(/-\s*\[\s*\]/, '- [x]')
        : line.replace(/-\s*\[x\]/i, '- [ ]');
      setContent(lines.join('\n'));
    }

    try {
      showToast(checked ? 'タスクを完了にしました (コミット中...)' : 'タスクを未完了にしました (コミット中...)', 'info');
      const res = await GitHubService.toggleTaskInFile(
        activeVault,
        activeFilePath,
        lineIndex,
        lineText,
        checked
      );
      setContent(res.newContent);
      setCurrentSha(res.newSha);
      showToast('GitHubへコミットしました', 'success');
    } catch (e: any) {
      console.error('Task toggle failed:', e);
      // Rollback on error
      setContent(previousContent);
      showToast(`コミットに失敗しました: ${e.message}`, 'error');
    }
  };

  // Quick Append to current note
  const handleQuickAppend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickNoteText.trim() || !activeVault || !activeFilePath) return;

    setIsAppending(true);
    const textToAppend = quickNoteText.trim();
    const updatedContent = content + (content.endsWith('\n') ? '' : '\n') + `- [ ] ${textToAppend}\n`;

    // Optimistic update
    setContent(updatedContent);
    setQuickNoteText('');

    try {
      showToast('メモを追記中...', 'info');
      const res = await GitHubService.saveFile(
        activeVault,
        activeFilePath,
        updatedContent,
        currentSha,
        `chore: append quick note to ${activeFilePath}`
      );
      setCurrentSha(res.newSha);
      showToast('追記＆コミット完了', 'success');
    } catch (e: any) {
      console.error('Quick append failed:', e);
      showToast(`追記に失敗しました: ${e.message}`, 'error');
    } finally {
      setIsAppending(false);
    }
  };

  // Save from full edit modal
  const handleSaveFullEdit = async (newContent: string, commitMessage?: string) => {
    if (!activeVault || !activeFilePath) return;
    const res = await GitHubService.saveFile(
      activeVault,
      activeFilePath,
      newContent,
      currentSha,
      commitMessage
    );
    setContent(newContent);
    setCurrentSha(res.newSha);
    showToast('保存＆コミットが完了しました', 'success');
  };

  // Settings callbacks
  const handleAddVault = (vaultData: Omit<VaultConfig, 'id'>) => {
    const newVault = VaultManager.addVault(vaultData);
    setVaults(VaultManager.getVaults());
    setActiveVaultId(newVault.id);
    showToast(`Vault "${newVault.name}" を追加しました`, 'success');
  };

  const handleUpdateVault = (vault: VaultConfig) => {
    VaultManager.updateVault(vault);
    setVaults(VaultManager.getVaults());
    showToast(`Vault "${vault.name}" を更新しました`, 'success');
  };

  const handleDeleteVault = (id: string) => {
    VaultManager.deleteVault(id);
    const updated = VaultManager.getVaults();
    setVaults(updated);
    setActiveVaultId(VaultManager.getActiveVaultId());
    showToast('Vaultを削除しました', 'info');
  };

  const handleClearCache = (owner: string, repo: string) => {
    VaultManager.clearVaultCache(owner, repo);
    if (activeVault) {
      loadFileTree(activeVault);
    }
  };

  // TOC list of current note
  const currentTOC = useMemo(() => {
    return extractTOC(content);
  }, [content]);

  // Current title
  const currentTitle = useMemo(() => {
    if (!activeFilePath) return '';
    return extractTitle(content, activeFilePath.split('/').pop() || '');
  }, [content, activeFilePath]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-obsidian-bg text-obsidian-text">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full shadow-2xl text-xs font-medium backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150 border border-zinc-700/80 bg-zinc-900/90 text-white">
          {toastMessage.type === 'success' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
          {toastMessage.type === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
          {toastMessage.type === 'info' && <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <Header
        vaults={vaults}
        activeVault={activeVault}
        currentTitle={currentTitle}
        onSelectVault={handleSelectVault}
        onOpenSidebar={() => setIsSidebarOpen((prev) => !prev)}
        isSidebarOpen={isSidebarOpen}
        onOpenTOC={() => setIsTOCOpen(true)}
        onOpenQuickSwitcher={() => setIsQuickSwitcherOpen(true)}
        onOpenEditModal={() => setIsEditModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefresh={() => {
          if (activeVault) {
            loadFileTree(activeVault);
            showToast('最新データを取得しました', 'success');
          }
        }}
        isRefreshing={isRefreshing}
      />

      {/* Navigation Sub-bars (Breadcrumbs & Recent Notes) */}
      {activeVault && activeFilePath && (
        <div className="shrink-0 z-20">
          {uiPrefs.enableBreadcrumbs && (
            <BreadcrumbNav
              activeFilePath={activeFilePath}
              allFilePaths={allFilePaths}
              onSelectFile={(path) => {
                if (activeVault) loadFileContent(activeVault, path);
              }}
            />
          )}
          {uiPrefs.enableRecentNotes && (
            <RecentNotesBar
              recentNotes={recentNotes}
              activeFilePath={activeFilePath}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onGoBack={goBack}
              onGoForward={goForward}
              onSelectFile={(path) => {
                if (activeVault) loadFileContent(activeVault, path);
              }}
            />
          )}
        </div>
      )}

      {/* Body Area: PC Split View (Sidebar + Main Content) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop Permanent Sidebar */}
        {uiPrefs.enableDesktopSidebar && isSidebarOpen && (
          <aside className="hidden md:flex flex-col w-64 lg:w-72 bg-obsidian-sidebar border-r border-obsidian-border shrink-0 animate-in slide-in-from-left duration-150">
            <div className="flex-1 overflow-hidden">
              <FileTreeContent
                fileTree={fileTree}
                activeFilePath={activeFilePath}
                onSelectFile={(path) => {
                  if (activeVault) loadFileContent(activeVault, path);
                }}
              />
            </div>
            <div className="p-2.5 border-t border-obsidian-border bg-zinc-900/40 text-[11px] text-zinc-500 truncate flex items-center justify-between">
              <span>{allFilePaths.length} 件のノート</span>
              <span className="text-[10px] text-zinc-600 font-mono">PC 2-Pane</span>
            </div>
          </aside>
        )}

        {/* Main Content Scroll Area */}
        <main className="flex-1 overflow-y-auto pb-24">
          {error && (
            <div className="m-4 p-3 bg-rose-950/40 border border-rose-800 rounded-xl flex items-center gap-3 text-xs text-rose-300">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-zinc-500 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              <span className="text-xs">ノートを読み込み中...</span>
            </div>
          ) : !activeVault ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-4">
              <div className="w-16 h-16 rounded-2xl bg-purple-600/20 flex items-center justify-center mb-4 border border-purple-500/30">
                <Plus className="w-8 h-8 text-purple-400" />
              </div>
              <h2 className="text-lg font-bold text-zinc-200 mb-2">Vaultが設定されていません</h2>
              <p className="text-xs text-zinc-400 max-w-sm mb-6 leading-relaxed">
                GitHub Private リポジトリを連携して、スマホから安全にObsidianノートを閲覧・編集しましょう。
              </p>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold shadow-lg transition-all"
              >
                Vaultを設定する
              </button>
            </div>
          ) : (
            <>
              <MarkdownViewer
                content={content}
                filePath={activeFilePath}
                allFilePaths={allFilePaths}
                onNavigateFile={(path) => {
                  if (activeVault) loadFileContent(activeVault, path);
                }}
                onToggleTask={handleToggleTask}
              />

              {/* Sibling Notes Navigation at Bottom */}
              {uiPrefs.enableFooterNav && activeVault && activeFilePath && (
                <FolderSiblingNav
                  activeFilePath={activeFilePath}
                  allFilePaths={allFilePaths}
                  onSelectFile={(path) => {
                    if (activeVault) loadFileContent(activeVault, path);
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Quick Append Bar (Sticky at bottom for mobile) */}
      {activeVault && activeFilePath && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-obsidian-sidebar/95 backdrop-blur-md border-t border-obsidian-border p-2 safe-bottom">
          <form
            onSubmit={handleQuickAppend}
            className="max-w-4xl mx-auto flex items-center gap-2 px-2"
          >
            <input
              type="text"
              value={quickNoteText}
              onChange={(e) => setQuickNoteText(e.target.value)}
              placeholder="＋ このノートの末尾にTODOを追加..."
              disabled={isAppending}
              className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700/80 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
            <button
              type="submit"
              disabled={!quickNoteText.trim() || isAppending}
              className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:opacity-40 text-white rounded-xl text-xs font-semibold shadow flex items-center gap-1.5 transition-all"
            >
              {isAppending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">追加</span>
            </button>
          </form>
        </div>
      )}

      {/* Drawers & Modals */}
      <FileTreeDrawer
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        fileTree={fileTree}
        activeFilePath={activeFilePath}
        onSelectFile={(path) => {
          if (activeVault) loadFileContent(activeVault, path);
        }}
        activeVault={activeVault}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <TOCDrawer
        isOpen={isTOCOpen}
        onClose={() => setIsTOCOpen(false)}
        tocList={currentTOC}
      />

      <QuickSwitcherModal
        isOpen={isQuickSwitcherOpen}
        onClose={() => setIsQuickSwitcherOpen(false)}
        allFilePaths={allFilePaths}
        onSelectFile={(path) => {
          if (activeVault) loadFileContent(activeVault, path);
        }}
      />

      <EditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        filePath={activeFilePath}
        initialContent={content}
        onSave={handleSaveFullEdit}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        vaults={vaults}
        activeVaultId={activeVaultId}
        onSaveVault={handleUpdateVault}
        onAddVault={handleAddVault}
        onDeleteVault={handleDeleteVault}
        onSelectVault={handleSelectVault}
        onClearCache={handleClearCache}
        uiPrefs={uiPrefs}
        onUpdateUIPrefs={handleUpdateUIPrefs}
      />
    </div>
  );
};
export default App;
