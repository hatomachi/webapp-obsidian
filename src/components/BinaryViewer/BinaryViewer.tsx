import React from 'react';
import { Download, File, Image as ImageIcon, FileArchive, FileText } from 'lucide-react';
import { isImageExtension, downloadBase64File, formatFileSize, getMimeType } from '../../utils/encoding';

interface BinaryViewerProps {
  filePath: string;
  rawBase64?: string;
  size?: number;
}

export const BinaryViewer: React.FC<BinaryViewerProps> = ({
  filePath,
  rawBase64,
  size,
}) => {
  const fileName = filePath.split('/').pop() || filePath;
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : '';
  const isImage = isImageExtension(filePath);
  const mimeType = getMimeType(filePath);

  const handleDownload = () => {
    if (!rawBase64) return;
    downloadBase64File(rawBase64, fileName, mimeType);
  };

  const renderIcon = () => {
    if (isImage) return <ImageIcon className="w-12 h-12 text-purple-400" />;
    if (['zip', 'tar', 'gz', 'bz2', '7z', 'rar'].includes(ext)) {
      return <FileArchive className="w-12 h-12 text-amber-400" />;
    }
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
      return <FileText className="w-12 h-12 text-blue-400" />;
    }
    return <File className="w-12 h-12 text-zinc-400" />;
  };

  const imageDataUrl = isImage && rawBase64 ? `data:${mimeType};base64,${rawBase64}` : null;

  return (
    <div className="w-full max-w-4xl mx-auto py-8 px-4 sm:px-6">
      <div className="flex flex-col items-center justify-center p-6 sm:p-10 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl text-center shadow-lg backdrop-blur-sm">
        {/* If Image, show image preview */}
        {isImage && imageDataUrl ? (
          <div className="w-full flex flex-col items-center mb-6">
            <div className="max-w-full max-h-[70vh] overflow-hidden rounded-xl border border-zinc-800 bg-[#0d0d10] p-2 flex items-center justify-center shadow-md">
              <img
                src={imageDataUrl}
                alt={fileName}
                className="max-w-full max-h-[65vh] object-contain rounded-lg select-none"
              />
            </div>
            <div className="mt-3 text-xs text-zinc-400 font-medium">
              {fileName} {size !== undefined && `(${formatFileSize(size)})`}
            </div>
          </div>
        ) : (
          /* Non-image binary icon and explanation */
          <div className="flex flex-col items-center mb-6">
            <div className="p-4 rounded-2xl bg-zinc-800/60 border border-zinc-700/50 mb-4 shadow-inner">
              {renderIcon()}
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-200 mb-1 max-w-md break-all">
              {fileName}
            </h2>
            <div className="flex items-center gap-2 text-xs text-zinc-400 mb-3">
              <span className="px-2 py-0.5 rounded bg-zinc-800 font-mono uppercase">
                {ext || 'BINARY'}
              </span>
              {size !== undefined && <span>{formatFileSize(size)}</span>}
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-sm leading-relaxed">
              このファイルはテキスト形式ではないため、プレビューできません。端末にダウンロードして開いてください。
            </p>
          </div>
        )}

        {/* Download Action Button */}
        <button
          type="button"
          onClick={handleDownload}
          disabled={!rawBase64}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white rounded-xl text-sm font-semibold shadow-lg shadow-purple-900/30 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
        >
          <Download className="w-4 h-4" />
          <span>ファイルをダウンロード</span>
        </button>
      </div>
    </div>
  );
};
