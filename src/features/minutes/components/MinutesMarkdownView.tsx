import React, { useState, useRef, useEffect } from 'react';
import {
  Edit3,
  Save,
  X,
  Clock,
  Loader2,
  CheckCircle2,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { MarkdownViewer } from '../../../components/MarkdownViewer/MarkdownViewer';
import { formatSeconds } from '../minutesParser';

interface MinutesMarkdownViewProps {
  minutesText: string;
  minutesPath?: string;
  minutesLoading: boolean;
  isSaving: boolean;
  currentTime: number;
  allFilePaths: string[];
  onSeek?: (seconds: number) => void;
  onSaveMinutes: (newText: string) => Promise<boolean>;
  onNavigateFile: (path: string, heading?: string) => void;
}

export const MinutesMarkdownView: React.FC<MinutesMarkdownViewProps> = ({
  minutesText,
  minutesPath,
  minutesLoading,
  isSaving,
  currentTime,
  allFilePaths,
  onSaveMinutes,
  onNavigateFile,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(minutesText);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync editText when minutesText changes from outside (e.g. reload or switch meeting)
  useEffect(() => {
    setEditText(minutesText);
    setIsEditing(false);
  }, [minutesText, minutesPath]);

  // Insert current playback timestamp into textarea at cursor position
  const handleInsertCurrentTimestamp = () => {
    if (!textareaRef.current) return;
    const tsStr = `[${formatSeconds(currentTime)}] `;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const currentVal = editText;

    const nextVal = currentVal.substring(0, start) + tsStr + currentVal.substring(end);
    setEditText(nextVal);

    // Set cursor position after the inserted timestamp
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = start + tsStr.length;
        textareaRef.current.selectionEnd = start + tsStr.length;
      }
    }, 10);
  };

  const handleSave = async () => {
    setSaveError(null);
    const success = await onSaveMinutes(editText);
    if (success) {
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsEditing(false);
      }, 700);
    } else {
      setSaveError('Gitへのコミット・保存に失敗しました');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  // Pre-process markdown to render timestamp clicks if desired
  // We can enhance timestamps like `[05:12]` or `(05:12)` or `05:12`
  // Since MarkdownViewer handles markdown, let's make sure it displays cleanly

  if (minutesLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-zinc-500">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-purple-400" />
        <p className="text-sm font-medium">議事録ファイルを読み込み中...</p>
      </div>
    );
  }

  if (!minutesPath && !minutesText) {
    return (
      <div className="py-16 text-center text-zinc-500 bg-zinc-900/40 rounded-2xl border border-zinc-800/60 p-8">
        <FileText className="w-10 h-10 mx-auto mb-3 text-zinc-600 opacity-60" />
        <p className="text-sm font-medium text-zinc-400">議事録Markdownファイルがありません</p>
        <p className="text-xs text-zinc-600 mt-1 mb-4">
          会議フォルダ内に minutes.md または 議事録.md を配置してください
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Top Header / Actions */}
      <div className="flex items-center justify-between px-1 py-1 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-400 font-mono">
            📝 {minutesPath ? minutesPath.split('/').pop() : 'minutes.md'}
          </span>
          {saveSuccess && (
            <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>保存完了</span>
            </span>
          )}
          {saveError && (
            <span className="flex items-center gap-1 text-xs text-rose-400 font-medium animate-in fade-in">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{saveError}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              {/* Insert Timestamp button */}
              <button
                type="button"
                onClick={handleInsertCurrentTimestamp}
                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-purple-300 text-xs font-medium flex items-center gap-1 border border-purple-900/40 transition-colors"
                title="現在再生位置のタイムスタンプをカーソル位置に挿入"
              >
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span>+ [{formatSeconds(currentTime)}]</span>
              </button>

              {/* Cancel button */}
              <button
                type="button"
                onClick={() => {
                  setEditText(minutesText);
                  setIsEditing(false);
                }}
                disabled={isSaving}
                className="px-2.5 py-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg text-xs font-medium transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Save button */}
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-3.5 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow transition-all"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{isSaving ? 'コミット中...' : '保存'}</span>
              </button>
            </>
          ) : (
            /* Switch to Edit Mode */
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="px-3 py-1 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1.5 border border-zinc-700/50 shadow-sm transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-purple-400" />
              <span>議事録を編集</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isEditing ? (
          /* Editor Mode */
          <div className="h-full flex flex-col min-h-[400px]">
            <textarea
              ref={textareaRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="議事録のMarkdown内容を入力... (Ctrl+Enter で保存)"
              className="w-full h-full flex-1 p-4 bg-[#111114] border border-zinc-800 rounded-xl text-sm font-mono text-zinc-100 placeholder-zinc-600 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/80 transition-all custom-scrollbar"
            />
            <div className="mt-2 text-right text-[11px] text-zinc-500">
              Ctrl+Enter (Cmd+Enter) でGitへ自動コミット保存
            </div>
          </div>
        ) : (
          /* Viewer Mode */
          <div className="bg-[#141418]/60 border border-zinc-800/60 rounded-2xl p-4 sm:p-6 shadow-md select-text">
            <MarkdownViewer
              content={minutesText}
              filePath={minutesPath || 'minutes.md'}
              allFilePaths={allFilePaths}
              onNavigateFile={onNavigateFile}
            />
          </div>
        )}
      </div>
    </div>
  );
};
