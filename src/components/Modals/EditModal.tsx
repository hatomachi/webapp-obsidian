import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, AlertCircle } from 'lucide-react';

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string;
  initialContent: string;
  onSave: (newContent: string, commitMessage?: string) => Promise<void>;
}

export const EditModal: React.FC<EditModalProps> = ({
  isOpen,
  onClose,
  filePath,
  initialContent,
  onSave,
}) => {
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContent(initialContent);
    setError(null);
  }, [initialContent, isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(content);
      onClose();
    } catch (e: any) {
      setError(e.message || '保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const fileName = filePath.split('/').pop() || filePath;
  const lineCount = content.split('\n').length;
  const charCount = content.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={() => {
          if (!isSaving) onClose();
        }}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-4xl h-[92vh] flex flex-col bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/40">
          <div className="truncate mr-2">
            <span className="text-xs text-purple-400 font-semibold uppercase tracking-wider block">
              編集中
            </span>
            <span className="text-sm font-bold text-zinc-100 truncate block">{fileName}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow transition-colors"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>コミット中...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>保存＆コミット</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="px-4 py-2 bg-rose-950/40 border-b border-rose-800 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Textarea Editor */}
        <div className="flex-1 p-3 bg-[#131315]">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isSaving}
            className="w-full h-full bg-transparent text-zinc-200 font-mono text-sm leading-relaxed p-2 resize-none focus:outline-none focus:ring-0 placeholder-zinc-600"
            placeholder="Markdownを入力..."
            autoFocus
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-950/80 border-t border-zinc-800 text-[11px] text-zinc-500">
          <span>
            {lineCount} 行 / {charCount} 文字
          </span>
          <span className="truncate max-w-[200px] sm:max-w-md">{filePath}</span>
        </div>
      </div>
    </div>
  );
};
