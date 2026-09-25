import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Bot,
  Send,
  Square,
  Sparkles,
  Check,
  Copy,
  ArrowRight,
  WifiOff,
  AlertCircle,
  Settings,
  Plus,
  History,
  FolderGit2,
  FolderPlus,
  Folder,
  GitBranch,
  Trash2,
  Clock,
  RefreshCw,
  Eye,
} from 'lucide-react';
import {
  ContextAttachment,
  AiChatMessage,
  AiRemoteSettings,
  ProjectInfo,
  SessionInfo,
  AI_REMOTE_STORAGE_KEYS,
} from './aiRemoteTypes';
import { OBSIDIAN_QUICK_PROMPTS, QuickPrompt } from './obsidianAiAdapter';
import { useAiRemoteClient } from './useAiRemoteClient';
import { ContextAttachmentModal } from './ContextAttachmentModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: AiRemoteSettings;
  topicTitle: string;
  initialAttachment?: ContextAttachment | null;
  getCurrentContextAttachment?: () => ContextAttachment | null;
  onApplyDraftToAppend?: (text: string) => void;
  onOpenSettings?: () => void;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Normalize raw messages stored in localStorage or received from remote
 * to guarantee valid AiChatMessage format (safeguards against missing .text property)
 */
function normalizeStoredMessages(rawList: any, sessionId: string): AiChatMessage[] {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter((m) => m && typeof m === 'object')
    .map((m: any, idx: number): AiChatMessage => {
      const rawText = typeof m.text === 'string'
        ? m.text
        : (typeof m.content === 'string' ? m.content : '');
      const ts = typeof m.timestamp === 'string'
        ? new Date(m.timestamp).getTime()
        : (typeof m.timestamp === 'number' ? m.timestamp : Date.now());

      return {
        id: m.id || `msg-${sessionId}-${idx}`,
        role: m.role === 'assistant' ? 'assistant' : (m.role === 'system' ? 'system' : 'user'),
        text: rawText,
        content: rawText,
        attachments: Array.isArray(m.attachments) ? m.attachments : undefined,
        isStreaming: Boolean(m.isStreaming),
        isError: Boolean(m.isError),
        timestamp: isNaN(ts) ? Date.now() : ts,
        sessionId: m.sessionId || sessionId,
        engine: m.engine,
      };
    });
}

