export interface VaultConfig {
  id: string;
  name: string;
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export interface FileNode {
  path: string;
  name: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  children?: FileNode[];
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
