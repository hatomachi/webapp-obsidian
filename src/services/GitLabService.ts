import { VaultConfig, FileNode, FileCacheEntry, FileFetchResult, CommitHistoryItem, CommitFileDiff, CommitType, RecentUpdatedFile } from '../types';
import {
  utf8ToBase64,
  base64ToBytes,
  decodeBytes,
  isBinaryExtension,
  isBinaryData,
} from '../utils/encoding';

export interface GitLabProjectMetadata {
  id: string;
  defaultBranch: string;
  emptyRepo: boolean;
  name: string;
  pathWithNamespace: string;
  visibility: string;
}

export class GitLabService {
  private static metadataCache = new Map<string, GitLabProjectMetadata>();

  private static getCacheKey(vault: VaultConfig): string {
    const p = vault.provider || 'gitlab';
    return `webapp_obsidian_file_cache_${p}_${vault.owner}_${vault.repo}`;
  }

  private static getLocalCache(vault: VaultConfig): Record<string, FileCacheEntry> {
    try {
      const raw = localStorage.getItem(this.getCacheKey(vault));
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to parse cache from localStorage', e);
    }
    return {};
  }

  private static saveLocalCache(vault: VaultConfig, cache: Record<string, FileCacheEntry>): void {
    try {
      localStorage.setItem(this.getCacheKey(vault), JSON.stringify(cache));
    } catch (e) {
      console.warn('Failed to save cache to localStorage', e);
    }
  }

  /**
   * Resolve GitLab API base URL (e.g. https://gitlab.example.com/api/v4)
   */
  public static getApiBase(vault: VaultConfig): string {
    let base = (vault.baseUrl || '').trim().replace(/\/+$/, '');
    if (!base) {
      base = 'https://gitlab.com';
    }
    if (!base.endsWith('/api/v4')) {
      base = `${base}/api/v4`;
    }
    return base;
  }

  /**
   * Resolve GitLab project identifier (numeric ID or URL-encoded path like "group%2Fproject")
   */
  public static getProjectId(vault: VaultConfig): string {
    const owner = (vault.owner || '').trim();
    const repo = (vault.repo || '').trim();

    if (!owner) {
      return encodeURIComponent(repo);
    }
    // Join owner and repo
    const fullPath = `${owner}/${repo}`.replace(/^\/+|\/+$/g, '');
    return encodeURIComponent(fullPath);
  }

