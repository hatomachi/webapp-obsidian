import { Octokit } from '@octokit/rest';
import { VaultConfig, FileNode, FileCacheEntry } from '../types';
import { utf8ToBase64, base64ToUtf8 } from '../utils/encoding';

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
   * Fetch file tree recursively using Git Trees API
   */
  static async fetchFileTree(vault: VaultConfig): Promise<FileNode[]> {
    const octokit = this.getOctokit(vault.token);
    const { data } = await octokit.git.getTree({
      owner: vault.owner,
      repo: vault.repo,
      tree_sha: vault.branch || 'main',
      recursive: 'true',
    });

    const ignoredPrefixes = ['.obsidian/', '.git/', '.github/', '.vscode/', '.trash/'];
    
    const nodes: FileNode[] = [];
    const pathMap = new Map<string, FileNode>();

    for (const item of data.tree) {
      if (!item.path || !item.sha) continue;

      // Skip internal hidden/system directories
      if (ignoredPrefixes.some((p) => item.path!.startsWith(p) || item.path!.includes('/' + p))) {
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
        sha: item.sha,
        size: item.size,
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
   * Fetch file content with SWR cache
   */
  static async fetchFileContent(
    vault: VaultConfig,
    filePath: string,
    fileSha?: string
  ): Promise<{ content: string; sha: string; fromCache: boolean }> {
    const cache = this.getLocalCache(vault);
    const cachedEntry = cache[filePath];

    // If cache matches the SHA, return immediately
    if (cachedEntry && (!fileSha || cachedEntry.sha === fileSha)) {
      return {
        content: cachedEntry.content,
        sha: cachedEntry.sha,
        fromCache: true,
      };
    }

    // Fetch from GitHub
    const octokit = this.getOctokit(vault.token);
    const { data } = await octokit.repos.getContent({
      owner: vault.owner,
      repo: vault.repo,
      path: filePath,
      ref: vault.branch || 'main',
    });

    if (Array.isArray(data) || !('content' in data)) {
      throw new Error(`Path ${filePath} is not a file`);
    }

    const utf8Content = base64ToUtf8(data.content);
    
    // Save to cache
    cache[filePath] = {
      sha: data.sha,
      content: utf8Content,
      updatedAt: Date.now(),
    };
    this.saveLocalCache(vault, cache);

    return {
      content: utf8Content,
      sha: data.sha,
      fromCache: false,
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
    const { content, sha } = await this.fetchFileContent(vault, filePath);
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
      const existing = await this.fetchFileContent(vault, filePath);
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
}