export const AiRemoteChatDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  settings,
  topicTitle,
  initialAttachment,
  getCurrentContextAttachment,
  onApplyDraftToAppend,
  onOpenSettings,
}) => {
  // --- 1. Projects state ---
  const [projects, setProjects] = useState<ProjectInfo[]>(() => {
    try {
      const saved = localStorage.getItem(AI_REMOTE_STORAGE_KEYS.PROJECTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter((p) => p && typeof p.path === 'string');
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const [currentProject, setCurrentProject] = useState<ProjectInfo | null>(() => {
    try {
      const saved = localStorage.getItem(AI_REMOTE_STORAGE_KEYS.PROJECTS);
      const lastId = localStorage.getItem(AI_REMOTE_STORAGE_KEYS.LAST_PROJECT);
      if (saved) {
        const list = JSON.parse(saved);
        if (Array.isArray(list) && list.length > 0) {
          const found = list.find((p) => p && (p.id === lastId || p.path === lastId));
          return found || list[0];
        }
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  });

  // --- 2. Sessions state ---
  const [sessions, setSessions] = useState<SessionInfo[]>(() => {
    try {
      const saved = localStorage.getItem(AI_REMOTE_STORAGE_KEYS.SESSIONS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((s) => s && typeof s.id === 'string');
        }
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    try {
      const savedLast = localStorage.getItem(AI_REMOTE_STORAGE_KEYS.LAST_SESSION);
      if (savedLast && typeof savedLast === 'string' && savedLast.trim().length > 0) {
        return savedLast.trim();
      }
    } catch (e) {
      console.error(e);
    }
    return generateUUID();
  });

  // --- 3. UI and View states ---
  const [isSessionListView, setIsSessionListView] = useState(false);
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false);
  const [customProjectPath, setCustomProjectPath] = useState('');
  const [customProjectName, setCustomProjectName] = useState('');
  const [engineFilter, setEngineFilter] = useState<'all' | 'claude' | 'copilot'>('all');

  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [activeAttachments, setActiveAttachments] = useState<ContextAttachment[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<ContextAttachment | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const assistantMsgIdRef = useRef<string | null>(null);

  // Settings for AI Remote Client (memoized)
  const clientSettings: AiRemoteSettings = useMemo(() => ({
    hubUrl: settings.hubUrl || 'ws://localhost:8090/ws/client',
    authToken: settings.authToken || '',
    engine: settings.engine || 'claude',
    model: settings.model || 'claude-opus-4-7',
    transportMode: settings.transportMode || 'auto',
  }), [
    settings.hubUrl,
    settings.authToken,
    settings.engine,
    settings.model,
    settings.transportMode,
  ]);

  // Setup AI Remote Client
  const {
    isHubConnected,
    isAgentConnected,
    agentHostname,
    agentCwd,
    availableProjects,
    projectsBaseDir,
    isExecuting,
    sendPrompt,
    abort,
    requestProjects,
    listSessions,
    getSessionMessages,
    deleteSession,
    reconnect,
  } = useAiRemoteClient({
    settings: clientSettings,
    onDelta: (delta) => {
      const targetId = assistantMsgIdRef.current;
      if (!targetId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === targetId ? { ...m, text: m.text + delta, isStreaming: true } : m
        )
      );
    },
    onStatusMessage: (msg) => {
      setStatusText(msg);
    },
    onTurnStart: () => {
      setStatusText('思考中・応答を生成中...');
    },
    onTurnEnd: () => {
      setStatusText(null);
      const targetId = assistantMsgIdRef.current;
      if (targetId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === targetId ? { ...m, isStreaming: false } : m))
        );
      }
      assistantMsgIdRef.current = null;
    },
    onError: (err) => {
      setStatusText(null);
      const targetId = assistantMsgIdRef.current;
      if (targetId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === targetId
              ? {
                  ...m,
                  text: m.text ? `${m.text}\n\n⚠️ エラー: ${err}` : `⚠️ エラー: ${err}`,
                  isStreaming: false,
                  isError: true,
                }
              : m
          )
        );
      }
      assistantMsgIdRef.current = null;
    },
    onSessionsList: (remoteSessions) => {
      setSessions((prev) => {
        const remoteIds = new Set(remoteSessions.map((s) => s.id));
        const merged = [
          ...remoteSessions,
          ...prev.filter((s) => !remoteIds.has(s.id)),
        ];
        merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        try {
          localStorage.setItem(AI_REMOTE_STORAGE_KEYS.SESSIONS, JSON.stringify(merged));
        } catch (e) {
          console.error(e);
        }
        return merged;
      });
    },
    onSessionMessages: (sessionId, remoteMsgs) => {
      if (sessionId === currentSessionId && Array.isArray(remoteMsgs) && remoteMsgs.length > 0) {
        const normalized = normalizeStoredMessages(remoteMsgs, sessionId);
        setMessages(normalized);
        try {
          localStorage.setItem(
            `${AI_REMOTE_STORAGE_KEYS.MESSAGES_PREFIX}${sessionId}`,
            JSON.stringify(normalized)
          );
        } catch (e) {
          console.error(e);
        }
      }
    },
  });

  // Load messages from localStorage when currentSessionId changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`${AI_REMOTE_STORAGE_KEYS.MESSAGES_PREFIX}${currentSessionId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setMessages(normalizeStoredMessages(parsed, currentSessionId));
      } else {
        setMessages([]);
      }
    } catch (e) {
      console.error('Failed to load session messages from storage', e);
      setMessages([]);
      try {
        localStorage.removeItem(AI_REMOTE_STORAGE_KEYS.LAST_SESSION);
      } catch {}
    }
  }, [currentSessionId]);

  // Auto-save messages to localStorage whenever messages change
  useEffect(() => {
    if (!currentSessionId || messages.length === 0) return;

    // ガード: messages 内のメッセージが現在の currentSessionId と不一致なら保存をスキップ（他セッションの誤上書き防止）
    const hasMismatchedSession = messages.some(
      (m) => m.sessionId && m.sessionId !== currentSessionId
    );
    if (hasMismatchedSession) {
      return;
    }

    try {
      localStorage.setItem(
        `${AI_REMOTE_STORAGE_KEYS.MESSAGES_PREFIX}${currentSessionId}`,
        JSON.stringify(messages)
      );

      // Also update or insert session record
      setSessions((prev) => {
        const existingIdx = prev.findIndex((s) => s.id === currentSessionId);
        const firstUserMsg = messages.find((m) => m.role === 'user');
        const userText = firstUserMsg ? (firstUserMsg.text || firstUserMsg.content || '') : '';
        const autoTitle = userText
          ? (userText.length > 32 ? userText.substring(0, 32) + '...' : userText)
          : (topicTitle || '無題のセッション');

        const nowIso = new Date().toISOString();
        let updated: SessionInfo[];

        if (existingIdx >= 0) {
          const curr = prev[existingIdx];
          updated = [
            ...prev.slice(0, existingIdx),
            {
              ...curr,
              title: curr.title || autoTitle,
              updatedAt: nowIso,
              messageCount: messages.length,
            },
            ...prev.slice(existingIdx + 1),
          ];
        } else {
          const newSession: SessionInfo = {
            id: currentSessionId,
            title: autoTitle,
            cwd: currentProject?.path || agentCwd || '',
            projectId: currentProject?.id,
            engine: settings.engine || 'claude',
            createdAt: nowIso,
            updatedAt: nowIso,
            messageCount: messages.length,
          };
          updated = [newSession, ...prev];
        }

        updated.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        localStorage.setItem(AI_REMOTE_STORAGE_KEYS.SESSIONS, JSON.stringify(updated));
        return updated;
      });
    } catch (e) {
      console.error('Failed to save session messages', e);
    }
  }, [messages, currentSessionId, currentProject, agentCwd, settings.engine, topicTitle]);

  // Sync sessions list when agent connects or currentProject changes
  useEffect(() => {
    if (isAgentConnected) {
      listSessions(currentProject?.id, currentProject?.path || agentCwd);
    }
  }, [isAgentConnected, currentProject, agentCwd, listSessions]);

  // Set initial attachment when drawer opens
  useEffect(() => {
    if (isOpen) {
      if (initialAttachment) {
        setActiveAttachments((prev) => {
          if (prev.some((a) => a.id === initialAttachment.id)) return prev;
          return [initialAttachment];
        });
      } else if (getCurrentContextAttachment) {
        const curr = getCurrentContextAttachment();
        if (curr) {
          setActiveAttachments((prev) => {
            if (prev.some((a) => a.id === curr.id)) return prev;
            return [curr];
          });
        }
      }
    }
  }, [isOpen, initialAttachment, getCurrentContextAttachment]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, statusText]);

  // Handle Send
  const handleSendMessage = (customPromptText?: string) => {
    const textToSend = customPromptText !== undefined ? customPromptText : inputText;
    if (!textToSend.trim() && activeAttachments.length === 0) return;
    if (isExecuting) return;

    const userMsgId = `user-${Date.now()}`;
    const userMsg: AiChatMessage = {
      id: userMsgId,
      role: 'user',
      text: textToSend,
      content: textToSend,
      attachments: activeAttachments.length > 0 ? [...activeAttachments] : undefined,
      timestamp: Date.now(),
      sessionId: currentSessionId,
      engine: settings.engine || 'claude',
    };

    const assistantMsgId = `asst-${Date.now()}`;
    assistantMsgIdRef.current = assistantMsgId;

    const assistantPlaceholder: AiChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      text: '',
      content: '',
      isStreaming: true,
      timestamp: Date.now(),
      sessionId: currentSessionId,
      engine: settings.engine || 'claude',
    };

    setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
    setInputText('');

    const attachmentsToSend = activeAttachments.length > 0 ? [...activeAttachments] : undefined;

    sendPrompt({
      userPrompt: textToSend,
      attachments: attachmentsToSend,
      sessionId: currentSessionId,
      cwd: currentProject?.path || agentCwd || undefined,
      engine: settings.engine || 'claude',
      model: settings.model || undefined,
    });
  };

  // Quick Prompt selection
  const handleQuickPromptClick = (qp: QuickPrompt) => {
    if (!getCurrentContextAttachment && activeAttachments.length === 0) {
      handleSendMessage(qp.prompt);
      return;
    }

    if (activeAttachments.length === 0 && getCurrentContextAttachment) {
      const currentAtt = getCurrentContextAttachment();
      if (currentAtt) {
        setActiveAttachments([currentAtt]);
      }
    }
    handleSendMessage(qp.prompt);
  };

  const handleAddCurrentAttachment = () => {
    if (!getCurrentContextAttachment) return;
    const att = getCurrentContextAttachment();
    if (att) {
      setActiveAttachments((prev) => {
        if (prev.some((a) => a.id === att.id)) return prev;
        return [...prev, att];
      });
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setActiveAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleCopyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleApplyDraft = (id: string, text: string) => {
    if (onApplyDraftToAppend) {
      onApplyDraftToAppend(text);
      setAppliedId(id);
      setTimeout(() => setAppliedId(null), 2000);
    }
  };

  const handleNewSession = () => {
    const newId = generateUUID();
    setCurrentSessionId(newId);
    setMessages([]);
    setActiveAttachments([]);
    setIsSessionListView(false);
    try {
      localStorage.setItem(AI_REMOTE_STORAGE_KEYS.LAST_SESSION, newId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSwitchSession = (session: SessionInfo) => {
    setCurrentSessionId(session.id);
    setIsSessionListView(false);
    try {
      localStorage.setItem(AI_REMOTE_STORAGE_KEYS.LAST_SESSION, session.id);
    } catch (e) {
      console.error(e);
    }
    // Fetch remote history if connected
    if (isAgentConnected) {
      getSessionMessages(session.id, session.cwd || currentProject?.path || agentCwd);
    }
  };

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (window.confirm('このセッションを削除しますか？')) {
      deleteSession(sessionId);
      try {
        localStorage.removeItem(`${AI_REMOTE_STORAGE_KEYS.MESSAGES_PREFIX}${sessionId}`);
      } catch (err) {
        console.error(err);
      }
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== sessionId);
        try {
          localStorage.setItem(AI_REMOTE_STORAGE_KEYS.SESSIONS, JSON.stringify(next));
        } catch {}
        return next;
      });

      if (currentSessionId === sessionId) {
        handleNewSession();
      }
    }
  };

  const handleSelectProject = (project: ProjectInfo | null) => {
    setCurrentProject(project);
    try {
      if (project) {
        localStorage.setItem(AI_REMOTE_STORAGE_KEYS.LAST_PROJECT, project.id || project.path);
      } else {
        localStorage.removeItem(AI_REMOTE_STORAGE_KEYS.LAST_PROJECT);
      }
    } catch (e) {
      console.error(e);
    }
    if (isAgentConnected) {
      listSessions(project?.id, project?.path || agentCwd);
    }
  };

  const handleAddProject = (p: ProjectInfo) => {
    setProjects((prev) => {
      if (prev.some((x) => x.path === p.path)) return prev;
      const next = [...prev, p];
      try {
        localStorage.setItem(AI_REMOTE_STORAGE_KEYS.PROJECTS, JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  const handleRemoveProject = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    setProjects((prev) => {
      const next = prev.filter((p) => p.path !== path);
      try {
        localStorage.setItem(AI_REMOTE_STORAGE_KEYS.PROJECTS, JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
    if (currentProject?.path === path) {
      handleSelectProject(null);
    }
  };

  const handleAddCustomProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customProjectPath.trim()) return;

    const path = customProjectPath.trim();
    const name = customProjectName.trim() || path.split('/').filter(Boolean).pop() || path;
    const newProj: ProjectInfo = {
      id: `custom-${Date.now()}`,
      name,
      path,
      isGit: false,
    };
    handleAddProject(newProj);
    handleSelectProject(newProj);
    setCustomProjectPath('');
    setCustomProjectName('');
    setIsAddProjectModalOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (engineFilter === 'all') return true;
      return s.engine === engineFilter;
    });
  }, [sessions, engineFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[480px] md:w-[540px] bg-zinc-950/95 border-l border-zinc-800 shadow-2xl flex flex-col font-sans backdrop-blur-md animate-in slide-in-from-right duration-200 safe-top safe-bottom">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-900/90 border-b border-zinc-800 shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-emerald-950 border border-emerald-800/80 text-emerald-400">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-xs text-zinc-100 truncate">
                AI Remote 壁打ち
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono">
                {settings.engine === 'copilot' ? 'Copilot' : 'Claude'}
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-[10px] text-zinc-400 truncate">
              {isHubConnected ? (
                isAgentConnected ? (
                  <span className="text-emerald-400 flex items-center space-x-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                    <span className="truncate">PC接続中: {agentHostname || 'Agent'}</span>
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center space-x-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    <span>Hub接続済 (Agent待機)</span>
                  </span>
                )
              ) : (
                <button
                  type="button"
                  onClick={reconnect}
                  className="text-zinc-500 hover:text-zinc-300 flex items-center space-x-0.5"
                  title="クリックして再接続"
                >
                  <WifiOff className="w-3 h-3 text-rose-500" />
                  <span>未接続 (タップで再接続)</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          {/* Session History View Toggle */}
          <button
            type="button"
            onClick={() => setIsSessionListView(!isSessionListView)}
            className={`p-1.5 rounded-lg text-xs transition-colors ${
              isSessionListView
                ? 'bg-zinc-800 text-emerald-400'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
            title="セッション履歴"
          >
            <History className="w-4 h-4" />
          </button>

          {/* New Session */}
          <button
            type="button"
            onClick={handleNewSession}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="新規チャットセッション"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Settings Shortcut */}
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="AI Remote 設定"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {/* Close Drawer */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Project Selector Bar (PC Folder) */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/60 border-b border-zinc-800/80 text-[11px] shrink-0">
        <div className="flex items-center space-x-1.5 min-w-0 flex-1 mr-2">
          <FolderGit2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span className="text-zinc-400 shrink-0 font-medium">PCフォルダ:</span>

          <select
            value={currentProject?.path || ''}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '__add_new__') {
                setIsAddProjectModalOpen(true);
                if (isAgentConnected) requestProjects();
              } else {
                const found = projects.find((p) => p.path === val);
                handleSelectProject(found || null);
              }
            }}
            className="bg-zinc-950 border border-zinc-700/80 rounded px-2 py-0.5 text-xs text-zinc-200 outline-none focus:border-zinc-500 font-mono truncate max-w-[200px]"
          >
            <option value="">(デフォルト: {agentCwd ? agentCwd.split('/').pop() || agentCwd : '未指定'})</option>
            {projects.map((p) => (
              <option key={p.path} value={p.path}>
                {p.name} ({p.path.split('/').pop()})
              </option>
            ))}
            <option value="__add_new__">+ フォルダを追加・選択...</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsAddProjectModalOpen(true);
            if (isAgentConnected) requestProjects();
          }}
          className="text-zinc-400 hover:text-emerald-400 p-1 rounded hover:bg-zinc-800 shrink-0 transition-colors"
          title="PCフォルダを追加"
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Drawer Body: Session List View OR Chat View */}
      {isSessionListView ? (
        /* Sessions List View */
        <div className="flex-1 overflow-y-auto p-3 space-y-2 select-none">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="text-xs font-semibold text-zinc-300">セッション履歴</span>
            <div className="flex space-x-1 text-[10px]">
              {(['all', 'claude', 'copilot'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setEngineFilter(mode)}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    engineFilter === mode
                      ? 'bg-emerald-600 text-white font-medium'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {mode === 'all' ? 'すべて' : mode === 'claude' ? 'Claude' : 'Copilot'}
                </button>
              ))}
            </div>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="text-center py-8 text-xs text-zinc-500">
              セッション履歴がありません
            </div>
          ) : (
            filteredSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => handleSwitchSession(session)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                  currentSessionId === session.id
                    ? 'bg-zinc-800/80 border-emerald-500/80 text-white'
                    : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                }`}
              >
                <div className="min-w-0 flex-1 mr-2">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-medium truncate">
                      {session.title || '無題のセッション'}
                    </span>
                    {session.engine && (
                      <span className="text-[9px] px-1 rounded bg-zinc-800 text-zinc-400 font-mono">
                        {session.engine}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 text-[10px] text-zinc-500 mt-0.5">
                    <span className="flex items-center space-x-0.5">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(session.updatedAt || session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </span>
                    {session.messageCount !== undefined && (
                      <span>{session.messageCount} 件の会話</span>
                    )}
                    {session.cwd && (
                      <span className="truncate max-w-[120px] font-mono">
                        {session.cwd.split('/').pop()}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 rounded transition-all"
                  title="セッション削除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Chat View */
        <>
          {/* Quick Prompts Bar (Obsidian Optimized) */}
          <div className="px-3 py-1.5 bg-zinc-900/40 border-b border-zinc-800 flex items-center space-x-1.5 overflow-x-auto no-scrollbar shrink-0">
            <span className="text-[10px] text-zinc-400 shrink-0 flex items-center space-x-0.5">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>定型:</span>
            </span>
            {OBSIDIAN_QUICK_PROMPTS.map((qp) => (
              <button
                key={qp.id}
                type="button"
                onClick={() => handleQuickPromptClick(qp)}
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium shrink-0 border border-zinc-700 transition-colors"
                title={qp.description}
              >
                <span>{qp.icon}</span>
                <span>{qp.label}</span>
              </button>
            ))}
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-400 select-none space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-zinc-200">
                    社内PC AI 壁打ち（Obsidian Remote）
                  </h4>
                  <p className="text-xs text-zinc-400 max-w-xs mt-1">
                    PCで稼働中の Claude Code / Copilot と安全に対話し、開いているノートの要約・推敲・タスク抽出や企画のブレストができます。
                  </p>
                </div>

                {!isAgentConnected && (
                  <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs text-left max-w-xs space-y-1">
                    <div className="font-semibold flex items-center space-x-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>PC側の Agent を起動してください</span>
                    </div>
                    <p className="text-[11px] text-amber-300/80 leading-normal">
                      社内PCで Relay Hub および <code className="bg-zinc-900 px-1 py-0.5 rounded text-zinc-200">start-agent</code> を起動すると接続されます。
                    </p>
                  </div>
                )}
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  {/* Attachments Tag on message */}
                  {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {msg.attachments.map((att) => (
                        <button
                          key={att.id}
                          type="button"
                          onClick={() => setPreviewAttachment(att)}
                          className="inline-flex items-center space-x-1 text-[10px] bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 hover:border-emerald-500/70 text-emerald-300 hover:text-emerald-200 px-1.5 py-0.5 rounded font-mono transition-colors group cursor-pointer"
                          title="クリックして送信時の添付ノート内容をプレビュー・コピー"
                        >
                          <span>📎</span>
                          <span className="font-semibold underline decoration-dotted underline-offset-2">{att.title}</span>
                          {att.badge && <span className="text-emerald-400/80">({att.badge})</span>}
                          <Eye className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 text-emerald-400 ml-0.5" />
                        </button>
                      ))}
                    </div>
                  )}

                  <div
                    className={`max-w-[92%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-purple-900/80 text-white rounded-br-none shadow-md'
                        : msg.isError
                        ? 'bg-rose-950/80 border border-rose-800 text-rose-200 rounded-bl-none'
                        : 'bg-zinc-900/90 border border-zinc-800 text-zinc-100 rounded-bl-none shadow-md'
                    }`}
                  >
                    {/* Assistant header */}
                    {msg.role === 'assistant' && (
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 pb-1 mb-1.5 border-b border-zinc-800/80 font-mono">
                        <div className="flex items-center space-x-1 text-emerald-400">
                          <Bot className="w-3 h-3" />
                          <span>{settings.engine === 'copilot' ? 'Copilot' : 'Claude'}</span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handleCopyText(msg.id, msg.text || msg.content || '')}
                            className="hover:text-zinc-200 flex items-center space-x-0.5"
                            title="テキストをコピー"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">コピー済</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>コピー</span>
                              </>
                            )}
                          </button>

                          {onApplyDraftToAppend && (
                            <button
                              type="button"
                              onClick={() => handleApplyDraft(msg.id, msg.text || msg.content || '')}
                              className="hover:text-emerald-300 flex items-center space-x-0.5 text-zinc-300"
                              title="ノートのクイック追記バーにセット"
                            >
                              {appliedId === msg.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400">追記欄へセット済</span>
                                </>
                              ) : (
                                <>
                                  <ArrowRight className="w-3 h-3" />
                                  <span>追記欄へ</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Message body */}
                    <div className="whitespace-pre-wrap break-words select-text">
                      {msg.text || msg.content || (msg.isStreaming ? '...' : '')}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Status Bar */}
          {statusText && (
            <div className="px-3 py-1 bg-zinc-900/90 border-t border-zinc-800 text-[10px] text-emerald-400 flex items-center space-x-1.5 shrink-0 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>{statusText}</span>
            </div>
          )}

          {/* Input Box & Attachments Area */}
          <div className="border-t border-zinc-800 bg-zinc-900/60 p-2.5 shrink-0 space-y-2">
            {/* Active Context Attachments Pills */}
            <div className="flex items-center flex-wrap gap-1.5 min-h-[22px]">
              {activeAttachments.length > 0 ? (
                activeAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center space-x-1 bg-emerald-950/80 border border-emerald-700/70 hover:border-emerald-500 rounded px-1.5 py-0.5 text-xs text-emerald-300 font-sans transition-colors group"
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewAttachment(att)}
                      className="flex items-center space-x-1 hover:text-white cursor-pointer transition-colors text-left"
                      title="クリックして添付ノート内容をプレビュー・検索・コピー"
                    >
                      <span className="text-[11px]">📎</span>
                      <span className="font-semibold text-[11px] truncate max-w-[170px] underline decoration-dotted underline-offset-2">
                        {att.title}
                      </span>
                      {att.badge && (
                        <span className="text-[9px] bg-emerald-900/90 text-emerald-200 px-1 rounded">
                          {att.badge}
                        </span>
                      )}
                      <Eye className="w-2.5 h-2.5 text-emerald-400 opacity-70 group-hover:opacity-100 ml-0.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att.id)}
                      className="text-emerald-400 hover:text-emerald-100 hover:bg-emerald-900 rounded p-0.5 ml-1 cursor-pointer"
                      title="添付を解除"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))
              ) : (
                getCurrentContextAttachment && (
                  <button
                    type="button"
                    onClick={handleAddCurrentAttachment}
                    className="inline-flex items-center space-x-1 text-[10px] text-zinc-400 hover:text-emerald-300 hover:bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/60 transition-colors"
                    title="現在開いているノートを入力欄に添付"
                  >
                    <Plus className="w-3 h-3 text-emerald-400" />
                    <span>現在のノートを添付</span>
                  </button>
                )
              )}
            </div>

            {/* Text Input Row */}
            <div className="flex space-x-2">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  !isAgentConnected
                    ? '社内PC Bridge Agent 未接続...'
                    : activeAttachments.length > 0
                    ? '添付ノートへの質問・指示を入力 (Enterで送信、Shift+Enterで改行)...'
                    : 'AIへの質問を入力 (Enterで送信、Shift+Enterで改行)...'
                }
                disabled={isExecuting || !isAgentConnected}
                rows={2}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none font-sans"
              />

              <div className="flex flex-col justify-end space-y-1">
                {isExecuting ? (
                  <button
                    type="button"
                    onClick={abort}
                    className="p-2 bg-rose-600 hover:bg-rose-500 text-white rounded transition-colors shadow-sm"
                    title="生成を中断"
                  >
                    <Square className="w-4 h-4 fill-white" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendMessage()}
                    disabled={(!inputText.trim() && activeAttachments.length === 0) || !isAgentConnected}
                    className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded transition-colors shadow-sm"
                    title="送信"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal: Add Project from PC Candidates */}
      {isAddProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setIsAddProjectModalOpen(false)}
          />

          <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-4 z-10 select-none text-zinc-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800 mb-3">
              <div className="flex items-center space-x-1.5">
                <FolderPlus className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm text-zinc-100">社内PCのフォルダを追加</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddProjectModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* PC Candidate List */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>PC候補 ({projectsBaseDir || '~/work'})</span>
                <button
                  type="button"
                  onClick={() => requestProjects()}
                  className="flex items-center space-x-0.5 text-emerald-400 hover:underline"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>再取得</span>
                </button>
              </div>

              {!isAgentConnected ? (
                <div className="text-center py-4 text-xs text-amber-400/80">
                  PCがオフラインのため候補を取得できません
                </div>
              ) : availableProjects.length === 0 ? (
                <div className="text-center py-4 text-xs text-zinc-500">
                  候補フォルダの読み込み中...
                </div>
              ) : (
                availableProjects.map((p) => {
                  const isAlreadyAdded = projects.some((ep) => ep.path === p.path);
                  return (
                    <div
                      key={p.path}
                      onClick={() => {
                        handleAddProject(p);
                        handleSelectProject(p);
                        setIsAddProjectModalOpen(false);
                      }}
                      className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
                        isAlreadyAdded
                          ? 'bg-zinc-900/50 border-zinc-800/60 opacity-60'
                          : 'bg-zinc-950 border-zinc-800 hover:border-emerald-500/60 hover:bg-zinc-900'
                      }`}
                    >
                      <div className="min-w-0 flex-1 mr-2">
                        <div className="flex items-center space-x-1.5">
                          {p.isGit ? (
                            <GitBranch className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <Folder className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                          <span className="text-xs font-medium text-zinc-200 truncate">
                            {p.name}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400 truncate mt-0.5">
                          {p.path}
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        {isAlreadyAdded && (
                          <button
                            type="button"
                            onClick={(e) => handleRemoveProject(e, p.path)}
                            className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 rounded transition-colors"
                            title="このフォルダをリストから削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <span className="text-[10px] px-2 py-1 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                          {isAlreadyAdded ? '選択' : '追加'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Custom Path Input Form */}
            <form onSubmit={handleAddCustomProject} className="pt-2.5 border-t border-zinc-800 space-y-2">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase">
                またはパスを直接入力:
              </div>
              <input
                type="text"
                value={customProjectPath}
                onChange={(e) => setCustomProjectPath(e.target.value)}
                placeholder="/path/to/my-project"
                required
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 font-mono outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
              >
                手動パスで追加
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Context Attachment Preview Modal */}
      <ContextAttachmentModal
        isOpen={Boolean(previewAttachment)}
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </div>
  );
};
