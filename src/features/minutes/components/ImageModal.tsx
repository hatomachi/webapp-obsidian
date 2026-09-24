import React from 'react';
import { X, Play, Clock } from 'lucide-react';
import { MeetingScreenshot } from '../types';

interface ImageModalProps {
  screenshot: MeetingScreenshot | null;
  onClose: () => void;
  onSeek: (seconds: number) => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({
  screenshot,
  onClose,
  onSeek,
}) => {
  if (!screenshot) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md transition-opacity animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl w-full max-h-[92vh] flex flex-col bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/80 border-b border-zinc-700/60 select-none">
          <div className="flex items-center gap-2 truncate">
            <span className="px-2 py-0.5 rounded bg-purple-900/60 text-purple-300 font-mono text-xs font-semibold flex items-center gap-1 border border-purple-700/50">
              <Clock className="w-3 h-3" />
              {screenshot.formattedTime}
            </span>
            <span className="text-xs sm:text-sm font-medium text-zinc-200 truncate">
              {screenshot.fileName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Jump to this timestamp button */}
            <button
              type="button"
              onClick={() => {
                onSeek(screenshot.seconds);
                onClose();
              }}
              className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>この位置から再生</span>
            </button>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Image Display */}
        <div className="flex-1 overflow-auto p-2 sm:p-4 flex items-center justify-center bg-[#09090b]">
          {screenshot.blobUrl ? (
            <img
              src={screenshot.blobUrl}
              alt={screenshot.fileName}
              className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-lg select-none"
            />
          ) : (
            <div className="py-20 text-center text-zinc-500 text-sm">
              画像を読み込み中...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
