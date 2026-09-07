import { useState, useEffect, useRef, useCallback } from 'react';

const MAX_RECENTS = 8;

export function useNoteHistory(
  vaultId: string | null,
  activeFilePath: string,
  onNavigate: (path: string) => void
) {
  // Navigation stack for Back / Forward
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [stackIndex, setStackIndex] = useState<number>(-1);
  const isInternalNavigationRef = useRef<boolean>(false);

  // Recent notes list (persisted in localStorage per vault)
  const [recentNotes, setRecentNotes] = useState<string[]>([]);

  // Load recent notes when vault changes
  useEffect(() => {
    if (!vaultId) {
      setRecentNotes([]);
      setHistoryStack([]);
      setStackIndex(-1);
      return;
    }
    const key = `webapp_obsidian_recent_${vaultId}`;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        setRecentNotes(JSON.parse(saved));
      } else {
        setRecentNotes([]);
      }
    } catch {
      setRecentNotes([]);
    }
    setHistoryStack([]);
    setStackIndex(-1);
  }, [vaultId]);

  // When activeFilePath changes
  useEffect(() => {
    if (!activeFilePath || !vaultId) return;

    // 1. Update Recent Notes
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

    // 2. Update History Stack (if not navigated via goBack/goForward)
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
    canGoBack,
    canGoForward,
    goBack,
    goForward,
  };
}
