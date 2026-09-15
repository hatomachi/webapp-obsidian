export type GitProvider = 'github' | 'gitlab';

export interface VaultConfig {
  id: string;
  name: string;
  provider?: GitProvider;
  baseUrl?: string;
  owner: string;
  repo: string;
  branch: string;
  token: string;
  lazyLoad?: boolean;
  rootPath?: string;
  ignoredFolders?: string;
}

export interface FileNode {
  path: string;
  name: string;
  type: 'blob' | 'tree' | 'load_more';
  sha: string;
  size?: number;
  children?: FileNode[];
  isLoaded?: boolean;
  isLoading?: boolean;
  nextPage?: number;
  parentPath?: string;
}

export interface FileCacheEntry {
  sha: string;
  content: string;
  updatedAt: number;
}

export interface TOCItem {
  id: string;
  level: number;
  text: string;
}

export interface SearchResult {
  path: string;
  name: string;
  dir: string;
}

export interface UIPreferences {
  enableDesktopSidebar: boolean;
  enableBreadcrumbs: boolean;
  enableRecentNotes: boolean;
  enableFooterNav: boolean;
}

export type CommitType = 'ai' | 'task_toggle' | 'manual';

export interface CommitHistoryItem {
  sha: string;
  shortSha: string;
  message: string;
  summary: string;
  description?: string;
  authorName: string;
  authorEmail?: string;
  authorDate: string;
  authorAvatarUrl?: string;
  htmlUrl: string;
  commitType: CommitType;
}

export interface CommitFileDiff {
  sha: string;
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}
