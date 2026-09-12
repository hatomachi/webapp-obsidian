import React, { useState, useEffect, useCallback } from 'react';
import {
  GitCommit,
  X,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Bot,
  User,
  CheckSquare,
  FileCode2,
  Plus,
  Minus,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { VaultConfig, CommitHistoryItem, CommitFileDiff, CommitType } from '../../types';
import { GitHubService } from '../../services/GitHubService';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  vault: VaultConfig | null;
  filePath: string;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'たった今';

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'たった今';
    if (diffMin < 60) return `${diffMin}分前`;
    if (diffHour < 24) return `${diffHour}時間前`;
    if (diffDay === 1) return '昨日';
    if (diffDay < 7) return `${diffDay}日前`;
    return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateString;
  }
}

function renderCommitBadge(type: CommitType) {
  switch (type) {
    case 'ai':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
          <Bot className="w-3 h-3 text-purple-400" />
          <span>AI更新</span>
        </span>
      );
    case 'task_toggle':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          <CheckSquare className="w-3 h-3 text-emerald-400" />
          <span>タスク消化</span>
        </span>
      );
    case 'manual':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-700/50 text-zinc-300 border border-zinc-600/40">
          <User className="w-3 h-3 text-zinc-400" />
          <span>手動更新</span>
        </span>
      );
  }
}

