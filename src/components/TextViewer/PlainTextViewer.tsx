import React, { useState, useMemo } from 'react';
import { Copy, Check, WrapText, AlignLeft, FileText } from 'lucide-react';

interface PlainTextViewerProps {
  content: string;
  filePath: string;
  encoding?: string;
}

export const PlainTextViewer: React.FC<PlainTextViewerProps> = ({
  content,
  filePath,
  encoding = 'UTF-8',
}) => {
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(true);
  const [showLineNumbers, setShowLineNumbers] = useState(true);

  const lines = useMemo(() => content.split('\n'), [content]);
  const fileName = filePath.split('/').pop() || filePath;
  const fileExt = fileName.includes('.') ? fileName.split('.').pop()?.toUpperCase() : 'TEXT';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-4 px-2 sm:px-6 select-text">
      {/* File info and toolbar header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-zinc-900/90 border border-zinc-800 rounded-t-xl text-xs text-zinc-400 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="font-semibold text-zinc-200 truncate">{fileName}</span>
          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400 font-mono">
            {fileExt}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-purple-950/40 text-[10px] text-purple-300 font-mono uppercase border border-purple-800/40">
            {encoding}
          </span>
          <span className="text-[11px] text-zinc-500 hidden sm:inline">
            {lines.length} 行 · {content.length.toLocaleString()} 文字
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Line numbers toggle */}
          <button
            type="button"
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            className={`p-1.5 rounded transition-colors ${
              showLineNumbers
                ? 'text-purple-400 bg-purple-950/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
            title={showLineNumbers ? '行番号を非表示' : '行番号を表示'}
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>

          {/* Wrap toggle */}
          <button
            type="button"
            onClick={() => setWrapLines(!wrapLines)}
            className={`p-1.5 rounded transition-colors ${
              wrapLines
                ? 'text-purple-400 bg-purple-950/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
            title={wrapLines ? '折り返しを無効化（横スクロール）' : '折り返しを有効化'}
          >
            <WrapText className="w-3.5 h-3.5" />
          </button>

          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 hover:text-white transition-colors text-[11px] font-medium ml-1"
            title="ファイル全体をコピー"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-semibold">コピー完了</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-zinc-400" />
                <span>コピー</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code / Text container */}
      <div className="border-x border-b border-zinc-800 rounded-b-xl bg-[#121214] overflow-x-auto shadow-sm">
        <div className="p-3 sm:p-4 font-mono text-xs sm:text-sm leading-relaxed text-zinc-300 min-w-full inline-block">
          {lines.map((line, idx) => (
            <div
              key={idx}
              className={`flex hover:bg-zinc-800/30 transition-colors ${
                wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
              }`}
            >
              {showLineNumbers && (
                <span className="select-none w-10 sm:w-12 shrink-0 text-right pr-3 sm:pr-4 text-zinc-600 text-xs select-none">
                  {idx + 1}
                </span>
              )}
              <span className="flex-1 min-w-0">{line || '\n'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
