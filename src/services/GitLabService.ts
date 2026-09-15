import { VaultConfig, FileNode, FileCacheEntry, CommitHistoryItem, CommitFileDiff, CommitType } from '../types';
import { utf8ToBase64, base64ToUtf8 } from '../utils/encoding';

export class GitLabService {
  private static numericIdCache = new Map<string, string>();

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
   * Resolve numeric project ID to avoid %2F reverse proxy decoding issues in URLs
   */
  public static async resolveProjectId(vault: VaultConfig): Promise<string> {
    const trimmedRepo = (vault.repo || '').trim();
    // If repo is already a numeric ID, use it directly
    if (/^\d+$/.test(trimmedRepo)) {
      return trimmedRepo;
    }

    const cacheKey = `gitlab_numeric_id_${vault.baseUrl || 'gitlab'}_${vault.owner}_${vault.repo}`;
    if (this.numericIdCache.has(cacheKey)) {
      return this.numericIdCache.get(cacheKey)!;
    }

    try {
      const saved = localStorage.getItem(cacheKey);
      if (saved && /^\d+$/.test(saved)) {
        this.numericIdCache.set(cacheKey, saved);
        return saved;
      }
    } catch {
      // ignore
    }

    // Query project info to obtain numeric ID
    try {
      const rawPath = this.getProjectId(vault);
      const res = await this.apiFetch(vault, `/projects/${rawPath}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          const idStr = String(data.id);
          this.numericIdCache.set(cacheKey, idStr);
          try {
            localStorage.setItem(cacheKey, idStr);
          } catch {
            // ignore
          }
          return idStr;
        }
      }
    } catch (e) {
      console.warn('Failed to resolve GitLab numeric project ID:', e);
    }

    // Fallback to raw encoded path if resolution fails
    return this.getProjectId(vault);
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
   * Test connection to GitLab with Vault settings
   */
  static async testConnection(vault: VaultConfig): Promise<{ success: boolean; message: string; username?: string }> {
    try {
      const projectId = this.getProjectId(vault);

      // 1. Check authenticated user info
      const userRes = await this.apiFetch(vault, '/user');
      let username = 'Unknown User';
      if (userRes.ok) {
        const userData = await userRes.json();
        username = userData.username || userData.name || username;
      }

      // 2. Check project accessibility
      const projectRes = await this.apiFetch(vault, `/projects/${projectId}`);
      if (!projectRes.ok) {
        let errMsg = `プロジェクトへのアクセスに失敗しました (${projectRes.status} ${projectRes.statusText})`;
        try {
          const errData = await projectRes.json();
          if (errData.message || errData.error) {
            errMsg += `: ${errData.message || errData.error}`;
          }
        } catch {
          // ignore
        }
        return {
          success: false,
          message: errMsg,
        };
      }

      const project = await projectRes.json();
      const visibility = project.visibility ? project.visibility : 'Internal';

      // Cache the numeric project ID immediately
      if (project && project.id) {
        const cacheKey = `gitlab_numeric_id_${vault.baseUrl || 'gitlab'}_${vault.owner}_${vault.repo}`;
        const idStr = String(project.id);
        this.numericIdCache.set(cacheKey, idStr);
        try {
          localStorage.setItem(cacheKey, idStr);
        } catch {
          // ignore
        }
      }

      return {
        success: true,
        message: `接続成功: ${project.path_with_namespace || project.name} (${visibility}) [ID: ${project.id}]`,
        username,
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
   * Fetch file tree recursively using GitLab Repository Tree API
   */
  static async fetchFileTree(vault: VaultConfig, force: boolean = false): Promise<FileNode[]> {
    const projectId = await this.resolveProjectId(vault);
    const branch = encodeURIComponent(vault.branch || 'main');

    let allItems: Array<{ id: string; name: string; type: string; path: string; mode: string }> = [];
    let page = 1;
    const perPage = 100;

    // Fetch all pages
    while (true) {
      const endpoint = `/projects/${projectId}/repository/tree?ref=${branch}&recursive=true&per_page=${perPage}&page=${page}`;
      const res = await this.apiFetch(vault, endpoint, {
        headers: force
          ? { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' }
          : undefined,
      });

      if (!res.ok) {
        let errDetail = `${res.status} ${res.statusText}`;
        try {
          const errJson = await res.json();
          if (errJson.message) errDetail += ` - ${errJson.message}`;
        } catch {
          // ignore
        }
        throw new Error(`GitLabツリーの取得に失敗しました: ${errDetail}`);
      }

      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) {
        break;
      }

      allItems = allItems.concat(items);

      // Check if there are more pages
      const nextPage = res.headers.get('x-next-page');
      if (nextPage && parseInt(nextPage, 10) > page) {
        page = parseInt(nextPage, 10);
      } else if (items.length < perPage) {
        break;
      } else {
        page++;
      }
    }

    const ignoredPrefixes = ['.obsidian/', '.git/', '.gitlab/', '.github/', '.vscode/', '.trash/'];
    const nodes: FileNode[] = [];
    const pathMap = new Map<string, FileNode>();

    for (const item of allItems) {
      if (!item.path || !item.id) continue;

      // Skip internal hidden/system directories
      if (ignoredPrefixes.some((p) => item.path.startsWith(p) || item.path.includes('/' + p))) {
        continue;
      }
      if (item.path.startsWith('.')) continue;

      const isTree = item.type === 'tree';
      // Only keep markdown or folders
      if (!isTree && !item.path.endsWith('.md')) {
        continue;
      }

      const parts = item.path.split('/');
      const fileName = parts[parts.length - 1];

      const node: FileNode = {
        path: item.path,
        name: fileName,
        type: isTree ? 'tree' : 'blob',
        sha: item.id,
        children: isTree ? [] : undefined,
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
          // Fallback if intermediate folder wasn't in tree
          nodes.push(node);
        }
      }
    }

    // Sort: directories first, then alphabetical
    const sortNodes = (list: FileNode[]) => {
      list.sort((a, b) => {
        if (a.type === 'tree' && b.type !== 'tree') return -1;
        if (a.type !== 'tree' && b.type === 'tree') return 1;
        return a.name.localeCompare(b.name, 'ja', { numeric: true });
      });
      for (const item of list) {
        if (item.children) {
          sortNodes(item.children);
        }
      }
    };

    sortNodes(nodes);
    return nodes;
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
  ): Promise<{ content: string; sha: string; fromCache: boolean }> {
    const { fileSha, force = false } = options || {};
    const cache = this.getLocalCache(vault);
    const cachedEntry = cache[filePath];

    if (!force && cachedEntry && fileSha && cachedEntry.sha === fileSha) {
      return {
        content: cachedEntry.content,
        sha: cachedEntry.sha,
        fromCache: true,
      };
    }

    const projectId = await this.resolveProjectId(vault);
    const branch = encodeURIComponent(vault.branch || 'main');
    const encodedFilePath = encodeURIComponent(filePath);

    // 1. Try standard repository files API
    const endpoint = `/projects/${projectId}/repository/files/${encodedFilePath}?ref=${branch}`;
    const res = await this.apiFetch(vault, endpoint, {
      headers: force
        ? { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' }
        : undefined,
    });

    if (res.ok) {
      const data = await res.json();
      let utf8Content = '';

      if (data.encoding === 'base64' && data.content) {
        utf8Content = base64ToUtf8(data.content);
      } else if (typeof data.content === 'string') {
        utf8Content = data.content;
      }

      const fileShaResult = data.blob_id || data.last_commit_id || data.commit_id || '';

      // Save to cache
      cache[filePath] = {
        sha: fileShaResult,
        content: utf8Content,
        updatedAt: Date.now(),
      };
      this.saveLocalCache(vault, cache);

      return {
        content: utf8Content,
        sha: fileShaResult,
        fromCache: false,
      };
    }

    // 2. Fallback: If 404 (commonly triggered when reverse proxies decode %2F in filePath) and we have fileSha from tree,
    // fetch raw blob directly via /repository/blobs/:sha/raw (pure hash, no %2F or slashes in URL!)
    if (res.status === 404 && fileSha) {
      const blobEndpoint = `/projects/${projectId}/repository/blobs/${encodeURIComponent(fileSha)}/raw`;
      const blobRes = await this.apiFetch(vault, blobEndpoint, {
        headers: force
          ? { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' }
          : undefined,
      });

      if (blobRes.ok) {
        const rawContent = await blobRes.text();
        cache[filePath] = {
          sha: fileSha,
          content: rawContent,
          updatedAt: Date.now(),
        };
        this.saveLocalCache(vault, cache);

        return {
          content: rawContent,
          sha: fileSha,
          fromCache: false,
        };
      }
    }

    let errDetail = `${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.message) errDetail += ` - ${errJson.message}`;
    } catch {
      // ignore
    }
    throw new Error(`GitLabファイルの取得に失敗しました: ${errDetail}`);
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
    const projectId = await this.resolveProjectId(vault);
    const encodedFilePath = encodeURIComponent(filePath);
    const base64Content = utf8ToBase64(newContent);
    const branch = vault.branch || 'main';

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
      // First try update action via Commits API
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
        // If update failed, try create action via Commits API
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
      } catch {
        // ignore
      }
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
   * Fetch commit history for a specific file
   */
  static async fetchFileCommits(
    vault: VaultConfig,
    filePath: string,
    perPage: number = 30
  ): Promise<CommitHistoryItem[]> {
    const projectId = await this.resolveProjectId(vault);
    const branch = encodeURIComponent(vault.branch || 'main');
    const encodedFilePath = encodeURIComponent(filePath);

    const endpoint = `/projects/${projectId}/repository/commits?path=${encodedFilePath}&ref_name=${branch}&per_page=${perPage}`;
    const res = await this.apiFetch(vault, endpoint);

    if (!res.ok) {
      throw new Error(`GitLabコミット履歴の取得に失敗しました: ${res.statusText}`);
    }

    const data: any[] = await res.json();

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
    const cacheKey = `${vault.owner}/${vault.repo}/${commitSha}/${filePath}`;
    if (this.diffCache.has(cacheKey)) {
      return this.diffCache.get(cacheKey)!;
    }

    const projectId = await this.resolveProjectId(vault);
    const endpoint = `/projects/${projectId}/repository/commits/${encodeURIComponent(commitSha)}/diff`;
    const res = await this.apiFetch(vault, endpoint);

    if (!res.ok) {
      return null;
    }

    const diffList: any[] = await res.json();
    if (!Array.isArray(diffList)) {
      return null;
    }

    const fileDiff = diffList.find(
      (d) => d.new_path === filePath || d.old_path === filePath
    );

    if (!fileDiff) {
      return null;
    }

    // Count additions and deletions from patch
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
      filename: fileDiff.new_path || filePath,
      status,
      additions,
      deletions,
      changes: additions + deletions,
      patch,
    };

    this.diffCache.set(cacheKey, diff);
    return diff;
  }
}