interface DiffViewerProps {
  diff: CommitFileDiff;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ diff }) => {
  if (!diff.patch) {
    return (
      <div className="p-3 text-xs text-zinc-400 bg-zinc-950/60 rounded-lg border border-zinc-800">
        変更詳細はありません（バイナリまたは空の変更）
      </div>
    );
  }

  const lines = diff.patch.split('\n');

  return (
    <div className="mt-2 bg-zinc-950/90 border border-zinc-800/80 rounded-lg overflow-hidden text-[11px] font-mono leading-relaxed">
      {/* Diff Stats Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/90 border-b border-zinc-800 text-zinc-400 text-[10px]">
        <span className="truncate">{diff.filename}</span>
        <div className="flex items-center gap-2 shrink-0 font-sans">
          <span className="text-emerald-400 font-semibold flex items-center">
            <Plus className="w-3 h-3 inline" />
            {diff.additions}
          </span>
          <span className="text-rose-400 font-semibold flex items-center">
            <Minus className="w-3 h-3 inline" />
            {diff.deletions}
          </span>
        </div>
      </div>

      {/* Code diff lines */}
      <div className="overflow-x-auto p-2 max-h-72 overflow-y-auto space-y-0.5">
        {lines.map((line, idx) => {
          if (line.startsWith('@@')) {
            return (
              <div
                key={idx}
                className="text-purple-400/80 bg-purple-950/30 px-2 py-0.5 rounded text-[10px] select-none"
              >
                {line}
              </div>
            );
          }
          if (line.startsWith('+')) {
            return (
              <div
                key={idx}
                className="bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-500/80 px-2 py-0.5 break-all whitespace-pre-wrap"
              >
                {line}
              </div>
            );
          }
          if (line.startsWith('-')) {
            return (
              <div
                key={idx}
                className="bg-rose-950/40 text-rose-300 border-l-2 border-rose-500/80 px-2 py-0.5 break-all whitespace-pre-wrap"
              >
                {line}
              </div>
            );
          }
          return (
            <div key={idx} className="text-zinc-400 px-2 py-0.5 break-all whitespace-pre-wrap">
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  vault,
  filePath,
}) => {
  const [commits, setCommits] = useState<CommitHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Expanded diff state per commit sha
  const [expandedSha, setExpandedSha] = useState<string | null>(null);
  const [diffMap, setDiffMap] = useState<Record<string, CommitFileDiff>>({});
  const [loadingDiffSha, setLoadingDiffSha] = useState<string | null>(null);

  const loadCommits = useCallback(async () => {
    if (!vault || !filePath) return;
    setIsLoading(true);
    setError(null);
    try {
      const list = await GitHubService.fetchFileCommits(vault, filePath, 30);
      setCommits(list);
    } catch (err: any) {
      console.error('Failed to load file commits:', err);
      setError(err.message || '履歴の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [vault, filePath]);

  useEffect(() => {
    if (isOpen) {
      loadCommits();
      setExpandedSha(null);
    }
  }, [isOpen, loadCommits]);

  const handleToggleDiff = async (sha: string) => {
    if (expandedSha === sha) {
      setExpandedSha(null);
      return;
    }

    setExpandedSha(sha);

    // If already loaded in memory, return
    if (diffMap[sha] || !vault) {
      return;
    }

    setLoadingDiffSha(sha);
    try {
      const diff = await GitHubService.fetchCommitFileDiff(vault, sha, filePath);
      if (diff) {
        setDiffMap((prev) => ({ ...prev, [sha]: diff }));
      }
    } catch (err) {
      console.error('Failed to fetch commit diff:', err);
    } finally {
      setLoadingDiffSha(null);
    }
  };

  if (!isOpen) return null;

  const fileName = filePath.split('/').pop() || filePath;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer / BottomSheet container */}
      <aside className="relative flex flex-col w-full sm:w-[500px] max-h-[85vh] sm:max-h-full h-full bg-obsidian-sidebar border-t sm:border-t-0 sm:border-l border-obsidian-border rounded-t-2xl sm:rounded-none shadow-2xl z-10 animate-in slide-in-from-bottom sm:slide-in-from-right duration-200 safe-bottom">
        {/* Mobile handle indicator */}
        <div className="w-12 h-1.5 bg-zinc-700 rounded-full mx-auto my-2 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-obsidian-border shrink-0">
          <div className="flex items-center gap-2 truncate flex-1 mr-2">
            <div className="p-1.5 rounded-lg bg-purple-900/40 text-purple-400 border border-purple-800/40 shrink-0">
              <GitCommit className="w-4 h-4" />
            </div>
            <div className="truncate">
              <div className="font-semibold text-xs text-zinc-100 truncate">
                変更履歴: {fileName.replace(/\.md$/, '')}
              </div>
              <div className="text-[10px] text-zinc-500 font-mono truncate">
                {filePath}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={loadCommits}
              disabled={isLoading}
              title="履歴を再取得"
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-obsidian-hover active:scale-95 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-purple-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-obsidian-hover active:scale-95 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl flex items-center gap-2.5 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {isLoading && commits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <span className="text-xs">Gitコミット履歴を取得中...</span>
            </div>
          ) : commits.length === 0 ? (
            <div className="text-center py-16 text-xs text-zinc-500">
              コミット履歴が見つかりませんでした
            </div>
          ) : (
            <div className="relative pl-3 space-y-3 before:absolute before:left-5 before:top-3 before:bottom-3 before:w-0.5 before:bg-zinc-800">
              {commits.map((commit) => {
                const isExpanded = expandedSha === commit.sha;
                const currentDiff = diffMap[commit.sha];
                const isLoadingDiff = loadingDiffSha === commit.sha;

                return (
                  <div
                    key={commit.sha}
                    className="relative bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/90 rounded-xl p-3 transition-all group"
                  >
                    {/* Timeline Node Dot */}
                    <div className="absolute -left-5 top-3.5 w-2.5 h-2.5 rounded-full bg-purple-500 ring-4 ring-obsidian-sidebar" />

                    {/* Top row: badge, relative time, sha */}
                    <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        {renderCommitBadge(commit.commitType)}
                        <span
                          className="text-[11px] text-zinc-400 font-medium"
                          title={new Date(commit.authorDate).toLocaleString('ja-JP')}
                        >
                          {formatRelativeTime(commit.authorDate)}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800/60 px-1.5 py-0.5 rounded">
                        {commit.shortSha}
                      </span>
                    </div>

                    {/* Commit Message Summary */}
                    <div className="text-xs font-medium text-zinc-100 leading-snug break-words">
                      {commit.summary}
                    </div>

                    {/* Description if present */}
                    {commit.description && (
                      <div className="mt-1 text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap font-mono bg-zinc-950/40 p-2 rounded border border-zinc-800/50">
                        {commit.description}
                      </div>
                    )}

                    {/* Author & Action Footer */}
                    <div className="mt-2.5 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-400">
                      <div className="flex items-center gap-1.5 truncate mr-2">
                        {commit.authorAvatarUrl ? (
                          <img
                            src={commit.authorAvatarUrl}
                            alt=""
                            className="w-3.5 h-3.5 rounded-full shrink-0"
                          />
                        ) : (
                          <User className="w-3 h-3 text-zinc-500 shrink-0" />
                        )}
                        <span className="truncate text-zinc-300">{commit.authorName}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Diff Toggle Button */}
                        <button
                          type="button"
                          onClick={() => handleToggleDiff(commit.sha)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                            isExpanded
                              ? 'bg-purple-950/70 text-purple-300 border border-purple-800/50'
                              : 'bg-zinc-800/70 hover:bg-zinc-700 text-zinc-300'
                          }`}
                        >
                          <FileCode2 className="w-3 h-3" />
                          <span>{isExpanded ? '差分を閉じる' : '差分を見る'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3 h-3 ml-0.5" />
                          ) : (
                            <ChevronDown className="w-3 h-3 ml-0.5" />
                          )}
                        </button>

                        {/* GitHub link */}
                        <a
                          href={commit.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="GitHubでコミットを開く"
                          className="p-1 text-zinc-400 hover:text-purple-300 hover:bg-zinc-800 rounded transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>

                    {/* Expanded Diff Section */}
                    {isExpanded && (
                      <div className="mt-2 pt-2 border-t border-zinc-800/80">
                        {isLoadingDiff ? (
                          <div className="flex items-center justify-center py-4 text-zinc-500 text-xs gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                            <span>差分を読み込み中...</span>
                          </div>
                        ) : currentDiff ? (
                          <DiffViewer diff={currentDiff} />
                        ) : (
                          <div className="text-xs text-zinc-500 py-2">
                            差分情報を取得できませんでした
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
