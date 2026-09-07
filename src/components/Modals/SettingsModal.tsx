import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Plug,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  FolderSync,
} from 'lucide-react';
import { VaultConfig, UIPreferences } from '../../types';
import { GitHubService } from '../../services/GitHubService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vaults: VaultConfig[];
  activeVaultId: string | null;
  onSaveVault: (vault: VaultConfig) => void;
  onAddVault: (vault: Omit<VaultConfig, 'id'>) => void;
  onDeleteVault: (id: string) => void;
  onSelectVault: (id: string) => void;
  onClearCache: (owner: string, repo: string) => void;
  uiPrefs: UIPreferences;
  onUpdateUIPrefs: (prefs: UIPreferences) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  vaults,
  activeVaultId,
  onSaveVault,
  onAddVault,
  onDeleteVault,
  onSelectVault,
  onClearCache,
  uiPrefs,
  onUpdateUIPrefs,
}) => {
  const [isAdding, setIsAdding] = useState(vaults.length === 0);
  const [editingVaultId, setEditingVaultId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState('');

  // Test connection state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const startAdding = () => {
    setIsAdding(true);
    setEditingVaultId(null);
    setName('');
    setOwner('');
    setRepo('');
    setBranch('main');
    setToken('');
    setTestResult(null);
  };

  const startEditing = (vault: VaultConfig) => {
    setEditingVaultId(vault.id);
    setIsAdding(false);
    setName(vault.name);
    setOwner(vault.owner);
    setRepo(vault.repo);
    setBranch(vault.branch);
    setToken(vault.token);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!token || !owner || !repo) {
      setTestResult({ success: false, message: 'Owner、Repo、Tokenを入力してください。' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const tempVault: VaultConfig = {
      id: 'test',
      name: name || 'Test',
      owner,
      repo,
      branch: branch || 'main',
      token,
    };

    const res = await GitHubService.testConnection(tempVault);
    setIsTesting(false);
    setTestResult(res);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !owner || !repo || !token) {
      alert('すべての必須項目を入力してください。');
      return;
    }

    if (editingVaultId) {
      onSaveVault({
        id: editingVaultId,
        name,
        owner,
        repo,
        branch: branch || 'main',
        token,
      });
      setEditingVaultId(null);
    } else {
      onAddVault({
        name,
        owner,
        repo,
        branch: branch || 'main',
        token,
      });
      setIsAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/40">
          <div className="flex items-center gap-2">
            <FolderSync className="w-5 h-5 text-purple-400" />
            <h2 className="font-bold text-base text-zinc-100">Vault & GitHub 設定</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Security Banner */}
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-purple-950/30 border border-purple-800/40 text-xs text-purple-200">
            <ShieldCheck className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold block mb-0.5">高セキュリティ＆プライベート設計</span>
              GitHub PAT はこの端末のブラウザ（LocalStorage）にのみ保存され、外部サーバーやCloudflareには一切送信されません。スマホとGitHubが直接暗号化通信を行います。
            </div>
          </div>

          {/* Vault List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                登録済み Vault 一覧 ({vaults.length})
              </h3>
              {!isAdding && !editingVaultId && (
                <button
                  type="button"
                  onClick={startAdding}
                  className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 font-medium py-1 px-2 rounded hover:bg-purple-950/40 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Vaultを追加</span>
                </button>
              )}
            </div>

            <div className="space-y-2">
              {vaults.map((v) => {
                const isActive = v.id === activeVaultId;
                return (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                      isActive
                        ? 'border-purple-500/60 bg-purple-950/20 shadow-sm'
                        : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
                    }`}
                  >
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => onSelectVault(v.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-zinc-100 truncate">{v.name}</span>
                        {isActive && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-600/30 text-purple-300 font-medium border border-purple-500/40">
                            選択中
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-400 truncate mt-0.5">
                        {v.owner}/{v.repo} <span className="text-zinc-600">•</span> {v.branch}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 ml-3">
                      <button
                        type="button"
                        onClick={() => startEditing(v)}
                        className="px-2.5 py-1 text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Vault "${v.name}" を削除しますか？`)) {
                            onDeleteVault(v.id);
                          }
                        }}
                        className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add / Edit Form */}
          {(isAdding || editingVaultId) && (
            <form onSubmit={handleSaveForm} className="p-4 rounded-xl border border-zinc-700 bg-zinc-950/70 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <span className="text-xs font-semibold text-zinc-200">
                  {editingVaultId ? 'Vault を編集' : '新しい Vault を追加'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingVaultId(null);
                  }}
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                >
                  キャンセル
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Vault 表示名 *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例: ジブリパーク旅行計画 / 個人タスク"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">GitHub Owner *</label>
                    <input
                      type="text"
                      required
                      value={owner}
                      onChange={(e) => setOwner(e.target.value)}
                      placeholder="例: hatomachi"
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">Repo 名 *</label>
                    <input
                      type="text"
                      required
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                      placeholder="例: 202609_ghibli-park"
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Branch</label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="main"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-zinc-300 font-medium">GitHub Personal Access Token (PAT) *</label>
                    <span className="text-[11px] text-zinc-500">Fine-grained PAT 推奨</span>
                  </div>
                  <input
                    type="password"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="github_pat_..."
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 font-mono text-xs focus:outline-none focus:border-purple-500"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    リポジトリの「Contents: Read and write」権限が必要です。
                  </p>
                </div>
              </div>

              {/* Connection Test Result */}
              {testResult && (
                <div
                  className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
                    testResult.success
                      ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/40 border border-rose-800 text-rose-300'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  )}
                  <span className="truncate">{testResult.message}</span>
                </div>
              )}

              {/* Form Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
                >
                  {isTesting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plug className="w-3.5 h-3.5" />
                  )}
                  <span>接続テスト</span>
                </button>

                <button
                  type="submit"
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow transition-colors"
                >
                  {editingVaultId ? '更新して保存' : 'Vaultを追加'}
                </button>
              </div>
            </form>
          )}

          {/* UI Preferences (Feature Toggles) */}
          <div className="pt-4 border-t border-zinc-800">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2.5">
              ✨ ファイル移動・UI表示設定（お好みでON/OFF）
            </h3>
            <p className="text-xs text-zinc-500 mb-3">
              使い勝手を自由にカスタマイズできます。不要な機能はいつでもOFFにして元のシンプルな表示に戻せます。
            </p>

            <div className="space-y-2.5">
              {/* Desktop Sidebar */}
              <label className="flex items-start gap-3 p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={uiPrefs.enableDesktopSidebar}
                  onChange={(e) =>
                    onUpdateUIPrefs({ ...uiPrefs, enableDesktopSidebar: e.target.checked })
                  }
                  className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 focus:ring-offset-zinc-900 border-zinc-700 bg-zinc-800"
                />
                <div className="flex-1 text-xs">
                  <span className="font-semibold text-zinc-200 block">PC 2ペイン常設表示</span>
                  <span className="text-zinc-400 leading-relaxed">
                    PC画面（幅768px以上）でファイルツリーを左側に常時表示します。ヘッダーのボタンで開閉も可能です。
                  </span>
                </div>
              </label>

              {/* Breadcrumbs */}
              <label className="flex items-start gap-3 p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={uiPrefs.enableBreadcrumbs}
                  onChange={(e) =>
                    onUpdateUIPrefs({ ...uiPrefs, enableBreadcrumbs: e.target.checked })
                  }
                  className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 focus:ring-offset-zinc-900 border-zinc-700 bg-zinc-800"
                />
                <div className="flex-1 text-xs">
                  <span className="font-semibold text-zinc-200 block">パンくずリスト & 同フォルダシート</span>
                  <span className="text-zinc-400 leading-relaxed">
                    現在のフォルダ階層を表示します。フォルダ名をタップすると、そのフォルダ内のノートが下からスッと開きます。
                  </span>
                </div>
              </label>

              {/* Recent Notes & Back/Forward */}
              <label className="flex items-start gap-3 p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={uiPrefs.enableRecentNotes}
                  onChange={(e) =>
                    onUpdateUIPrefs({ ...uiPrefs, enableRecentNotes: e.target.checked })
                  }
                  className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 focus:ring-offset-zinc-900 border-zinc-700 bg-zinc-800"
                />
                <div className="flex-1 text-xs">
                  <span className="font-semibold text-zinc-200 block">「戻る・進む」＆ 最近開いたノート</span>
                  <span className="text-zinc-400 leading-relaxed">
                    直前のノートに戻れる「←」「→」ボタンと、最近閲覧したノートの横スクロールチップを表示します。
                  </span>
                </div>
              </label>

              {/* Footer Sibling Nav */}
              <label className="flex items-start gap-3 p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={uiPrefs.enableFooterNav}
                  onChange={(e) =>
                    onUpdateUIPrefs({ ...uiPrefs, enableFooterNav: e.target.checked })
                  }
                  className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 focus:ring-offset-zinc-900 border-zinc-700 bg-zinc-800"
                />
                <div className="flex-1 text-xs">
                  <span className="font-semibold text-zinc-200 block">ノート末尾の関連ノート案内</span>
                  <span className="text-zinc-400 leading-relaxed">
                    ノートを一番下までスクロールした位置に、同じフォルダの他ノートや「前へ/次へ」ボタンを表示します。
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Cache Management */}
          {vaults.length > 0 && (
            <div className="pt-4 border-t border-zinc-800">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                キャッシュ管理
              </h3>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>オフライン表示用のMarkdownキャッシュをクリア</span>
                <button
                  type="button"
                  onClick={() => {
                    const activeVault = vaults.find((v) => v.id === activeVaultId) || vaults[0];
                    if (activeVault) {
                      onClearCache(activeVault.owner, activeVault.repo);
                      alert('キャッシュをクリアしました。次回読み込み時に最新を取得します。');
                    }
                  }}
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                >
                  キャッシュ削除
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/80 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
