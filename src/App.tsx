import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { ChecklistActionBar } from './components/Checklist/ChecklistActionBar';
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
  const [initialContent, setInitialContent] = useState<string>('');
  const [currentSha, setCurrentSha] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSavingTasks, setIsSavingTasks] = useState<boolean>(false);
  const taskStatsRef = React.useRef({ total: 0, completed: 0, pendingChanges: 0 });
  const mainScrollRef = useRef<HTMLElement>(null);
  const pendingHeadingRef = useRef<string | null>(null);

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

  // Stable references for state to prevent callback recreation & infinite loops
  const fileShaMapRef = React.useRef<Map<string, string>>(new Map());
  const activeVaultRef = React.useRef<VaultConfig | null>(activeVault);
  activeVaultRef.current = activeVault;
  const activeFilePathRef = React.useRef<string>(activeFilePath);
  activeFilePathRef.current = activeFilePath;

  // Load a specific markdown file with SWR (Stale-While-Revalidate)
  const loadFileContent = useCallback(
    async (
      vault: VaultConfig,
      path: string,
      targetSha?: string,
      force: boolean = false
    ) => {
      // If user is actively toggling checklist items, do not overwrite silently in background
      if (taskStatsRef.current.pendingChanges > 0 && !force) {
        return;
      }

      setActiveFilePath(path);
      activeFilePathRef.current = path;
      localStorage.setItem(`webapp_obsidian_last_file_${vault.id}`, path);

      // SWR: 即座にローカルキャッシュを描画（0秒起動・画面遷移）
      const cached = GitHubService.getCachedContent(vault, path);
      if (cached && !force) {
        setContent(cached.content);
        setInitialContent(cached.content);
        setCurrentSha(cached.sha);
      } else {
        setIsLoading(true);
      }

      setError(null);

      try {
        const expectedSha = targetSha || fileShaMapRef.current.get(path);

        // キャッシュが存在し、SHAが最新と一致し、強制リフレッシュでない場合は再取得不要
        if (cached && expectedSha && cached.sha === expectedSha && !force) {
          setIsLoading(false);
          return;
        }

        // GitHub API から最新コンテンツを取得（キャッシュなし、SHA不一致、または強制取得時）
        const res = await GitHubService.fetchFileContent(vault, path, {
          fileSha: expectedSha,
          force,
        });

        // フェッチ完了時にも未保存タスクがあれば上書きしない
        if (taskStatsRef.current.pendingChanges > 0 && !force) {
          setIsLoading(false);
          return;
        }

        setContent(res.content);
        setInitialContent(res.content);
        setCurrentSha(res.sha);

        // キャッシュから更新された場合、控えめにトースト通知
        if (cached && cached.sha !== res.sha) {
          showToast('ノートを最新に更新しました', 'info');
        }
      } catch (e: any) {
        console.error('Failed to load file:', e);
        if (!cached) {
          setError(`ファイル "${path}" の読み込みに失敗しました: ${e.message}`);
        } else {
          showToast('最新データの取得に失敗しました（キャッシュを表示中）', 'error');
        }
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Fetch File Tree for active vault
  const loadFileTree = useCallback(
    async (vault: VaultConfig, force: boolean = false) => {
      try {
        setIsRefreshing(true);
        setError(null);
        const tree = await GitHubService.fetchFileTree(vault, force);
        setFileTree(tree);

        // Extract file paths and sha mapping
        const paths: string[] = [];
        const shaMap = new Map<string, string>();
        const traverse = (nodes: FileNode[]) => {
          for (const node of nodes) {
            if (node.type === 'blob' && node.path.endsWith('.md')) {
              paths.push(node.path);
              if (node.sha) shaMap.set(node.path, node.sha);
            }
            if (node.children) traverse(node.children);
          }
        };
        traverse(tree);

        fileShaMapRef.current = shaMap;

        const lastFileKey = `webapp_obsidian_last_file_${vault.id}`;
        const lastFile = localStorage.getItem(lastFileKey);

        const currentPath = activeFilePathRef.current;
        const currentTarget = currentPath && paths.includes(currentPath) ? currentPath : null;
        const targetFile =
          currentTarget ||
          (lastFile && paths.includes(lastFile) ? lastFile : null) ||
          (paths.length > 0
            ? paths.find((p) => p.toLowerCase().includes('index') || p.toLowerCase().includes('readme')) || paths[0]
            : null);

        if (targetFile) {
          const expectedSha = shaMap.get(targetFile);
          await loadFileContent(vault, targetFile, expectedSha, force);
        } else {
          setActiveFilePath('');
          activeFilePathRef.current = '';
          setContent('# ノートがありません\n\nこのVaultにはMarkdownファイルが見つかりませんでした。');
        }
      } catch (e: any) {
        console.error('Failed to load file tree:', e);
        setError(e.message || 'ファイルツリーの取得に失敗しました。');
      } finally {
        setIsRefreshing(false);
      }
    },
    [loadFileContent]
  );

  // Fast initial cache render on startup (0-second load before network completes)
  useEffect(() => {
    if (!activeVault) return;
    const lastFileKey = `webapp_obsidian_last_file_${activeVault.id}`;
    const lastFile = localStorage.getItem(lastFileKey);
    if (lastFile && !content) {
      const cached = GitHubService.getCachedContent(activeVault, lastFile);
      if (cached) {
        setActiveFilePath(lastFile);
        activeFilePathRef.current = lastFile;
        setContent(cached.content);
        setInitialContent(cached.content);
        setCurrentSha(cached.sha);
      }
    }
  }, [activeVaultId]);

  // Load active vault tree on change (ONLY when activeVaultId changes)
  useEffect(() => {
    if (activeVault) {
      loadFileTree(activeVault);
    }
  }, [activeVaultId, loadFileTree]);

  // Auto-revalidate on visibility change (when returning from background or switching apps on iOS PWA)
  const lastRevalidateRef = React.useRef<number>(Date.now());
  const isRevalidatingRef = React.useRef<boolean>(false);
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (
        document.visibilityState === 'visible' &&
        activeVaultRef.current &&
        !isRevalidatingRef.current &&
        taskStatsRef.current.pendingChanges === 0
      ) {
        const now = Date.now();
        // Avoid spamming if user rapidly switches apps (15s throttle)
        if (now - lastRevalidateRef.current > 15000) {
          lastRevalidateRef.current = now;
          isRevalidatingRef.current = true;
          try {
            await loadFileTree(activeVaultRef.current);
          } finally {
            isRevalidatingRef.current = false;
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [loadFileTree]);

  // Checklist stats and pending changes calculation
  const taskStats = useMemo(() => {
    if (!content) {
      return { total: 0, completed: 0, pendingChanges: 0 };
    }

    const currentLines = content.split('\n');
    const initialLines = initialContent ? initialContent.split('\n') : [];

    let total = 0;
    let completed = 0;
    let pendingChanges = 0;

    let inCode = false;
    for (let i = 0; i < currentLines.length; i++) {
      const line = currentLines[i];
      if (line.trim().startsWith('```')) {
        inCode = !inCode;
        continue;
      }
      if (inCode) continue;

      const match = line.match(/^\s*[-*+]\s*\[([ xX])\]/);
      if (match) {
        total++;
        const isChecked = match[1].toLowerCase() === 'x';
        if (isChecked) completed++;

        // Compare with initial content line
        const initialLine = initialLines[i];
        if (initialLine !== undefined) {
          const initMatch = initialLine.match(/^\s*[-*+]\s*\[([ xX])\]/);
          if (initMatch) {
            const initChecked = initMatch[1].toLowerCase() === 'x';
            if (isChecked !== initChecked) {
              pendingChanges++;
            }
          } else {
            pendingChanges++;
          }
        } else {
          pendingChanges++;
        }
      }
    }

    if (initialContent && content !== initialContent && pendingChanges === 0) {
      pendingChanges = 1;
    }

    const stats = { total, completed, pendingChanges };
    taskStatsRef.current = stats;
    return stats;
  }, [content, initialContent]);

  // Safe navigation that guards against discarding uncommitted checklist changes
  const safeNavigateFile = useCallback(
    (path: string, heading?: string) => {
      if (taskStatsRef.current.pendingChanges > 0) {
        if (!window.confirm('未保存のチェック変更があります。破棄して移動しますか？')) {
          return;
        }
      }
      if (heading) {
        pendingHeadingRef.current = heading;
      }
      if (activeVaultRef.current) {
        const expectedSha = fileShaMapRef.current.get(path);
        loadFileContent(activeVaultRef.current, path, expectedSha);
      }
    },
    [loadFileContent]
  );

  // Auto-scroll to top when navigating to a new note (unless a heading anchor is targeted)
  useEffect(() => {
    if (!pendingHeadingRef.current && mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }
  }, [activeFilePath]);

  // Scroll to targeted heading after content is loaded
  useEffect(() => {
    if (pendingHeadingRef.current && content) {
      const heading = pendingHeadingRef.current;
      pendingHeadingRef.current = null;
      setTimeout(() => {
        const clean = heading.toLowerCase().trim();
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        for (const h of headings) {
          if (h.textContent?.trim().toLowerCase().includes(clean)) {
            h.scrollIntoView({ behavior: 'smooth' });
            break;
          }
        }
      }, 100);
    }
  }, [content]);

  // Note Navigation History & Recents Hook
  const { recentNotes, canGoBack, canGoForward, goBack, goForward } = useNoteHistory(
    activeVaultId,
    activeFilePath,
    safeNavigateFile
  );

  // Switch vault
  const handleSelectVault = (vaultId: string) => {
    if (taskStats.pendingChanges > 0) {
      if (!window.confirm('未保存のチェック変更があります。破棄してVaultを切り替えますか？')) {
        return;
      }
    }
    setActiveVaultId(vaultId);
    VaultManager.setActiveVaultId(vaultId);
    setFileTree([]);
    setActiveFilePath('');
    setContent('');
    setInitialContent('');
  };

  // Toggle interactive task in viewer (hybrid local toggle: no immediate git commit)
  const handleToggleTask = (
    lineIndex: number,
    lineText: string,
    checked: boolean
  ) => {
    const lines = content.split('\n');
    let targetIndex = lineIndex;

    // Verify if lines[targetIndex] matches the expected task line
    if (
      lines[targetIndex] === undefined ||
      !/^\s*[-*+]\s*\[[ xX]\]/.test(lines[targetIndex]) ||
      lines[targetIndex].trim() !== lineText.trim()
    ) {
      // Fallback: Find matching line by text
      const found = lines.findIndex((l) => l.trim() === lineText.trim());
      if (found !== -1) {
        targetIndex = found;
      }
    }

    if (lines[targetIndex] !== undefined) {
      const line = lines[targetIndex];
      lines[targetIndex] = line.replace(
        /^(\s*[-*+]\s*\[)[ xX](\]\s*.*)$/,
        checked ? '$1x$2' : '$1 $2'
      );
      setContent(lines.join('\n'));
    }
  };

  // Commit all task changes to GitHub as a single batch
  const handleSaveTaskChanges = async () => {
    if (!activeVault || !activeFilePath) return;

    setIsSavingTasks(true);
    try {
      showToast('チェック状態をGitHubへコミット中...', 'info');
      const res = await GitHubService.saveFile(
        activeVault,
        activeFilePath,
        content,
        currentSha,
        `chore: update checklist in ${activeFilePath}`
      );
      setInitialContent(content);
      setCurrentSha(res.newSha);
      showToast('GitHubへ反映しました', 'success');
    } catch (e: any) {
      console.error('Task save failed:', e);
      showToast(`コミットに失敗しました: ${e.message}`, 'error');
    } finally {
      setIsSavingTasks(false);
    }
  };

  // Reset all tasks in current note to unchecked
  const handleResetAllTasks = () => {
    if (!content) return;
    const lines = content.split('\n');
    let inCode = false;
    let modified = false;

    const newLines = lines.map((line) => {
      if (line.trim().startsWith('```')) {
        inCode = !inCode;
        return line;
      }
      if (inCode) return line;

      if (/^\s*[-*+]\s*\[[xX]\]/.test(line)) {
        modified = true;
        return line.replace(/^(\s*[-*+]\s*\[)[xX](\])/, '$1 $2');
      }
      return line;
    });

    if (modified) {
      setContent(newLines.join('\n'));
      showToast('すべてのチェックを解除しました', 'info');
    }
  };

  // Discard uncommitted task changes
  const handleDiscardTaskChanges = () => {
    setContent(initialContent);
    showToast('チェックの変更を元に戻しました', 'info');
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
      setInitialContent(updatedContent);
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
    setInitialContent(newContent);
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
        onRefresh={async () => {
          if (activeVault) {
            await loadFileTree(activeVault, true);
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
                safeNavigateFile(path);
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
              onSelectFile={safeNavigateFile}
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
                onSelectFile={safeNavigateFile}
              />
            </div>
            <div className="p-2.5 border-t border-obsidian-border bg-zinc-900/40 text-[11px] text-zinc-500 truncate flex items-center justify-between">
              <span>{allFilePaths.length} 件のノート</span>
              <span className="text-[10px] text-zinc-600 font-mono">PC 2-Pane</span>
            </div>
          </aside>
        )}

        {/* Main Content Scroll Area */}
        <main ref={mainScrollRef} className={`flex-1 overflow-y-auto ${taskStats.total > 0 ? 'pb-32 sm:pb-28' : 'pb-24'}`}>
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
                onNavigateFile={safeNavigateFile}
                onToggleTask={handleToggleTask}
              />

              {/* Sibling Notes Navigation at Bottom */}
              {uiPrefs.enableFooterNav && activeVault && activeFilePath && (
                <FolderSiblingNav
                  activeFilePath={activeFilePath}
                  allFilePaths={allFilePaths}
                  onSelectFile={safeNavigateFile}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Checklist Action Bar (Sticky above quick append bar when note contains tasks) */}
      {activeVault && activeFilePath && taskStats.total > 0 && (
        <div className="fixed bottom-14 sm:bottom-16 left-0 right-0 z-20 pointer-events-none">
          <div className="pointer-events-auto">
            <ChecklistActionBar
              totalTasks={taskStats.total}
              completedTasks={taskStats.completed}
              pendingChangeCount={taskStats.pendingChanges}
              isSaving={isSavingTasks}
              onSave={handleSaveTaskChanges}
              onResetAll={handleResetAllTasks}
              onDiscard={handleDiscardTaskChanges}
            />
          </div>
        </div>
      )}

      {/* Quick Append Bar (Sticky at bottom for mobile) */}
      {activeVault && activeFilePath && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-obsidian-sidebar/95 backdrop-blur-md border-t border-obsidian-border p-2 safe-bottom select-none">
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
              className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700/80 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors select-text"
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
        onSelectFile={safeNavigateFile}
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
        onSelectFile={safeNavigateFile}
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
