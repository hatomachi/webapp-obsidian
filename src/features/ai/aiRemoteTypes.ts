/**
 * AI Remote Protocol & Attachment Types
 * Compatible with webapp-ai-remote Hub & Agent specifications.
 */

export type AIEngine = 'claude' | 'copilot';
export type TransportMode = 'auto' | 'ws' | 'http';
export type ActiveTransport = 'none' | 'ws' | 'http';

export interface AiRemoteSettings {
  hubUrl: string;
  authToken: string;
  engine: AIEngine;
  model: string;
  transportMode: TransportMode;
}

export const DEFAULT_AI_REMOTE_SETTINGS: AiRemoteSettings = {
  hubUrl: 'ws://localhost:8090/ws/client',
  authToken: '',
  engine: 'claude',
  model: 'claude-opus-4-7',
  transportMode: 'auto',
};

/**
 * Context Attachment attached to a prompt turn
 */
export interface ContextAttachment {
  id: string;
  type: 'current_note' | 'note_selection' | 'channel_log' | 'thread_log' | 'unread_digest' | 'single_post' | 'custom_file';
  title: string;          // e.g. "webapp-obsidian.md"
  badge?: string;          // e.g. "personal-vault"
  subtitle?: string;       // e.g. "10_職人・発明家/webapp-obsidian.md"
  contentMarkdown: string; // The formatted Markdown text injected to prompt
}

/**
 * Project Info compatible with webapp-ai-remote
 */
export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  isGit?: boolean;
}

/**
 * Session Info compatible with webapp-ai-remote
 */
export interface SessionInfo {
  id: string;
  title: string;
  cwd: string;
  projectId?: string;
  engine?: AIEngine;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * LocalStorage Keys compatible with webapp-ai-remote & webapp-mattermost-log
 */
export const AI_REMOTE_STORAGE_KEYS = {
  SETTINGS: 'ai_remote_settings_v1',
  SESSIONS: 'ai_remote_sessions_v1',
  PROJECTS: 'ai_remote_projects_v1',
  MESSAGES_PREFIX: 'ai_remote_msgs_',
  LAST_PROJECT: 'ai_remote_last_project_v1',
  LAST_SESSION: 'ai_remote_last_session_v1',
} as const;

/**
 * Chat message within the AI Drawer
 */
export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  content?: string; // Compatible with Agent ChatMessage
  attachments?: ContextAttachment[];
  isStreaming?: boolean;
  isError?: boolean;
  timestamp: number | string;
  sessionId?: string;
  engine?: AIEngine;
}
