import React, { useEffect, useState, useRef } from 'react';
import { Code2, Eye, AlertCircle, Loader2, Copy, Check } from 'lucide-react';

interface MermaidBlockProps {
  code: string;
}

export const MermaidBlock: React.FC<MermaidBlockProps> = ({ code }) => {
  const [svg, setSvg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  // Counter to ensure fresh unique DOM ID per render
  const renderCountRef = useRef(0);

  useEffect(() => {
    let isCancelled = false;
    const cleanCode = code.trim();

    if (!cleanCode) {
      setIsLoading(false);
      setSvg(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    renderCountRef.current += 1;
    const uniqueId = `mermaid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}-${renderCountRef.current}`;

    const renderDiagram = async () => {
      try {
        // Dynamic import so mermaid is only loaded on demand
        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default;

        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            darkMode: true,
            background: '#18181b',
            primaryColor: '#6d28d9',
            primaryTextColor: '#f4f4f5',
            primaryBorderColor: '#8b5cf6',
            lineColor: '#a1a1aa',
            secondaryColor: '#27272a',
            tertiaryColor: '#09090b',
          },
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          securityLevel: 'loose',
        });

        const { svg: renderedSvg } = await mermaid.render(uniqueId, cleanCode);

        if (!isCancelled) {
          setSvg(renderedSvg);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error('Mermaid render error:', err);
          setError(err?.message || 'Mermaidのレンダリングに失敗しました');
          setIsLoading(false);
        }
      }
    };

    renderDiagram();

    return () => {
      isCancelled = true;
    };
  }, [code]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="my-4 rounded-xl border border-zinc-800 bg-[#121214] overflow-hidden shadow-sm">
      {/* Header Bar */}
      <div className="bg-zinc-800/50 px-3.5 py-1.5 text-xs text-zinc-400 font-mono border-b border-zinc-800/80 flex justify-between items-center select-none">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-purple-500/80 animate-pulse" />
          <span className="font-medium text-zinc-300">mermaid diagram</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopyCode}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60 transition-colors text-[11px]"
            title="コードをコピー"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">コピー完了</span>
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
            onClick={() => setShowCode(!showCode)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60 transition-colors text-[11px]"
            title={showCode ? 'ダイアグラムを表示' : 'ソースコードを表示'}
          >
            {showCode ? (
              <>
                <Eye className="w-3.5 h-3.5 text-purple-400" />
                <span>図を表示</span>
              </>
            ) : (
              <>
                <Code2 className="w-3.5 h-3.5 text-zinc-400" />
                <span>コード表示</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {showCode ? (
        <pre className="p-4 text-xs sm:text-sm font-mono text-zinc-300 overflow-x-auto bg-black/30">
          <code>{code}</code>
        </pre>
      ) : (
        <div className="p-3 sm:p-5 overflow-x-auto">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-zinc-400 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              <span>ダイアグラムを描画中...</span>
            </div>
          )}

          {error && (
            <div className="py-3 px-4 bg-red-950/30 border border-red-800/50 rounded-lg text-red-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Mermaid レンダリングエラー</p>
                <p className="opacity-80 font-mono text-[11px]">{error}</p>
                <button
                  type="button"
                  onClick={() => setShowCode(true)}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-purple-300 hover:underline"
                >
                  <Code2 className="w-3 h-3" />
                  コードを確認する
                </button>
              </div>
            </div>
          )}

          {!isLoading && !error && svg && (
            <div
              className="mermaid-svg-container flex justify-center overflow-x-auto [&>svg]:max-w-none [&>svg]:h-auto"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
        </div>
      )}
    </div>
  );
};
