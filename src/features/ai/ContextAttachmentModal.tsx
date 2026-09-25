import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Copy, Check, Search, AlertCircle } from 'lucide-react';
import { ContextAttachment } from './aiRemoteTypes';

interface Props {
  isOpen: boolean;
  attachment: ContextAttachment | null;
  onClose: () => void;
}

export const ContextAttachmentModal: React.FC<Props> = ({
  isOpen,
  attachment,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset states on open/attachment change
  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setSearchQuery('');
    }
  }, [isOpen, attachment?.id]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const rawContent = attachment?.contentMarkdown || '';

  // Stats
  const stats = useMemo(() => {
    const chars = rawContent.length;
    const lines = rawContent ? rawContent.split('\n').length : 0;
    // Rough token estimation for Japanese / mixed text (~3 characters per token)
    const estimatedTokens = Math.ceil(chars / 3);
    return { chars, lines, estimatedTokens };
  }, [rawContent]);

  // Search match count
  const matchCount = useMemo(() => {
    if (!searchQuery.trim() || !rawContent) return 0;
    const q = searchQuery.toLowerCase();
    let count = 0;
    let pos = 0;
    const lower = rawContent.toLowerCase();
    while ((pos = lower.indexOf(q, pos)) !== -1) {
      count++;
      pos += q.length;
    }
    return count;
  }, [rawContent, searchQuery]);

  const handleCopy = async () => {
    if (!rawContent) return;
    try {
      await navigator.clipboard.writeText(rawContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  if (!isOpen || !attachment) return null;

  // Render content with search highlight
  const renderHighlightedContent = () => {
    if (!searchQuery.trim()) {
      return (
        <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-zinc-300 select-text">
          {rawContent}
        </pre>
      );
    }

    const q = searchQuery.toLowerCase();
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const lower = rawContent.toLowerCase();
    let idx = lower.indexOf(q, lastIndex);
    let key = 0;

    while (idx !== -1) {
      if (idx > lastIndex) {
        parts.push(rawContent.slice(lastIndex, idx));
      }
      parts.push(
        <mark
          key={key++}
          className="bg-amber-400 text-zinc-950 font-bold px-0.5 rounded"
        >
          {rawContent.slice(idx, idx + q.length)}
        </mark>
      );
      lastIndex = idx + q.length;
      idx = lower.indexOf(q, lastIndex);
    }

    if (lastIndex < rawContent.length) {
      parts.push(rawContent.slice(lastIndex));
    }

    return (
      <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-zinc-300 select-text">
        {parts}
      </pre>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-zinc-800/90 bg-zinc-900/80 flex items-center justify-between shrink-0">
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center space-x-2">
              <span className="text-base">📎</span>
              <h3 className="font-bold text-sm sm:text-base text-zinc-100 truncate">
                {attachment.title}
              </h3>
              {attachment.badge && (
                <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/70 px-1.5 py-0.5 rounded font-mono shrink-0">
                  {attachment.badge}
                </span>
              )}
            </div>
            {attachment.subtitle && (
              <p className="text-[11px] text-zinc-400 truncate mt-0.5 font-mono">
                {attachment.subtitle}
              </p>
            )}
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700/80 transition-colors"
              title="添付Markdownをクリップボードにコピー"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">コピー完了</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  <span>コピー</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
              title="閉じる (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar: Stats and Search */}
        <div className="px-3.5 py-2 border-b border-zinc-800 bg-zinc-900/40 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
          <div className="flex items-center space-x-3 text-zinc-400 text-[11px]">
            <span>
              規模: <strong className="text-zinc-200">{stats.lines.toLocaleString()}</strong> 行 / <strong className="text-zinc-200">{stats.chars.toLocaleString()}</strong> 文字
            </span>
            <span className="text-zinc-600">|</span>
            <span>
              推定消費: 約 <strong className="text-emerald-400 font-mono">{stats.estimatedTokens.toLocaleString()}</strong> tokens
            </span>
          </div>

          <div className="relative flex-1 sm:flex-initial sm:min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="本文内をインクリメンタル検索..."
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg pl-8 pr-14 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
            {searchQuery && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 bg-zinc-800 px-1 rounded">
                {matchCount}件
              </span>
            )}
          </div>
        </div>

        {/* Content Preview Body */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto p-4 bg-zinc-950/90 text-zinc-300 select-text"
        >
          {rawContent ? (
            renderHighlightedContent()
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500 text-xs space-y-2">
              <AlertCircle className="w-6 h-6 text-zinc-600" />
              <span>添付データが空です</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-[11px] text-zinc-500 shrink-0">
          <span>このテキストがAI（Claude / Copilot）へプロンプトの先頭コンテキストとして注入されます</span>
          <button
            type="button"
            onClick={onClose}
            className="hover:text-zinc-300 underline"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
