import { useState, useEffect, useRef, useCallback } from 'react';
import { VaultConfig, RecentUpdatedFile, CommitType } from '../types';
import { GitService } from '../services/GitService';

const MAX_RECENTS = 8;
const MODE_STORAGE_KEY = 'webapp_obsidian_recent_bar_mode';

export type RecentBarMode = 'updated' | 'opened';

export function useNoteHistory(
  activeVault: VaultConfig | null,
  activeFilePath: string,
  onNavigate: (path: string) => void
) {
  const vaultId = activeVault?.id || null;

  // Navigation stack for Back / Forward
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [stackIndex, setStackIndex] = useState<number>(-1);
  const isInternalNavigationRef = useRef<boolean>(false);

  // Recent opened notes (persisted in localStorage per vault)
  const [recentNotes, setRecentNotes] = useState<string[]>([]);

  // Recent updated notes (from git commits, SWR persisted per vault)
  const [recentUpdatedNotes, setRecentUpdatedNotes] = useState<RecentUpdatedFile[]>([]);
  const [isRefreshingUpdated, setIsRefreshingUpdated] = useState<boolean>(false);

  // Bar mode: 'updated' (default) or 'opened'
  const [barMode, setBarMode] = useState<RecentBarMode>(() => {
    try {
      const saved = localStorage.getItem(MODE_STORAGE_KEY);
      if (saved === 'opened' || saved === 'updated') return saved;
    } catch {}
    return 'updated'; // Default to updated
  });

  const toggleBarMode = useCallback(() => {
    setBarMode((prev) => {
      const next = prev === 'updated' ? 'opened' : 'updated';
      try {
        localStorage.setItem(MODE_STORAGE_KEY, next);
      } catch {}
      return next;
    });
  }, []);

  // Refresh recent updated files from repository
  const refreshUpdatedNotes = useCallback(async () => {
    if (!activeVault) return;
    setIsRefreshingUpdated(true);
    try {
      const fetched = await GitService.fetchRecentUpdatedFiles(activeVault, MAX_RECENTS);
      if (fetched && fetched.length > 0) {
        setRecentUpdatedNotes(fetched);
        try {
          localStorage.setItem(
            `webapp_obsidian_recent_updated_${activeVault.id}`,
            JSON.stringify(fetched)
          );
        } catch (e) {
          console.warn('Failed to cache recent updated files', e);
        }
      }
    } catch (e) {
      console.warn('Failed to refresh recent updated files', e);
    } finally {
      setIsRefreshingUpdated(false);
    }
  }, [activeVault]);

  // Record a file that was just updated in-app (e.g. task toggle, save)
  const recordUpdatedNote = useCallback(
    (filePath: string, commitType: CommitType = 'manual') => {
      if (!vaultId) return;
      setRecentUpdatedNotes((prev) => {
        const filtered = prev.filter((item) => item.path !== filePath);
        const newEntry: RecentUpdatedFile = {
          path: filePath,
          commitSha: 'local',
          commitMessage: commitType === 'task_toggle' ? 'Task checked' : 'File updated',
          authorName: 'You',
          authorDate: new Date().toISOString(),
          commitType,
        };
        const updated = [newEntry, ...filtered].slice(0, MAX_RECENTS);
        try {
          localStorage.setItem(`webapp_obsidian_recent_updated_${vaultId}`, JSON.stringify(updated));
        } catch {}
        return updated;
      });
    },
    [vaultId]
  );

  // Load recent notes & SWR cache when vault changes
  useEffect(() => {
    if (!vaultId) {
      setRecentNotes([]);
      setRecentUpdatedNotes([]);
      setHistoryStack([]);
      setStackIndex(-1);
      return;
    }

    // 1. Load opened notes from cache
    const keyOpened = `webapp_obsidian_recent_${vaultId}`;
    try {
      const saved = localStorage.getItem(keyOpened);
      setRecentNotes(saved ? JSON.parse(saved) : []);
    } catch {
      setRecentNotes([]);
    }

    // 2. Load updated notes from cache (0-sec display)
    const keyUpdated = `webapp_obsidian_recent_updated_${vaultId}`;
    try {
      const saved = localStorage.getItem(keyUpdated);
      setRecentUpdatedNotes(saved ? JSON.parse(saved) : []);
    } catch {
      setRecentUpdatedNotes([]);
    }

    setHistoryStack([]);
    setStackIndex(-1);

    // 3. Fetch latest updated notes in background
    if (activeVault) {
      refreshUpdatedNotes();
    }
  }, [vaultId, refreshUpdatedNotes]);

  // When activeFilePath changes, update opened notes and history stack
  useEffect(() => {
    if (!activeFilePath || !vaultId) return;

    // 1. Update Recent Opened Notes
    setRecentNotes((prev) => {
      const filtered = prev.filter((p) => p !== activeFilePath);
      const updated = [activeFilePath, ...filtered].slice(0, MAX_RECENTS);
      try {
        localStorage.setItem(`webapp_obsidian_recent_${vaultId}`, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save recent notes to localStorage', e);
      }
      return updated;
    });

    // 2. Update History Stack
    if (isInternalNavigationRef.current) {
      isInternalNavigationRef.current = false;
      return;
    }

    setHistoryStack((prev) => {
      // If the path is already current, do nothing
      if (prev[stackIndex] === activeFilePath) {
        return prev;
      }
      // Truncate forward history and push new path
      const nextStack = [...prev.slice(0, stackIndex + 1), activeFilePath];
      setStackIndex(nextStack.length - 1);
      return nextStack;
    });
  }, [activeFilePath, vaultId]);

  const canGoBack = stackIndex > 0;
  const canGoForward = stackIndex < historyStack.length - 1;

  const goBack = useCallback(() => {
    if (!canGoBack) return;
    const targetIndex = stackIndex - 1;
    const targetPath = historyStack[targetIndex];
    if (targetPath) {
      isInternalNavigationRef.current = true;
      setStackIndex(targetIndex);
      onNavigate(targetPath);
    }
  }, [canGoBack, stackIndex, historyStack, onNavigate]);

  const goForward = useCallback(() => {
    if (!canGoForward) return;
    const targetIndex = stackIndex + 1;
    const targetPath = historyStack[targetIndex];
    if (targetPath) {
      isInternalNavigationRef.current = true;
      setStackIndex(targetIndex);
      onNavigate(targetPath);
    }
  }, [canGoForward, stackIndex, historyStack, onNavigate]);

  return {
    recentNotes,
    recentUpdatedNotes,
    barMode,
    isRefreshingUpdated,
    toggleBarMode,
    refreshUpdatedNotes,
    recordUpdatedNote,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
  };
}

