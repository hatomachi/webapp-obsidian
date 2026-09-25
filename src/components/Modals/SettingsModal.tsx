import React, { useState, useEffect } from 'react';
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
  ChevronDown,
  ChevronRight,
  Sliders,
  Bot,
  Key,
  RefreshCw,
} from 'lucide-react';
import { VaultConfig, UIPreferences, GitProvider } from '../../types';
import { GitService } from '../../services/GitService';
import { AiRemoteSettings, deriveHttpUrls } from '../../features/ai';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vaults: VaultConfig[];
  activeVaultId: string | null;
  onSaveVault: (vault: VaultConfig) => void;
  onAddVault: (vault: Omit<VaultConfig, 'id'>) => void;
  onDeleteVault: (id: string) => void;
  onSelectVault: (id: string) => void;
  onClearCache: (owner: string, repo: string, provider?: string) => void;
  uiPrefs: UIPreferences;
  onUpdateUIPrefs: (prefs: UIPreferences) => void;
  aiSettings?: AiRemoteSettings;
  onUpdateAiSettings?: (settings: AiRemoteSettings) => void;
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
  aiSettings,
  onUpdateAiSettings,
}) => {
  const [isAdding, setIsAdding] = useState(vaults.length === 0);
  const [editingVaultId, setEditingVaultId] = useState<string | null>(null);

  // AI Remote Settings State
  const [aiHubUrl, setAiHubUrl] = useState(aiSettings?.hubUrl || 'ws://localhost:8090/ws/client');
  const [aiToken, setAiToken] = useState(aiSettings?.authToken || '');
  const [aiEngine, setAiEngine] = useState<'claude' | 'copilot'>(aiSettings?.engine || 'claude');
  const [aiModel, setAiModel] = useState(aiSettings?.model || 'claude-opus-4-7');
  const [aiTransportMode, setAiTransportMode] = useState<'auto' | 'ws' | 'http'>(aiSettings?.transportMode || 'auto');
  const [isAiTesting, setIsAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Sync internal state when external aiSettings changes
  useEffect(() => {
    if (aiSettings) {
      setAiHubUrl(aiSettings.hubUrl);
      setAiToken(aiSettings.authToken);
      setAiEngine(aiSettings.engine);
      setAiModel(aiSettings.model);
      setAiTransportMode(aiSettings.transportMode);
    }
  }, [aiSettings]);

  const handleSaveAiSettings = (newConfig?: Partial<AiRemoteSettings>) => {
    if (!onUpdateAiSettings) return;
    const updated: AiRemoteSettings = {
      hubUrl: newConfig?.hubUrl !== undefined ? newConfig.hubUrl : aiHubUrl,
      authToken: newConfig?.authToken !== undefined ? newConfig.authToken : aiToken,
      engine: newConfig?.engine !== undefined ? newConfig.engine : aiEngine,
      model: newConfig?.model !== undefined ? newConfig.model : aiModel,
      transportMode: newConfig?.transportMode !== undefined ? newConfig.transportMode : aiTransportMode,
    };
    onUpdateAiSettings(updated);
  };

  const handleTestAiConnection = async () => {
    const hubUrl = (aiHubUrl || 'ws://localhost:8090/ws/client').trim();
    const token = (aiToken || '').trim();

    if (!token) {
      setAiTestResult({
        success: false,
        message: '認証トークン (Auth Key) が未入力です。社内PCで start-agent 起動時に表示された UUID を入力してください。',
      });
      return;
    }

    setIsAiTesting(true);
    setAiTestResult(null);

    const transportMode = aiTransportMode || 'auto';

    // 1. HTTP メッセージエンドポイント (POST .../message?token=...) を試行
    if (transportMode === 'http' || transportMode === 'auto') {
      try {
        const { messageUrl } = deriveHttpUrls(hubUrl, token);
        const postRes = await fetch(messageUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'get_status' }),
          signal: AbortSignal.timeout(4000),
        });

        if (postRes.ok) {
          setAiTestResult({
            success: true,
            message: 'HTTP (SSE+POST) 接続成功: ✅ 社内PC Bridge Agent 接続中',
          });
          setIsAiTesting(false);
          return;
        }

        if (postRes.status === 503) {
          setAiTestResult({
            success: true,
            message: 'HTTP (SSE+POST) 疎通成功: ⚠️ Relay Hub は到達可能ですが、PC側の start-agent が起動していません',
          });
          setIsAiTesting(false);
          return;
        }

        if (postRes.status === 401) {
          setAiTestResult({
            success: false,
            message: '認証エラー (HTTP 401): 認証トークン (Auth Key) が正しくありません。PC側のログを確認してください',
          });
          setIsAiTesting(false);
          return;
        }
      } catch (httpErr: any) {
        console.warn('HTTP POST test failed:', httpErr);
        if (transportMode === 'http') {
          setAiTestResult({
            success: false,
            message: `HTTP (SSE+POST) 接続失敗: ${httpErr.message || 'Hub にアクセスできません'}`,
          });
          setIsAiTesting(false);
          return;
        }
      }
    }

    // 2. WebSocket 接続テスト (ws / wss)
    try {
      let wsUrl = hubUrl;
      if (wsUrl.startsWith('http://')) wsUrl = 'ws://' + wsUrl.slice(7);
      else if (wsUrl.startsWith('https://')) wsUrl = 'wss://' + wsUrl.slice(8);
      else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
        const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
        wsUrl = `${isHttps ? 'wss:' : 'ws:'}//${wsUrl}`;
      }
      const parsed = new URL(wsUrl);
      if (!parsed.pathname || parsed.pathname === '/') parsed.pathname = '/ws/client';
      if (token) parsed.searchParams.set('token', token);

      const ws = new WebSocket(parsed.toString());

      const timeoutId = setTimeout(() => {
        try {
          ws.close();
        } catch {}
        setAiTestResult({
          success: false,
          message: 'WebSocket接続タイムアウト: Hub が応答しないか、プロキシ等でWSが遮断されている可能性があります',
        });
        setIsAiTesting(false);
      }, 4000);

      ws.onopen = () => {
        clearTimeout(timeoutId);
        ws.send(JSON.stringify({ type: 'get_status' }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          clearTimeout(timeoutId);
          ws.close();
          if (msg.agentConnected) {
            setAiTestResult({
              success: true,
              message: 'WebSocket接続成功: ✅ 社内PC Bridge Agent 接続中',
            });
          } else {
            setAiTestResult({
              success: true,
              message: 'WebSocket接続成功: ⚠️ Relay Hub に接続しましたが、Agent が未接続です',
            });
          }
        } catch {
          setAiTestResult({
            success: true,
            message: 'WebSocket接続成功: Relay Hub と接続できました',
          });
        }
        setIsAiTesting(false);
      };

      ws.onerror = () => {
        clearTimeout(timeoutId);
        try {
          ws.close();
        } catch {}
        setAiTestResult({
          success: false,
          message: 'WebSocket接続エラー: 接続先URLやプロトコル (WS/WSS) を確認してください',
        });
        setIsAiTesting(false);
      };
    } catch (wsErr: any) {
      setAiTestResult({
        success: false,
        message: `WebSocket接続初期化失敗: ${wsErr.message || 'URLが無効です'}`,
      });
      setIsAiTesting(false);
    }
  };

  // Form states
  const [provider, setProvider] = useState<GitProvider>('github');
  const [baseUrl, setBaseUrl] = useState('');
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState('');

  // Advanced / Huge Repository states
  const [lazyLoad, setLazyLoad] = useState(false);
  const [rootPath, setRootPath] = useState('');
  const [ignoredFolders, setIgnoredFolders] = useState('attachments, assets, images');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Test connection state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const startAdding = () => {
    setIsAdding(true);
    setEditingVaultId(null);
    setProvider('github');
    setBaseUrl('');
    setName('');
    setOwner('');
    setRepo('');
    setBranch('main');
    setToken('');
    setLazyLoad(false);
    setRootPath('');
    setIgnoredFolders('attachments, assets, images');
    setShowAdvanced(false);
    setTestResult(null);
  };

  const startEditing = (vault: VaultConfig) => {
    setEditingVaultId(vault.id);
    setIsAdding(false);
    setProvider(vault.provider || 'github');
    setBaseUrl(vault.baseUrl || '');
    setName(vault.name);
    setOwner(vault.owner);
    setRepo(vault.repo);
    setBranch(vault.branch);
    setToken(vault.token);
    setLazyLoad(!!vault.lazyLoad);
    setRootPath(vault.rootPath || '');
    setIgnoredFolders(vault.ignoredFolders || 'attachments, assets, images');
    setShowAdvanced(!!vault.lazyLoad || !!vault.rootPath || (!!vault.ignoredFolders && vault.ignoredFolders !== 'attachments, assets, images'));
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!token) {
      setTestResult({ success: false, message: 'Tokenを入力してください。' });
      return;
    }
    if (provider === 'github' && (!owner || !repo)) {
      setTestResult({ success: false, message: 'Owner、Repoを入力してください。' });
      return;
    }
    if (provider === 'gitlab' && !repo) {
      setTestResult({ success: false, message: 'GitLabプロジェクト名（またはID）を入力してください。' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const tempVault: VaultConfig = {
      id: 'test',
      name: name || 'Test',
      provider,
      baseUrl: baseUrl.trim() || undefined,
      owner: owner.trim(),
      repo: repo.trim(),
      branch: branch.trim() || 'main',
      token: token.trim(),
    };

    const res = await GitService.testConnection(tempVault);
    setIsTesting(false);
    setTestResult(res);

    // If connection succeeded and a branch was detected (e.g. master instead of main), update form state
    if (res.success && res.detectedBranch && res.detectedBranch !== branch) {
      setBranch(res.detectedBranch);
    }
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !token.trim()) {
      alert('Vault表示名とTokenは必須です。');
      return;
    }
    if (provider === 'github' && (!owner.trim() || !repo.trim())) {
      alert('GitHubの場合はOwnerとRepoの両方が必須です。');
      return;
    }
    if (provider === 'gitlab' && !repo.trim()) {
      alert('GitLabの場合はプロジェクト名（またはID）が必須です。');
      return;
    }

    const vaultPayload = {
      name: name.trim(),
      provider,
      baseUrl: baseUrl.trim() || undefined,
      owner: owner.trim(),
      repo: repo.trim(),
      branch: branch.trim() || 'main',
      token: token.trim(),
      lazyLoad: lazyLoad || undefined,
      rootPath: rootPath.trim() || undefined,
      ignoredFolders: ignoredFolders.trim() || undefined,
    };

    if (editingVaultId) {
      onSaveVault({
        ...vaultPayload,
        id: editingVaultId,
      });
      setEditingVaultId(null);
    } else {
      onAddVault(vaultPayload);
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
            <h2 className="font-bold text-base text-zinc-100">Vault & Git 設定</h2>
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
              Access Token はこの端末のブラウザ（LocalStorage）にのみ保存され、外部サーバーやCloudflareには一切送信されません。端末と GitHub / 社内GitLab が直接暗号化通信を行います。
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
                const isGitLab = v.provider === 'gitlab';
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
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                            isGitLab
                              ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                              : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                          }`}
                        >
                          {isGitLab ? 'GitLab' : 'GitHub'}
                        </span>
                        {v.lazyLoad && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-medium border border-amber-500/30">
                            ⚡遅延ロード
                          </span>
                        )}
                        {v.rootPath && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-medium border border-zinc-700 truncate max-w-[100px]">
                            📁{v.rootPath}
                          </span>
                        )}
                        {isActive && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-600/30 text-purple-300 font-medium border border-purple-500/40">
                            選択中
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-400 truncate mt-0.5">
                        {isGitLab && v.baseUrl ? `${v.baseUrl.replace(/^https?:\/\//, '')} • ` : ''}
                        {v.owner ? `${v.owner}/` : ''}{v.repo} <span className="text-zinc-600">•</span> {v.branch}
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
                {/* Provider Selector */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1.5">Git プロバイダー *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setProvider('github');
                        setTestResult(null);
                      }}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        provider === 'github'
                          ? 'border-purple-500 bg-purple-950/40 text-purple-200 shadow-sm'
                          : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      <span>GitHub</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProvider('gitlab');
                        setTestResult(null);
                      }}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        provider === 'gitlab'
                          ? 'border-orange-500 bg-orange-950/40 text-orange-200 shadow-sm'
                          : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      <span>GitLab (社内 / クラウド)</span>
                    </button>
                  </div>
                </div>

                {/* GitLab Base URL */}
                {provider === 'gitlab' && (
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      GitLab サーバー URL (Base URL) *
                    </label>
                    <input
                      type="url"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="例: https://gitlab.internal.example.com"
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-orange-500 font-mono text-xs"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">
                      空欄の場合は https://gitlab.com が使用されます。社内GitLabのURLを指定してください。
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Vault 表示名 *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={provider === 'gitlab' ? '例: 社内Wiki / プロジェクト進捗' : '例: ジブリパーク旅行計画 / 個人タスク'}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      {provider === 'gitlab' ? 'グループ / 名前空間' : 'GitHub Owner *'}
                    </label>
                    <input
                      type="text"
                      required={provider === 'github'}
                      value={owner}
                      onChange={(e) => setOwner(e.target.value)}
                      placeholder={provider === 'gitlab' ? '例: dev-team (空欄可)' : '例: hatomachi'}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      {provider === 'gitlab' ? 'プロジェクト名 / ID *' : 'Repo 名 *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                      placeholder={provider === 'gitlab' ? '例: wiki-vault または 12345' : '例: 202609_ghibli-park'}
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
                    <label className="text-zinc-300 font-medium">
                      {provider === 'gitlab' ? 'GitLab Personal Access Token (PAT) *' : 'GitHub Personal Access Token (PAT) *'}
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      {provider === 'gitlab' ? 'read_api, write_repository' : 'Fine-grained PAT 推奨'}
                    </span>
                  </div>
                  <input
                    type="password"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={provider === 'gitlab' ? 'glpat-...' : 'github_pat_...'}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 font-mono text-xs focus:outline-none focus:border-purple-500"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    {provider === 'gitlab'
                      ? 'GitLabの「read_api」および「write_repository」スコープが必要です。'
                      : 'リポジトリの「Contents: Read and write」権限が必要です。'}
                  </p>
                </div>

                {/* Advanced Settings for Huge Vaults (Lazy Load & Folders) */}
                <div className="border border-zinc-800 rounded-xl bg-zinc-950/30 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full flex items-center justify-between p-3 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-purple-400" />
                      <span>詳細設定（巨大リポジトリ・遅延ロード・除外）</span>
                      {lazyLoad && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          遅延ロードON
                        </span>
                      )}
                    </div>
                    {showAdvanced ? (
                      <ChevronDown className="w-4 h-4 text-zinc-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-zinc-400" />
                    )}
                  </button>

                  {showAdvanced && (
                    <div className="p-3.5 pt-0 space-y-3.5 border-t border-zinc-800/60 mt-1">
                      {/* Lazy Load Toggle */}
                      <div className="flex items-start justify-between gap-3 pt-2">
                        <div>
                          <label className="text-xs font-medium text-zinc-200 block">
                            巨大Vault遅延読み込み（Lazy Load）
                          </label>
                          <p className="text-[11px] text-zinc-400 leading-tight mt-0.5">
                            5GB規模や大量の写真・添付ファイルがあるVault向け。起動時にルート直下のみを取得し、フォルダ展開時にオンデマンド取得します。
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLazyLoad(!lazyLoad)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            lazyLoad ? 'bg-purple-600' : 'bg-zinc-700'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              lazyLoad ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Root Path */}
                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1">
                          起点フォルダ（Root Path）
                        </label>
                        <input
                          type="text"
                          value={rootPath}
                          onChange={(e) => setRootPath(e.target.value)}
                          placeholder="例: 00_Notes または docs (空欄ならリポジトリ全体)"
                          className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-xs focus:outline-none focus:border-purple-500"
                        />
                        <p className="text-[10px] text-zinc-500 mt-1">
                          Vault全体ではなく特定フォルダ配下のみを読み込みたい場合に指定します。
                        </p>
                      </div>

                      {/* Ignored Folders */}
                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1">
                          除外フォルダ（Ignored Folders）
                        </label>
                        <input
                          type="text"
                          value={ignoredFolders}
                          onChange={(e) => setIgnoredFolders(e.target.value)}
                          placeholder="attachments, assets, images"
                          className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-xs focus:outline-none focus:border-purple-500 font-mono"
                        />
                        <p className="text-[10px] text-zinc-500 mt-1">
                          カンマ区切りで指定した名前のフォルダを探索から除外します（巨大メディアフォルダのスキップに有効）。
                        </p>
                      </div>
                    </div>
                  )}
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

          {/* AI Remote Hub Settings */}
          <div className="pt-4 border-t border-zinc-800 space-y-3">
            <div className="flex items-center space-x-2 text-zinc-200 font-semibold text-xs">
              <Bot className="w-4 h-4 text-emerald-400" />
              <span>AI Remote 壁打ち連携 (社内PC Bridge Agent 接続)</span>
            </div>
            <p className="text-xs text-zinc-500">
              社内PCで稼働する Relay Hub 経由で Claude Code / Copilot CLI と対話できます。現在開いているノートをワンタップで添付し、要約・推敲・タスク抽出が行えます。
            </p>

            <div className="space-y-3 p-3.5 rounded-xl bg-zinc-950/50 border border-zinc-800">
              {/* Hub URL */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Relay Hub URL (WSS / WS)
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="ws://localhost:8090/ws/client または wss://..."
                    value={aiHubUrl}
                    onChange={(e) => {
                      setAiHubUrl(e.target.value);
                      handleSaveAiSettings({ hubUrl: e.target.value });
                    }}
                    className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleTestAiConnection}
                    disabled={isAiTesting}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium border border-zinc-600 transition-colors shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isAiTesting ? 'animate-spin text-emerald-400' : ''}`} />
                    <span>テスト</span>
                  </button>
                </div>
              </div>

              {/* Auth Token */}
              <div>
                <label className="block text-xs font-medium text-zinc-200 mb-1 flex items-center space-x-1">
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  <span>認証トークン / Auth Key (Session Token)</span>
                </label>
                <input
                  type="text"
                  placeholder="例: 550e8400-e29b-41d4-a716-446655440000"
                  value={aiToken}
                  onChange={(e) => {
                    setAiToken(e.target.value);
                    handleSaveAiSettings({ authToken: e.target.value });
                  }}
                  className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  社内PCで start-agent を起動した際にコンソールに表示される UUID を入力してください。
                </p>
              </div>

              {/* Engine & Model & Transport */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    AI Engine
                  </label>
                  <select
                    value={aiEngine}
                    onChange={(e) => {
                      const val = e.target.value as 'claude' | 'copilot';
                      setAiEngine(val);
                      handleSaveAiSettings({ engine: val });
                    }}
                    className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="claude">Claude Code (標準)</option>
                    <option value="copilot">GitHub Copilot CLI</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    モデル (Model)
                  </label>
                  <input
                    type="text"
                    value={aiModel}
                    onChange={(e) => {
                      setAiModel(e.target.value);
                      handleSaveAiSettings({ model: e.target.value });
                    }}
                    placeholder="claude-opus-4-7"
                    className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    通信プロトコル
                  </label>
                  <select
                    value={aiTransportMode}
                    onChange={(e) => {
                      const val = e.target.value as 'auto' | 'ws' | 'http';
                      setAiTransportMode(val);
                      handleSaveAiSettings({ transportMode: val });
                    }}
                    className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="auto">Auto (自動フォールバック)</option>
                    <option value="ws">WebSocket のみ</option>
                    <option value="http">HTTP (SSE+POST) のみ</option>
                  </select>
                </div>
              </div>

              {/* AI Test Result Banner */}
              {aiTestResult && (
                <div
                  className={`flex items-start gap-2 p-2.5 rounded-lg text-xs mt-2 ${
                    aiTestResult.success
                      ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/60 border border-rose-800 text-rose-300'
                  }`}
                >
                  {aiTestResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  )}
                  <span className="leading-relaxed break-words">{aiTestResult.message}</span>
                </div>
              )}
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
                      onClearCache(activeVault.owner, activeVault.repo, activeVault.provider);
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
