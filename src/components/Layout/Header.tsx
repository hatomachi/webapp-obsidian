import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  ListTree,
  Search,
  Settings,
  Edit3,
  ChevronDown,
  Check,
  Plus,
  RefreshCw,
  Languages,
  Bot,
} from 'lucide-react';
import { VaultConfig, TextEncoding } from '../../types';

interface HeaderProps {
  vaults: VaultConfig[];
  activeVault: VaultConfig | null;
  currentTitle: string;
  onSelectVault: (vaultId: string) => void;
  onOpenSidebar: () => void;
  onOpenTOC: () => void;
  onOpenQuickSwitcher: () => void;
  onOpenEditModal: () => void;
  onOpenSettings: () => void;
  onOpenAiChat?: () => void;
  isAiChatOpen?: boolean;
  onRefresh: () => void;
  isRefreshing?: boolean;
  isSidebarOpen?: boolean;
  currentEncoding?: TextEncoding;
  onChangeEncoding?: (encoding: TextEncoding) => void;
  showEncodingSelector?: boolean;
}

const ENCODING_OPTIONS: { label: string; value: TextEncoding; short: string }[] = [
  { label: 'UTF-8', value: 'utf-8', short: 'UTF-8' },
  { label: 'Shift_JIS (SJIS/CP932)', value: 'shift_jis', short: 'SJIS' },
  { label: 'EUC-JP', value: 'euc-jp', short: 'EUC' },
  { label: 'ISO-2022-JP (JIS)', value: 'iso-2022-jp', short: 'JIS' },
];

export const Header: React.FC<HeaderProps> = ({
  vaults,
  activeVault,
  currentTitle,
  onSelectVault,
  onOpenSidebar,
  onOpenTOC,
  onOpenQuickSwitcher,
  onOpenEditModal,
  onOpenSettings,
  onOpenAiChat,
  isAiChatOpen = false,
  onRefresh,
  isRefreshing = false,
  isSidebarOpen = false,
  currentEncoding = 'utf-8',
  onChangeEncoding,
  showEncodingSelector = false,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [encodingDropdownOpen, setEncodingDropdownOpen] = useState(false);
  const encodingDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (encodingDropdownRef.current && !encodingDropdownRef.current.contains(e.target as Node)) {
        setEncodingDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-3 bg-obsidian-sidebar/95 backdrop-blur-md border-b border-obsidian-border select-none safe-top">
      {/* Left: Sidebar toggle button */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Toggle file tree"
          title={isSidebarOpen ? 'サイドバーを閉じる' : 'サイドバーを開く'}
          className={`p-2 rounded-lg transition-all active:scale-95 ${
            isSidebarOpen
              ? 'text-purple-300 bg-purple-950/40 border border-purple-800/50'
              : 'text-zinc-300 hover:text-white hover:bg-obsidian-hover'
          }`}
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Vault selector dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 border border-zinc-700/60 max-w-[140px] sm:max-w-[200px] truncate"
          >
            <span className="truncate">{activeVault ? activeVault.name : 'Vault未設定'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 mt-1.5 w-56 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                Vault 切り替え
              </div>
              <div className="max-h-60 overflow-y-auto py-1">
                {vaults.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      onSelectVault(v.id);
                      setDropdownOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-zinc-800 transition-colors"
                  >
                    <div className="truncate">
                      <div className="font-medium text-zinc-200 truncate">{v.name}</div>
                      <div className="text-[10px] text-zinc-500 truncate">
                        {v.owner}/{v.repo}
                      </div>
                    </div>
                    {activeVault?.id === v.id && (
                      <Check className="w-3.5 h-3.5 text-purple-400 shrink-0 ml-2" />
                    )}
                  </button>
                ))}
              </div>
              <div className="border-t border-zinc-800 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-purple-400 hover:bg-zinc-800 transition-colors font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Vaultを追加 / 管理</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Center: Current file title (mobile truncate) */}
      <div className="flex-1 mx-2 text-center truncate hidden xs:block">
        <span className="text-xs sm:text-sm font-semibold text-zinc-300 truncate">
          {currentTitle || 'ノートを選択'}
        </span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        {/* Encoding selector dropdown */}
        {showEncodingSelector && onChangeEncoding && (
          <div className="relative" ref={encodingDropdownRef}>
            <button
              type="button"
              onClick={() => setEncodingDropdownOpen(!encodingDropdownOpen)}
              title={`文字コード: ${currentEncoding.toUpperCase()} (文字化け時に変更)`}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 active:scale-95 transition-all"
            >
              <Languages className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span className="font-mono text-[11px] uppercase">
                {ENCODING_OPTIONS.find((o) => o.value === currentEncoding)?.short || 'UTF-8'}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
            </button>

            {encodingDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-52 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                  日本語文字コード変更
                </div>
                <div className="py-1">
                  {ENCODING_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onChangeEncoding(opt.value);
                        setEncodingDropdownOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-left hover:bg-zinc-800 transition-colors text-zinc-200"
                    >
                      <span>{opt.label}</span>
                      {currentEncoding === opt.value && (
                        <Check className="w-3.5 h-3.5 text-purple-400 shrink-0 ml-2" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {/* Refresh button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refresh from GitHub"
          title="最新の変更を取得"
          className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-obsidian-hover active:scale-95 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-purple-400' : ''}`} />
        </button>

        {/* Quick Switcher (Search) */}
        <button
          type="button"
          onClick={onOpenQuickSwitcher}
          aria-label="Quick Switcher"
          title="ファイル検索 (Quick Switcher)"
          className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-obsidian-hover active:scale-95 transition-all"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* TOC Drawer */}
        <button
          type="button"
          onClick={onOpenTOC}
          aria-label="Table of Contents"
          title="目次 (TOC)"
          className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-obsidian-hover active:scale-95 transition-all"
        >
          <ListTree className="w-4 h-4" />
        </button>

        {/* AI Remote Chat */}
        {onOpenAiChat && (
          <button
            type="button"
            onClick={onOpenAiChat}
            aria-label="AI Remote Chat"
            title="AI壁打ち (Claude / Copilot)"
            className={`p-2 rounded-lg transition-all active:scale-95 ${
              isAiChatOpen
                ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 shadow-sm'
                : 'text-zinc-300 hover:text-white hover:bg-obsidian-hover'
            }`}
          >
            <Bot className="w-4 h-4" />
          </button>
        )}

        {/* Edit Note */}
        <button
          type="button"
          onClick={onOpenEditModal}
          aria-label="Edit Note"
          title="編集"
          className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-obsidian-hover active:scale-95 transition-all"
        >
          <Edit3 className="w-4 h-4" />
        </button>

        {/* Settings */}
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="設定"
          className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-obsidian-hover active:scale-95 transition-all"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
