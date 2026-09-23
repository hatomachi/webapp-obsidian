import { Octokit } from '@octokit/rest';
import { VaultConfig, FileNode, FileCacheEntry, FileFetchResult, CommitHistoryItem, CommitFileDiff, CommitType, RecentUpdatedFile } from '../types';
import {
  utf8ToBase64,
  base64ToBytes,
  decodeBytes,
  isBinaryExtension,
  isBinaryData,
} from '../utils/encoding';

export class GitHubService {
  private static octokitCache = new Map<string, Octokit>();

  private static getOctokit(token: string): Octokit {
    let client = this.octokitCache.get(token);
    if (!client) {
      client = new Octokit({ auth: token });
      this.octokitCache.set(token, client);
    }
    return client;
  }

  private static getCacheKey(vault: VaultConfig): string {
    return `webapp_obsidian_file_cache_${vault.owner}_${vault.repo}`;
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
   * Test connection to GitHub with Vault settings
   */
  static async testConnection(vault: VaultConfig): Promise<{ success: boolean; message: string; username?: string }> {
    try {
      const octokit = this.getOctokit(vault.token);
      const { data: user } = await octokit.users.getAuthenticated();
      
      // Test repo accessibility
      const { data: repo } = await octokit.repos.get({
        owner: vault.owner,
        repo: vault.repo,
      });

      return {
        success: true,
        message: `接続成功: ${repo.full_name} (${repo.private ? 'Private' : 'Public'})`,
        username: user.login,
      };
    } catch (e: any) {
      console.error('GitHub connection test failed:', e);
      return {
        success: false,
        message: e.message || '接続に失敗しました。トークンやリポジトリ名を確認してください。',
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
    const defaultIgnored = ['.obsidian', '.git', '.github', '.vscode', '.trash'];
    const userIgnored = (vault.ignoredFolders || '')
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/^\/+|\/+$/g, ''))
      .filter(Boolean);
    return [...defaultIgnored, ...userIgnored];
  }

  /**
   * Fetch file tree using Git Trees API.
   * Supports lazy loading (root only) for huge repositories and auto-fallback on timeout.
   */
  static async fetchFileTree(vault: VaultConfig, force: boolean = false): Promise<FileNode[]> {
    const isLazy = !!vault.lazyLoad;

    // If lazyLoad is explicitly enabled, fetch only the root/top-level tree
    if (isLazy) {
      return this.fetchRootTreeOnly(vault, force);
    }

    // Otherwise try full recursive fetch, with timeout & fallback to lazy load if repository is huge
    try {
      return await this.fetchFullRecursiveTree(vault, force);
    } catch (e: any) {
      console.warn('Full recursive tree fetch failed or timed out. Falling back to lazy loading mode:', e);
      // Automatically fallback to lazy loading so the user can still open the vault
      return this.fetchRootTreeOnly(vault, force);
    }
  }

  /**
   * Fetch full recursive tree (for normal / moderate size vaults)
   */
  private static async fetchFullRecursiveTree(vault: VaultConfig, force: boolean): Promise<FileNode[]> {
    const octokit = this.getOctokit(vault.token);
    
    // Timeout promise for huge repos
    const timeoutMs = 12000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Git tree fetch timed out (>12s)')), timeoutMs)
    );

    const requestHeaders: Record<string, string> = {
      'If-None-Match': '',
    };
    if (force) {
      requestHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      requestHeaders['Pragma'] = 'no-cache';
    }

    const fetchPromise = octokit.git.getTree({
      owner: vault.owner,
      repo: vault.repo,
      tree_sha: vault.branch || 'main',
      recursive: 'true',
      headers: requestHeaders,
    });

    const { data } = await Promise.race([fetchPromise, timeoutPromise]);

    const ignoredList = this.getIgnoredFolderList(vault);
    
    const nodes: FileNode[] = [];
    const pathMap = new Map<string, FileNode>();

    for (const item of data.tree) {
      if (!item.path || !item.sha) continue;

      const parts = item.path.split('/');
      
      // Skip hidden files/folders or ignored folders
      if (parts.some((p) => p.startsWith('.') || ignoredList.includes(p.toLowerCase()))) {
        continue;
      }

      const isTree = item.type === 'tree';

      const fileName = parts[parts.length - 1];

      const node: FileNode = {
        path: item.path,
        name: fileName,
        type: isTree ? 'tree' : 'blob',
        sha: item.sha,
        size: item.size,
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
   * Fetch root/top-level tree only (for huge repositories, instant 0.1s start)
   */
  private static async fetchRootTreeOnly(vault: VaultConfig, force: boolean): Promise<FileNode[]> {
    const octokit = this.getOctokit(vault.token);
    const requestHeaders: Record<string, string> = {
      'If-None-Match': '',
    };
    if (force) {
      requestHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      requestHeaders['Pragma'] = 'no-cache';
    }

    const { data } = await octokit.git.getTree({
      owner: vault.owner,
      repo: vault.repo,
      tree_sha: vault.branch || 'main',
      // No recursive param: returns top level only!
      headers: requestHeaders,
    });

    const ignoredList = this.getIgnoredFolderList(vault);
    const nodes: FileNode[] = [];

    for (const item of data.tree) {
      if (!item.path || !item.sha) continue;

      const pathLower = item.path.toLowerCase();
      if (item.path.startsWith('.') || ignoredList.includes(pathLower)) {
        continue;
      }

      const isTree = item.type === 'tree';

      nodes.push({
        path: item.path,
        name: item.path,
        type: isTree ? 'tree' : 'blob',
        sha: item.sha,
        size: item.size,
        children: isTree ? [] : undefined,
        isLoaded: !isTree, // folders need lazy loading
      });
    }

    this.sortNodes(nodes);
    return nodes;
  }

  /**
   * Fetch children of a specific directory on demand using its tree SHA
   */
  static async fetchDirectoryChildren(
    vault: VaultConfig,
    folderSha: string,
    folderPath: string
  ): Promise<FileNode[]> {
    const octokit = this.getOctokit(vault.token);
    const { data } = await octokit.git.getTree({
      owner: vault.owner,
      repo: vault.repo,
      tree_sha: folderSha,
    });

    const ignoredList = this.getIgnoredFolderList(vault);
    const children: FileNode[] = [];

    for (const item of data.tree) {
      if (!item.path || !item.sha) continue;

      const fullPath = `${folderPath}/${item.path}`;
      const pathLower = item.path.toLowerCase();

      if (item.path.startsWith('.') || ignoredList.includes(pathLower)) {
        continue;
      }

      const isTree = item.type === 'tree';

      children.push({
        path: fullPath,
        name: item.path,
        type: isTree ? 'tree' : 'blob',
        sha: item.sha,
        size: item.size,
        children: isTree ? [] : undefined,
        isLoaded: !isTree,
      });
    }

    this.sortNodes(children);
    return children;
  }

  /**
   * Fetch more items for a directory or root (Load More)
   */
  static async fetchMoreItems(
    _vault: VaultConfig,
    _parentPath: string,
    _page: number
  ): Promise<FileNode[]> {
    return [];
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
   * Fetch file content with SWR cache
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

    // Only return from cache if:
    // 1. Not a force refresh
    // 2. Cache exists
    // 3. fileSha is provided AND matches the cached sha
    if (!force && cachedEntry && fileSha && cachedEntry.sha === fileSha) {
      return {
        content: cachedEntry.content,
        sha: cachedEntry.sha,
        fromCache: true,
        rawBase64: cachedEntry.rawBase64,
        isBinary: cachedEntry.isBinary,
      };
    }

    // Fetch from GitHub with cache-busting headers
    const octokit = this.getOctokit(vault.token);
    const requestHeaders: Record<string, string> = {
      'If-None-Match': '',
    };
    if (force) {
      requestHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      requestHeaders['Pragma'] = 'no-cache';
    }

    const { data } = await octokit.repos.getContent({
      owner: vault.owner,
      repo: vault.repo,
      path: filePath,
      ref: vault.branch || 'main',
      headers: requestHeaders,
    });

    if (Array.isArray(data)) {
      throw new Error(`Path ${filePath} is a directory, not a file`);
    }

    let rawBase64 = '';
    let fileSize = 0;
    let sha = '';

    if ('content' in data && data.content) {
      rawBase64 = data.content.replace(/\s/g, '');
      fileSize = data.size || 0;
      sha = data.sha;
    } else if ('sha' in data) {
      // For files > 1MB, getContent returns metadata without content; fetch via git.getBlob
      sha = data.sha;
      const blobRes = await octokit.git.getBlob({
        owner: vault.owner,
        repo: vault.repo,
        file_sha: data.sha,
      });
      rawBase64 = blobRes.data.content.replace(/\s/g, '');
      fileSize = blobRes.data.size || 0;
    } else {
      throw new Error(`Path ${filePath} is not a valid file`);
    }

    const bytes = base64ToBytes(rawBase64);
    const isBin = isBinaryExtension(filePath) || isBinaryData(bytes);
    const textContent = isBin ? '' : decodeBytes(bytes, 'utf-8');

    // Save to cache (avoid storing massive binary rawBase64 in localStorage to save quota)
    cache[filePath] = {
      sha,
      content: textContent,
      updatedAt: Date.now(),
      rawBase64: rawBase64.length < 500000 ? rawBase64 : undefined,
      isBinary: isBin,
    };
    this.saveLocalCache(vault, cache);

    return {
      content: textContent,
      sha,
      fromCache: false,
      rawBase64,
      isBinary: isBin,
      size: fileSize || bytes.length,
    };
  }

  /**
   * Toggle checkbox task directly in markdown file and commit to GitHub
   */
  static async toggleTaskInFile(
    vault: VaultConfig,
    filePath: string,
    targetLineIndex: number,
    currentLineText: string,
    checked: boolean
  ): Promise<{ newContent: string; newSha: string }> {
    const octokit = this.getOctokit(vault.token);

    // Get latest content
    const { content, sha } = await this.fetchFileContent(vault, filePath, { force: true });
    const lines = content.split('\n');

    // Find the matching line (prefer exact index, or search nearby)
    let lineToModify = -1;
    if (lines[targetLineIndex] !== undefined && lines[targetLineIndex].includes('- [') && lines[targetLineIndex].trim() === currentLineText.trim()) {
      lineToModify = targetLineIndex;
    } else {
      // Find matching line by text
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === currentLineText.trim()) {
          lineToModify = i;
          break;
        }
      }
    }

    if (lineToModify === -1) {
      throw new Error('タスク対象の行が見つかりませんでした。');
    }

    // Replace checkbox
    const line = lines[lineToModify];
    const updatedLine = checked
      ? line.replace(/-\s*\[\s*\]/, '- [x]')
      : line.replace(/-\s*\[x\]/i, '- [ ]');

    lines[lineToModify] = updatedLine;
    const newContent = lines.join('\n');

    // Commit to GitHub
    const base64Content = utf8ToBase64(newContent);
    const { data } = await octokit.repos.createOrUpdateFileContents({
      owner: vault.owner,
      repo: vault.repo,
      path: filePath,
      message: `chore: toggle task in ${filePath} via Obsidian Web`,
      content: base64Content,
      sha: sha,
      branch: vault.branch || 'main',
    });

    const newSha = data.content?.sha || '';

    // Update cache
    const cache = this.getLocalCache(vault);
    cache[filePath] = {
      sha: newSha,
      content: newContent,
      updatedAt: Date.now(),
    };
    this.saveLocalCache(vault, cache);

    return {
      newContent,
      newSha,
    };
  }

  /**
   * Save whole file content (full edit mode)
   */
  static async saveFile(
    vault: VaultConfig,
    filePath: string,
    newContent: string,
    currentSha?: string,
    commitMessage?: string
  ): Promise<{ newSha: string }> {
    const octokit = this.getOctokit(vault.token);

    let sha = currentSha;
    if (!sha) {
      const existing = await this.fetchFileContent(vault, filePath, { force: true });
      sha = existing.sha;
    }

    const base64Content = utf8ToBase64(newContent);
    const { data } = await octokit.repos.createOrUpdateFileContents({
      owner: vault.owner,
      repo: vault.repo,
      path: filePath,
      message: commitMessage || `docs: update ${filePath} via Obsidian Web`,
      content: base64Content,
      sha: sha,
      branch: vault.branch || 'main',
    });

    const newSha = data.content?.sha || '';

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

    // AI commit patterns (Antigravity, AI agent, strategy docs, etc.)
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

    const aiAuthors = ['antigravity', 'bot', 'github-actions', 'ai'];
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
    const octokit = this.getOctokit(vault.token);

    const { data } = await octokit.repos.listCommits({
      owner: vault.owner,
      repo: vault.repo,
      path: filePath,
      sha: vault.branch || 'main',
      per_page: perPage,
      headers: {
        'If-None-Match': '',
      },
    });

    return data.map((item) => {
      const fullMessage = item.commit.message || '';
      const lines = fullMessage.split('\n');
      const summary = lines[0] || '(No commit message)';
      const description = lines.slice(1).join('\n').trim() || undefined;

      const authorName = item.commit.author?.name || item.author?.login || 'Unknown';
      const authorEmail = item.commit.author?.email || undefined;
      const authorDate = item.commit.author?.date || item.commit.committer?.date || new Date().toISOString();
      const authorAvatarUrl = item.author?.avatar_url || undefined;
      const htmlUrl = item.html_url;

      const commitType = this.detectCommitType(fullMessage, authorName);

      return {
        sha: item.sha,
        shortSha: item.sha.slice(0, 7),
        message: fullMessage,
        summary,
        description,
        authorName,
        authorEmail,
        authorDate,
        authorAvatarUrl,
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

    const octokit = this.getOctokit(vault.token);
    const { data } = await octokit.repos.getCommit({
      owner: vault.owner,
      repo: vault.repo,
      ref: commitSha,
    });

    const file = data.files?.find(
      (f) => f.filename === filePath || f.previous_filename === filePath
    );

    if (!file) {
      return null;
    }

    const diff: CommitFileDiff = {
      sha: commitSha,
      filename: file.filename,
      status: file.status || 'modified',
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch,
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
      const octokit = this.getOctokit(vault.token);

      // 1. Fetch recent commits on the branch
      const { data: commits } = await octokit.repos.listCommits({
        owner: vault.owner,
        repo: vault.repo,
        sha: vault.branch || 'main',
        per_page: Math.min(limit * 2, 15),
        headers: {
          'If-None-Match': '',
        },
      });

      if (!commits || commits.length === 0) {
        return [];
      }

      // 2. Fetch commit details in parallel to get changed files
      const commitDetails = await Promise.all(
        commits.map(async (c) => {
          try {
            const { data } = await octokit.repos.getCommit({
              owner: vault.owner,
              repo: vault.repo,
              ref: c.sha,
            });
            return data;
          } catch (e) {
            console.warn(`[GitHubService] Failed to get commit detail for ${c.sha}`, e);
            return null;
          }
        })
      );

      // 3. Extract unique files
      const result: RecentUpdatedFile[] = [];
      const seenPaths = new Set<string>();

      for (const detail of commitDetails) {
        if (!detail || !detail.files) continue;

        const fullMessage = detail.commit.message || '';
        const summary = fullMessage.split('\n')[0] || '';
        const authorName = detail.commit.author?.name || detail.author?.login || 'Unknown';
        const authorDate = detail.commit.author?.date || detail.commit.committer?.date || new Date().toISOString();
        const commitType = this.detectCommitType(fullMessage, authorName);

        for (const file of detail.files) {
          const filePath = file.filename;
          if (!filePath) continue;

          // Skip hidden / system files
          if (filePath.startsWith('.git') || filePath.startsWith('.github/')) continue;
          // Skip deleted files
          if (file.status === 'removed') continue;
          // Skip binary files (images, pdfs, etc.)
          if (isBinaryExtension(filePath)) continue;

          if (!seenPaths.has(filePath)) {
            seenPaths.add(filePath);
            result.push({
              path: filePath,
              commitSha: detail.sha,
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
      console.warn('[GitHubService] fetchRecentUpdatedFiles failed', e);
      return [];
    }
  }
}