  /**
   * Helper to perform GitLab API requests with proper headers
   */
  private static async apiFetch(
    vault: VaultConfig,
    endpoint: string,
    init: RequestInit = {}
  ): Promise<Response> {
    const base = this.getApiBase(vault);
    const url = `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const headers = new Headers(init.headers || {});
    if (vault.token) {
      headers.set('PRIVATE-TOKEN', vault.token.trim());
      headers.set('Authorization', `Bearer ${vault.token.trim()}`);
    }

    return fetch(url, {
      ...init,
      headers,
    });
  }

  /**
   * Fetch and cache project metadata (numeric ID, default branch, empty_repo status)
   */
  public static async getProjectMetadata(vault: VaultConfig): Promise<GitLabProjectMetadata> {
    const cacheKey = `gitlab_meta_${vault.baseUrl || 'gitlab'}_${vault.owner}_${vault.repo}`;
    if (this.metadataCache.has(cacheKey)) {
      return this.metadataCache.get(cacheKey)!;
    }

    // Try localStorage
    try {
      const saved = localStorage.getItem(cacheKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.id) {
          this.metadataCache.set(cacheKey, parsed);
          return parsed;
        }
      }
    } catch {
      // ignore
    }

    const rawPath = this.getProjectId(vault);
    const res = await this.apiFetch(vault, `/projects/${rawPath}`);
    if (!res.ok) {
      let errMsg = `${res.status} ${res.statusText}`;
      try {
        const errJson = await res.json();
        if (errJson.message) errMsg += ` - ${errJson.message}`;
      } catch {}
      throw new Error(`GitLabプロジェクト "${rawPath}" の取得に失敗しました: ${errMsg}`);
    }

    const data = await res.json();
    const meta: GitLabProjectMetadata = {
      id: String(data.id),
      defaultBranch: data.default_branch || 'master',
      emptyRepo: !!data.empty_repo,
      name: data.name || '',
      pathWithNamespace: data.path_with_namespace || data.name || '',
      visibility: data.visibility || 'Internal',
    };

    this.metadataCache.set(cacheKey, meta);
    try {
      localStorage.setItem(cacheKey, JSON.stringify(meta));
    } catch {}

    return meta;
  }

  /**
   * Comprehensive connection test: checks user, project, empty_repo, and actual repository access
   */
  static async testConnection(vault: VaultConfig): Promise<{
    success: boolean;
    message: string;
    username?: string;
    detectedBranch?: string;
  }> {
    try {
      // 1. Check authenticated user
      const userRes = await this.apiFetch(vault, '/user');
      let username = 'Unknown User';
      if (userRes.ok) {
        const userData = await userRes.json();
        username = userData.username || userData.name || username;
      }

      // 2. Check project
      const meta = await this.getProjectMetadata(vault);

      if (meta.emptyRepo) {
        return {
          success: false,
          message: `プロジェクト「${meta.pathWithNamespace}」は接続成功しましたが、空のリポジトリ（コミットなし）です。初期コミットを作成してください。`,
          username,
        };
      }

      // 3. Test actual repository access (tree endpoint)
      // Candidate branches to try: vault.branch -> meta.defaultBranch -> master -> main
      const candidateBranches: string[] = [];
      if (vault.branch && vault.branch.trim()) {
        candidateBranches.push(vault.branch.trim());
      }
      if (meta.defaultBranch && !candidateBranches.includes(meta.defaultBranch)) {
        candidateBranches.push(meta.defaultBranch);
      }
      if (!candidateBranches.includes('master')) candidateBranches.push('master');
      if (!candidateBranches.includes('main')) candidateBranches.push('main');

      let treeSuccess = false;
      let successfulBranch = '';
      let lastError = '';

      for (const b of candidateBranches) {
        const testRes = await this.apiFetch(vault, `/projects/${meta.id}/repository/tree?ref=${encodeURIComponent(b)}&per_page=1`);
        if (testRes.ok) {
          treeSuccess = true;
          successfulBranch = b;
          break;
        } else {
          try {
            const errData = await testRes.json();
            lastError = errData.message || `${testRes.status} ${testRes.statusText}`;
          } catch {
            lastError = `${testRes.status} ${testRes.statusText}`;
          }
        }
      }

      // If branch-specific query failed, try without ref parameter (GitLab defaults to project's default branch)
      if (!treeSuccess) {
        const testNoRefRes = await this.apiFetch(vault, `/projects/${meta.id}/repository/tree?per_page=1`);
        if (testNoRefRes.ok) {
          treeSuccess = true;
          successfulBranch = meta.defaultBranch || 'master';
        }
      }

      if (!treeSuccess) {
        return {
          success: false,
          message: `プロジェクトは見つかりましたが、リポジトリへのアクセスでエラーになりました (${lastError})。PATに「read_repository」または「api」権限があるか、ブランチ名をご確認ください。`,
          username,
        };
      }

      let branchNotice = `ブランチ: ${successfulBranch}`;
      if (vault.branch && vault.branch.trim() !== successfulBranch) {
        branchNotice += ` (指定の "${vault.branch}" が無いため自動切替)`;
      }

      return {
        success: true,
        message: `接続成功: ${meta.pathWithNamespace} [ID: ${meta.id}] (${branchNotice})`,
        username,
        detectedBranch: successfulBranch,
      };
    } catch (e: any) {
      console.error('GitLab connection test failed:', e);
      return {
        success: false,
        message: e.message || '接続に失敗しました。サーバーURL、プロジェクト名、Tokenを確認してください。',
      };
    }
  }

  /**
   * Get cached content immediately from localStorage for SWR initial rendering
   */
  static getCachedContent(vault: VaultConfig, filePath: string): FileCacheEntry | null {
    const cache = this.getLocalCache(vault);
    return cache[filePath] || null;
  }

  /**
   * Helper to get list of ignored folders
   */
  private static getIgnoredFolderList(vault: VaultConfig): string[] {
    const defaultIgnored = ['.obsidian', '.git', '.gitlab', '.github', '.vscode', '.trash'];
    const userIgnored = (vault.ignoredFolders || '')
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/^\/+|\/+$/g, ''))
      .filter(Boolean);
    return [...defaultIgnored, ...userIgnored];
  }

  /**
   * Fetch file tree using GitLab Repository Tree API.
   * Supports lazy loading (root only) for huge repositories and auto-fallback on timeout.
   */
  static async fetchFileTree(vault: VaultConfig, force: boolean = false): Promise<FileNode[]> {
    const isLazy = !!vault.lazyLoad;

    if (isLazy) {
      return this.fetchRootTreeOnly(vault, force);
    }

    try {
      return await this.fetchFullRecursiveTree(vault, force);
    } catch (e: any) {
      console.warn('GitLab full tree fetch failed or timed out. Falling back to lazy loading mode:', e);
      return this.fetchRootTreeOnly(vault, force);
    }
  }

  /**
   * Fetch full recursive tree for GitLab (with page limit & timeout guard)
   */
  private static async fetchFullRecursiveTree(vault: VaultConfig, force: boolean): Promise<FileNode[]> {
    const meta = await this.getProjectMetadata(vault);
    const projectId = meta.id;

    let targetBranch = (vault.branch || '').trim() || meta.defaultBranch || 'master';
    let allItems: Array<{ id: string; name: string; type: string; path: string; mode: string }> = [];
    let page = 1;
    const perPage = 100;
    const maxPages = 25; // Guard against 100+ pages of media

    const buildEndpoint = (p: number, b?: string) => {
      const refQuery = b ? `ref=${encodeURIComponent(b)}&` : '';
      return `/projects/${projectId}/repository/tree?${refQuery}recursive=true&per_page=${perPage}&page=${p}`;
    };

    // First page request
    let res = await this.apiFetch(vault, buildEndpoint(page, targetBranch), {
      headers: force
        ? { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' }
        : undefined,
    });

    // Smart fallback if branch resulted in 404
    if (!res.ok && res.status === 404) {
      console.warn(`GitLab tree 404 with ref="${targetBranch}", trying default branch...`);
      let fallbackRes = await this.apiFetch(vault, buildEndpoint(page), {
        headers: force
          ? { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' }
          : undefined,
      });

      if (fallbackRes.ok) {
        res = fallbackRes;
        targetBranch = '';
      } else if (meta.defaultBranch && meta.defaultBranch !== targetBranch) {
        fallbackRes = await this.apiFetch(vault, buildEndpoint(page, meta.defaultBranch), {
          headers: force
            ? { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' }
            : undefined,
        });
        if (fallbackRes.ok) {
          res = fallbackRes;
          targetBranch = meta.defaultBranch;
        }
      }
    }

    if (!res.ok) {
      let errDetail = `${res.status} ${res.statusText}`;
      try {
        const errJson = await res.json();
        if (errJson.message) errDetail += ` - ${errJson.message}`;
      } catch {}
      throw new Error(`GitLabツリーの取得に失敗しました (${errDetail})。`);
    }

    // Fetch pages with max limit
    while (page <= maxPages) {
      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) {
        break;
      }

      allItems = allItems.concat(items);

      const nextPage = res.headers.get('x-next-page');
      if (nextPage && parseInt(nextPage, 10) > page) {
        page = parseInt(nextPage, 10);
      } else if (items.length < perPage) {
        break;
      } else {
        page++;
      }

      if (page > maxPages) {
        console.warn(`GitLab tree exceeded max page limit (${maxPages}). Repository is too large for recursive fetch. Falling back to lazy load.`);
        throw new Error(`リポジトリの項目数が多すぎるため（${maxPages * perPage}件超過）、遅延読み込みモードに自動切替します。`);
      }

      res = await this.apiFetch(vault, buildEndpoint(page, targetBranch), {
        headers: force
          ? { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' }
          : undefined,
      });

      if (!res.ok) break;
    }

    const ignoredList = this.getIgnoredFolderList(vault);
    const nodes: FileNode[] = [];
    const pathMap = new Map<string, FileNode>();

    for (const item of allItems) {
      if (!item.path || !item.id) continue;

      const parts = item.path.split('/');
      if (parts.some((p) => p.startsWith('.') || ignoredList.includes(p.toLowerCase()))) {
        continue;
      }

      const isTree = item.type === 'tree';

      const fileName = parts[parts.length - 1];

      const node: FileNode = {
        path: item.path,
        name: fileName,
        type: isTree ? 'tree' : 'blob',
        sha: item.id,
        children: isTree ? [] : undefined,
        isLoaded: true,
      };

      pathMap.set(item.path, node);
    }

    // Build hierarchy
    for (const [path, node] of pathMap.entries()) {
      const parts = path.split('/');
      if (parts.length === 1) {
        nodes.push(node);
      } else {
        const parentPath = parts.slice(0, -1).join('/');
        const parentNode = pathMap.get(parentPath);
        if (parentNode && parentNode.children) {
          parentNode.children.push(node);
        } else {
          nodes.push(node);
        }
      }
    }

    this.sortNodes(nodes);
    return nodes;
  }

  /**
   * Fetch root/top-level tree only for GitLab
   */
  /**
   * Fetch root/top-level tree only for GitLab with load_more support
   */
  private static async fetchRootTreeOnly(
    vault: VaultConfig,
    force: boolean,
    page: number = 1
  ): Promise<FileNode[]> {
    const meta = await this.getProjectMetadata(vault);
    const projectId = meta.id;
    const targetBranch = (vault.branch || '').trim() || meta.defaultBranch || 'master';

    const refQuery = targetBranch ? `ref=${encodeURIComponent(targetBranch)}&` : '';
    const endpoint = `/projects/${projectId}/repository/tree?${refQuery}recursive=false&per_page=100&page=${page}`;

    const res = await this.apiFetch(vault, endpoint, {
      headers: force
        ? { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' }
        : undefined,
    });

    if (!res.ok) {
      throw new Error(`GitLabルートツリーの取得に失敗しました: ${res.status} ${res.statusText}`);
    }

    const items = await res.json();
    const ignoredList = this.getIgnoredFolderList(vault);
    const nodes: FileNode[] = [];

    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item.path || !item.id) continue;

        const itemName = item.name || item.path.split('/').pop() || item.path;
        if (itemName.startsWith('.') || ignoredList.includes(itemName.toLowerCase())) {
          continue;
        }

        const isTree = item.type === 'tree';

        nodes.push({
          path: item.path,
          name: itemName,
          type: isTree ? 'tree' : 'blob',
          sha: item.id,
          children: isTree ? [] : undefined,
          isLoaded: !isTree,
        });
      }
    }

    this.sortNodes(nodes);

    // If there are more pages, append a load_more virtual node
    const nextPageHeader = res.headers.get('x-next-page');
    if (nextPageHeader) {
      const nextPageNum = parseInt(nextPageHeader, 10);
      if (nextPageNum > page) {
        nodes.push({
          path: `__root__load_more_${nextPageNum}`,
          name: 'さらに読み込む...',
          type: 'load_more',
          sha: '',
          nextPage: nextPageNum,
          parentPath: '',
        });
      }
    }

    return nodes;
  }

  /**
   * Fetch children of a specific directory on demand in GitLab with load_more support
   */
  static async fetchDirectoryChildren(
    vault: VaultConfig,
    folderPath: string,
    startPage: number = 1
  ): Promise<FileNode[]> {
    const meta = await this.getProjectMetadata(vault);
    const projectId = meta.id;
    const targetBranch = (vault.branch || '').trim() || meta.defaultBranch || 'master';

    const refQuery = targetBranch ? `ref=${encodeURIComponent(targetBranch)}&` : '';
    const cleanPath = folderPath
      .split('/')
      .map((p) => encodeURIComponent(p))
      .join('/');
    const pathQuery = `path=${cleanPath}&`;

    const ignoredList = this.getIgnoredFolderList(vault);
    const children: FileNode[] = [];
    let page = startPage;
    const maxFetchPages = 2; // Fetch up to 2 pages (200 items) per click to find markdown files
    let lastNextPage: number | null = null;

    for (let i = 0; i < maxFetchPages; i++) {
      const endpoint = `/projects/${projectId}/repository/tree?${refQuery}${pathQuery}recursive=false&per_page=100&page=${page}`;
      const res = await this.apiFetch(vault, endpoint);
      if (!res.ok) {
        if (i === 0 && startPage === 1) {
          throw new Error(`GitLabディレクトリ "${folderPath}" の取得に失敗しました: ${res.status} ${res.statusText}`);
        }
        break;
      }

      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) {
        lastNextPage = null;
        break;
      }

      for (const item of items) {
        if (!item.path || !item.id) continue;

        const itemName = item.name || item.path.split('/').pop() || item.path;
        if (itemName.startsWith('.') || ignoredList.includes(itemName.toLowerCase())) {
          continue;
        }

        const isTree = item.type === 'tree';

        children.push({
          path: item.path,
          name: itemName,
          type: isTree ? 'tree' : 'blob',
          sha: item.id,
          children: isTree ? [] : undefined,
          isLoaded: !isTree,
        });
      }

      const nextPageHeader = res.headers.get('x-next-page');
      if (nextPageHeader && parseInt(nextPageHeader, 10) > page) {
        lastNextPage = parseInt(nextPageHeader, 10);
        page = lastNextPage;
        // If we already found some markdown files in this pass, stop and show load_more
        if (children.some((c) => c.type === 'blob')) {
          break;
        }
      } else {
        lastNextPage = null;
        break;
      }
    }

    this.sortNodes(children);

    // If more pages exist, append load_more virtual node
    if (lastNextPage) {
      children.push({
        path: `${folderPath}__load_more_${lastNextPage}`,
        name: 'さらに読み込む...',
        type: 'load_more',
        sha: '',
        nextPage: lastNextPage,
        parentPath: folderPath,
      });
    }

    return children;
  }

  /**
   * Fetch more items for a directory or root (Load More)
   */
  static async fetchMoreItems(
    vault: VaultConfig,
    parentPath: string,
    page: number
  ): Promise<FileNode[]> {
    if (!parentPath) {
      return this.fetchRootTreeOnly(vault, false, page);
    }
    return this.fetchDirectoryChildren(vault, parentPath, page);
  }

  /**
   * Helper to sort file tree nodes (directories first, then alphabetical)
   */
  private static sortNodes(list: FileNode[]): void {
    list.sort((a, b) => {
      if (a.type === 'tree' && b.type !== 'tree') return -1;
      if (a.type !== 'tree' && b.type === 'tree') return 1;
      return a.name.localeCompare(b.name, 'ja', { numeric: true });
    });
    for (const item of list) {
      if (item.children && item.children.length > 0) {
        this.sortNodes(item.children);
      }
    }
  }

  /**
   * Fetch file content with SWR cache and blob raw fallback
   */
  static async fetchFileContent(
    vault: VaultConfig,
    filePath: string,
    options?: {
      fileSha?: string;
      force?: boolean;
    }
  ): Promise<FileFetchResult> {
    const { fileSha, force = false } = options || {};
    const cache = this.getLocalCache(vault);
    const cachedEntry = cache[filePath];

    if (!force && cachedEntry && fileSha && cachedEntry.sha === fileSha) {
      return {
        content: cachedEntry.content,
        sha: cachedEntry.sha,
        fromCache: true,
        rawBase64: cachedEntry.rawBase64,
        isBinary: cachedEntry.isBinary,
      };
    }

    const meta = await this.getProjectMetadata(vault);
    const projectId = meta.id;
    const branch = encodeURIComponent(vault.branch?.trim() || meta.defaultBranch || 'master');
    const encodedFilePath = encodeURIComponent(filePath);

    // 1. Try standard repository files API
    const endpoint = `/projects/${projectId}/repository/files/${encodedFilePath}?ref=${branch}`;
    let res = await this.apiFetch(vault, endpoint, {
      headers: force
        ? { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' }
        : undefined,
    });

    // If 404, try with meta.defaultBranch if different
    if (!res.ok && res.status === 404 && meta.defaultBranch && branch !== encodeURIComponent(meta.defaultBranch)) {
      const fallbackEndpoint = `/projects/${projectId}/repository/files/${encodedFilePath}?ref=${encodeURIComponent(meta.defaultBranch)}`;
      const fallbackRes = await this.apiFetch(vault, fallbackEndpoint);
      if (fallbackRes.ok) {
        res = fallbackRes;
      }
    }

    // 2. Fallback: If 404 (commonly triggered when reverse proxies decode %2F in filePath) and we have fileSha from tree,
    // fetch raw blob directly via /repository/blobs/:sha/raw (pure hash, no %2F or slashes in URL!)
    if (!res.ok && res.status === 404 && fileSha) {
      const blobEndpoint = `/projects/${projectId}/repository/blobs/${encodeURIComponent(fileSha)}/raw`;
      const blobRes = await this.apiFetch(vault, blobEndpoint, {
        headers: force
          ? { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' }
          : undefined,
      });

      if (blobRes.ok) {
        const buffer = await blobRes.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binaryStr = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binaryStr += String.fromCharCode(bytes[i]);
        }
        const rawBase64 = window.btoa(binaryStr);
        const isBin = isBinaryExtension(filePath) || isBinaryData(bytes);
        const textContent = isBin ? '' : decodeBytes(bytes, 'utf-8');

        cache[filePath] = {
          sha: fileSha,
          content: textContent,
          updatedAt: Date.now(),
          rawBase64: rawBase64.length < 500000 ? rawBase64 : undefined,
          isBinary: isBin,
        };
        this.saveLocalCache(vault, cache);

        return {
          content: textContent,
          sha: fileSha,
          fromCache: false,
          rawBase64,
          isBinary: isBin,
          size: bytes.length,
        };
      }
    }

    if (!res.ok) {
      let errDetail = `${res.status} ${res.statusText}`;
      try {
        const errJson = await res.json();
        if (errJson.message) errDetail += ` - ${errJson.message}`;
      } catch {}
      throw new Error(`GitLabファイルの取得に失敗しました: ${errDetail}`);
    }

    const data = await res.json();
    let rawBase64 = '';
    let bytes: Uint8Array;

    if (data.encoding === 'base64' && data.content) {
      rawBase64 = data.content.replace(/\s/g, '');
      bytes = base64ToBytes(rawBase64);
    } else if (typeof data.content === 'string') {
      const text = data.content;
      rawBase64 = utf8ToBase64(text);
      bytes = base64ToBytes(rawBase64);
    } else {
      bytes = new Uint8Array(0);
    }

    const isBin = isBinaryExtension(filePath) || isBinaryData(bytes);
    const textContent = isBin ? '' : decodeBytes(bytes, 'utf-8');
    const fileShaResult = data.blob_id || data.last_commit_id || data.commit_id || '';
    const fileSize = data.size || bytes.length;

    // Save to cache
    cache[filePath] = {
      sha: fileShaResult,
      content: textContent,
      updatedAt: Date.now(),
      rawBase64: rawBase64.length < 500000 ? rawBase64 : undefined,
      isBinary: isBin,
    };
    this.saveLocalCache(vault, cache);

    return {
      content: textContent,
      sha: fileShaResult,
      fromCache: false,
      rawBase64,
      isBinary: isBin,
      size: fileSize,
    };
  }

  /**
   * Save whole file content (create or update) with Commits API fallback
   */
  static async saveFile(
    vault: VaultConfig,
    filePath: string,
    newContent: string,
    _currentSha?: string,
    commitMessage?: string
  ): Promise<{ newSha: string }> {
    const meta = await this.getProjectMetadata(vault);
    const projectId = meta.id;
    const encodedFilePath = encodeURIComponent(filePath);
    const base64Content = utf8ToBase64(newContent);
    const branch = vault.branch?.trim() || meta.defaultBranch || 'master';

    const payload = {
      branch,
      commit_message: commitMessage || `docs: update ${filePath} via Obsidian Web`,
      content: base64Content,
      encoding: 'base64',
    };

    // Try updating existing file with PUT
    let res = await this.apiFetch(vault, `/projects/${projectId}/repository/files/${encodedFilePath}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // If 404: file might not exist yet, OR reverse proxy decoded %2F in URL path.
    // Try GitLab Commits API (which places file_path in request body JSON, avoiding URL %2F issues completely)
    if (res.status === 404) {
      const updateCommitPayload = {
        branch,
        commit_message: commitMessage || `docs: update ${filePath} via Obsidian Web`,
        actions: [
          {
            action: 'update',
            file_path: filePath,
            content: base64Content,
            encoding: 'base64',
          },
        ],
      };

      let commitRes = await this.apiFetch(vault, `/projects/${projectId}/repository/commits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateCommitPayload),
      });

      if (commitRes.ok) {
        res = commitRes;
      } else {
        const createCommitPayload = {
          branch,
          commit_message: commitMessage || `docs: create ${filePath} via Obsidian Web`,
          actions: [
            {
              action: 'create',
              file_path: filePath,
              content: base64Content,
              encoding: 'base64',
            },
          ],
        };

        const createRes = await this.apiFetch(vault, `/projects/${projectId}/repository/commits`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(createCommitPayload),
        });

        if (createRes.ok) {
          res = createRes;
        }
      }
    }

    if (!res.ok) {
      let errDetail = `${res.status} ${res.statusText}`;
      try {
        const errJson = await res.json();
        if (errJson.message) errDetail += ` - ${errJson.message}`;
      } catch {}
      throw new Error(`GitLabファイルの保存に失敗しました: ${errDetail}`);
    }

    // Refresh file info to get latest blob_id/commit_id
    let newSha = '';
    try {
      const refreshed = await this.fetchFileContent(vault, filePath, { force: true });
      newSha = refreshed.sha;
    } catch {
      newSha = Date.now().toString();
    }

    // Update cache
    const cache = this.getLocalCache(vault);
    cache[filePath] = {
      sha: newSha,
      content: newContent,
      updatedAt: Date.now(),
    };
    this.saveLocalCache(vault, cache);

    return { newSha };
  }

  private static diffCache = new Map<string, CommitFileDiff>();

  /**
   * Helper to detect commit type (AI, task toggle, or manual)
   */
  private static detectCommitType(message: string, authorName: string = ''): CommitType {
    const lowerMsg = message.toLowerCase();
    const lowerAuthor = authorName.toLowerCase();

    // Checklist task toggle via this webapp
    if (lowerMsg.includes('toggle task in') || lowerMsg.includes('via obsidian web')) {
      return 'task_toggle';
    }

    // AI commit patterns
    const aiKeywords = [
      'antigravity',
      'ai:',
      'ai(',
      '[ai]',
      'docs(strategy)',
      'update strategy',
      '🤖',
      'assistant',
      'agent',
      'copilot',
      'gemini',
      'claude',
      'cursor',
    ];
    if (aiKeywords.some((kw) => lowerMsg.includes(kw))) {
      return 'ai';
    }

    const aiAuthors = ['antigravity', 'bot', 'gitlab-ci', 'gitlab-bot', 'ai'];
    if (aiAuthors.some((auth) => lowerAuthor.includes(auth))) {
      return 'ai';
    }

    return 'manual';
  }

  /**
   * Fetch commit history for a specific file with smart branch & path fallback
   */
  static async fetchFileCommits(
    vault: VaultConfig,
    filePath: string,
    perPage: number = 30
  ): Promise<CommitHistoryItem[]> {
    const meta = await this.getProjectMetadata(vault);
    const projectId = meta.id;
    const cleanPath = filePath.replace(/^\/+/, '').trim();

    // Candidate branches to try:
    // 1. Configured vault.branch (user setting)
    // 2. Project defaultBranch from metadata (GitLab default)
    // 3. undefined (omit ref_name param completely -> GitLab server resolves to repository default branch)
    // 4. Fallbacks: 'master', 'main'
    const candidateBranches: (string | undefined)[] = [];
    const configuredBranch = vault.branch?.trim();
    if (configuredBranch) candidateBranches.push(configuredBranch);
    if (meta.defaultBranch && !candidateBranches.includes(meta.defaultBranch)) {
      candidateBranches.push(meta.defaultBranch);
    }
    // undefined represents omitting ref_name parameter
    candidateBranches.push(undefined);
    if (!candidateBranches.includes('master')) candidateBranches.push('master');
    if (!candidateBranches.includes('main')) candidateBranches.push('main');

    // Path formats to try:
    // A. encodeURIComponent(cleanPath) -> slashes become %2F
    // B. cleanPath (raw slashes) -> some proxies or GitLab setups require raw slashes in query params
    const encodedA = encodeURIComponent(cleanPath);
    const encodedB = cleanPath;
    const pathFormats = encodedA === encodedB ? [encodedA] : [encodedA, encodedB];

    let res: Response | null = null;
    let successfulBranch: string | undefined = undefined;
    let successfulPath: string | undefined = undefined;

    branchLoop: for (const branch of candidateBranches) {
      for (const pathParam of pathFormats) {
        const refQuery = branch ? `&ref_name=${encodeURIComponent(branch)}` : '';
        const endpoint = `/projects/${projectId}/repository/commits?path=${pathParam}${refQuery}&per_page=${perPage}`;

        try {
          const tryRes = await this.apiFetch(vault, endpoint);
          if (tryRes.ok) {
            res = tryRes;
            successfulBranch = branch;
            successfulPath = pathParam;
            break branchLoop;
          } else if (tryRes.status === 404) {
            console.debug(`[GitLabService] fetchFileCommits 404 with path="${pathParam}", ref_name="${branch}". Trying fallback...`);
          } else {
            // Non-404 error (e.g. 401 Unauthorized, 403 Forbidden, 500 Server Error)
            res = tryRes;
            break branchLoop;
          }
        } catch (fetchErr) {
          console.warn('[GitLabService] commit fetch attempt error:', fetchErr);
        }
      }
    }

    if (successfulBranch !== undefined || successfulPath !== undefined) {
      console.info(`[GitLabService] Commits resolved successfully: branch="${successfulBranch ?? '(default)'}", path="${successfulPath}"`);
    }

    if (!res || !res.ok) {
      // If the final status was 404 across all candidates, the file might not have any commits
      // on the checked branches, or GitLab returns 404 for empty results on that path.
      // Return an empty list gracefully so the UI displays "コミット履歴が見つかりませんでした"
      // rather than throwing a blocking error.
      if (res && res.status === 404) {
        console.warn(`[GitLabService] No commits found (404) for "${cleanPath}" across all candidate branches. Returning empty list.`);
        return [];
      }
      const statusDetail = res ? `${res.status} ${res.statusText}` : '通信エラー';
      throw new Error(`GitLabコミット履歴の取得に失敗しました: ${statusDetail}`);
    }

    const data: any[] = await res.json();
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((item) => {
      const fullMessage = item.message || '';
      const lines = fullMessage.split('\n');
      const summary = item.title || lines[0] || '(No commit message)';
      const description = lines.slice(1).join('\n').trim() || undefined;

      const authorName = item.author_name || 'Unknown';
      const authorEmail = item.author_email || undefined;
      const authorDate = item.authored_date || item.created_at || new Date().toISOString();
      const htmlUrl = item.web_url;

      const commitType = this.detectCommitType(fullMessage, authorName);

      return {
        sha: item.id,
        shortSha: item.short_id || item.id.slice(0, 7),
        message: fullMessage,
        summary,
        description,
        authorName,
        authorEmail,
        authorDate,
        htmlUrl,
        commitType,
      };
    });
  }

  /**
   * Fetch diff and changes for a specific file in a commit
   */
  static async fetchCommitFileDiff(
    vault: VaultConfig,
    commitSha: string,
    filePath: string
  ): Promise<CommitFileDiff | null> {
    const cleanPath = filePath.replace(/^\/+/, '').trim();
    const cacheKey = `${vault.owner}/${vault.repo}/${commitSha}/${cleanPath}`;
    if (this.diffCache.has(cacheKey)) {
      return this.diffCache.get(cacheKey)!;
    }

    const meta = await this.getProjectMetadata(vault);
    const projectId = meta.id;
    const endpoint = `/projects/${projectId}/repository/commits/${encodeURIComponent(commitSha)}/diff`;
    const res = await this.apiFetch(vault, endpoint);

    if (!res.ok) {
      console.warn(`[GitLabService] commit diff fetch failed (${res.status} ${res.statusText}) for sha=${commitSha}`);
      return null;
    }

    const diffList: any[] = await res.json();
    if (!Array.isArray(diffList)) {
      return null;
    }

    const fileDiff = diffList.find((d) => {
      const newP = (d.new_path || '').replace(/^\/+/, '');
      const oldP = (d.old_path || '').replace(/^\/+/, '');
      return (
        newP === cleanPath ||
        oldP === cleanPath ||
        newP === filePath ||
        oldP === filePath
      );
    });

    if (!fileDiff) {
      return null;
    }

    let additions = 0;
    let deletions = 0;
    const patch = fileDiff.diff || '';
    const patchLines = patch.split('\n');
    for (const line of patchLines) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions++;
      else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
    }

    const status = fileDiff.new_file ? 'added' : fileDiff.deleted_file ? 'deleted' : fileDiff.renamed_file ? 'renamed' : 'modified';

    const diff: CommitFileDiff = {
      sha: commitSha,
      filename: fileDiff.new_path || cleanPath,
      status,
      additions,
      deletions,
      changes: additions + deletions,
      patch,
    };

    this.diffCache.set(cacheKey, diff);
    return diff;
  }

  /**
   * Fetch recently updated files from repository commits
   */
  static async fetchRecentUpdatedFiles(
    vault: VaultConfig,
    limit: number = 8
  ): Promise<RecentUpdatedFile[]> {
    try {
      const meta = await this.getProjectMetadata(vault);
      const projectId = meta.id;

      // Candidate branches
      const candidateBranches: (string | undefined)[] = [];
      const configuredBranch = vault.branch?.trim();
      if (configuredBranch) candidateBranches.push(configuredBranch);
      if (meta.defaultBranch && !candidateBranches.includes(meta.defaultBranch)) {
        candidateBranches.push(meta.defaultBranch);
      }
      candidateBranches.push(undefined);

      let commits: any[] = [];
      for (const branch of candidateBranches) {
        const refQuery = branch ? `&ref_name=${encodeURIComponent(branch)}` : '';
        const endpoint = `/projects/${projectId}/repository/commits?per_page=${Math.min(limit * 2, 15)}${refQuery}`;
        const res = await this.apiFetch(vault, endpoint);
        if (res.ok) {
          commits = await res.json();
          if (Array.isArray(commits) && commits.length > 0) {
            break;
          }
        }
      }

      if (!commits || commits.length === 0) {
        return [];
      }

      // Fetch diffs for each commit in parallel
      const diffResults = await Promise.all(
        commits.map(async (c) => {
          try {
            const res = await this.apiFetch(vault, `/projects/${projectId}/repository/commits/${c.id}/diff`);
            if (res.ok) {
              const diffs = await res.json();
              return { commit: c, diffs: Array.isArray(diffs) ? diffs : [] };
            }
          } catch (e) {
            console.warn(`[GitLabService] Failed to fetch diff for commit ${c.id}`, e);
          }
          return { commit: c, diffs: [] };
        })
      );

      // Extract unique files
      const result: RecentUpdatedFile[] = [];
      const seenPaths = new Set<string>();

      for (const { commit, diffs } of diffResults) {
        const fullMessage = commit.title || commit.message || '';
        const summary = fullMessage.split('\n')[0] || '';
        const authorName = commit.author_name || 'Unknown';
        const authorDate = commit.committed_date || commit.created_at || new Date().toISOString();
        const commitType = this.detectCommitType(fullMessage, authorName);

        for (const diffItem of diffs) {
          const filePath = (diffItem.new_path || diffItem.old_path || '').replace(/^\/+/, '');
          if (!filePath) continue;

          // Skip hidden / system files
          if (filePath.startsWith('.git') || filePath.startsWith('.gitlab/')) continue;
          // Skip deleted files
          if (diffItem.deleted_file) continue;
          // Skip binary files
          if (isBinaryExtension(filePath)) continue;

          if (!seenPaths.has(filePath)) {
            seenPaths.add(filePath);
            result.push({
              path: filePath,
              commitSha: commit.id,
              commitMessage: summary,
              authorName,
              authorDate,
              commitType,
            });

            if (result.length >= limit) {
              break;
            }
          }
        }

        if (result.length >= limit) {
          break;
        }
      }

      return result;
    } catch (e) {
      console.warn('[GitLabService] fetchRecentUpdatedFiles failed', e);
      return [];
    }
  }
}

