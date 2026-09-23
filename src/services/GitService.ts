import { VaultConfig, FileNode, FileCacheEntry, FileFetchResult, CommitHistoryItem, CommitFileDiff, RecentUpdatedFile } from '../types';
import { GitHubService } from './GitHubService';
import { GitLabService } from './GitLabService';

export class GitService {
  private static isGitLab(vault: VaultConfig): boolean {
    return vault.provider === 'gitlab';
  }

  /**
   * Test connection to provider (GitHub or GitLab)
   */
  static async testConnection(
    vault: VaultConfig
  ): Promise<{ success: boolean; message: string; username?: string; detectedBranch?: string }> {
    if (this.isGitLab(vault)) {
      return GitLabService.testConnection(vault);
    }
    return GitHubService.testConnection(vault);
  }

  /**
   * Get cached content immediately from localStorage for SWR initial rendering
   */
  static getCachedContent(vault: VaultConfig, filePath: string): FileCacheEntry | null {
    if (this.isGitLab(vault)) {
      return GitLabService.getCachedContent(vault, filePath);
    }
    return GitHubService.getCachedContent(vault, filePath);
  }

  /**
   * Fetch file tree recursively
   */
  static async fetchFileTree(vault: VaultConfig, force: boolean = false): Promise<FileNode[]> {
    if (this.isGitLab(vault)) {
      return GitLabService.fetchFileTree(vault, force);
    }
    return GitHubService.fetchFileTree(vault, force);
  }

  /**
   * Fetch children of a folder on demand (lazy loading)
   */
  static async fetchDirectoryChildren(
    vault: VaultConfig,
    folderPath: string,
    folderSha?: string
  ): Promise<FileNode[]> {
    if (this.isGitLab(vault)) {
      return GitLabService.fetchDirectoryChildren(vault, folderPath);
    }
    return GitHubService.fetchDirectoryChildren(vault, folderSha || '', folderPath);
  }

  /**
   * Fetch more items for a directory or root (load more pagination)
   */
  static async fetchMoreItems(
    vault: VaultConfig,
    parentPath: string,
    page: number
  ): Promise<FileNode[]> {
    if (this.isGitLab(vault)) {
      return GitLabService.fetchMoreItems(vault, parentPath, page);
    }
    return GitHubService.fetchMoreItems(vault, parentPath, page);
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
    if (this.isGitLab(vault)) {
      return GitLabService.fetchFileContent(vault, filePath, options);
    }
    return GitHubService.fetchFileContent(vault, filePath, options);
  }

  /**
   * Save whole file content (create or update)
   */
  static async saveFile(
    vault: VaultConfig,
    filePath: string,
    newContent: string,
    currentSha?: string,
    commitMessage?: string
  ): Promise<{ newSha: string }> {
    if (this.isGitLab(vault)) {
      return GitLabService.saveFile(vault, filePath, newContent, currentSha, commitMessage);
    }
    return GitHubService.saveFile(vault, filePath, newContent, currentSha, commitMessage);
  }

  /**
   * Fetch commit history for a specific file
   */
  static async fetchFileCommits(
    vault: VaultConfig,
    filePath: string,
    perPage: number = 30
  ): Promise<CommitHistoryItem[]> {
    if (this.isGitLab(vault)) {
      return GitLabService.fetchFileCommits(vault, filePath, perPage);
    }
    return GitHubService.fetchFileCommits(vault, filePath, perPage);
  }

  /**
   * Fetch diff and changes for a specific file in a commit
   */
  static async fetchCommitFileDiff(
    vault: VaultConfig,
    commitSha: string,
    filePath: string
  ): Promise<CommitFileDiff | null> {
    if (this.isGitLab(vault)) {
      return GitLabService.fetchCommitFileDiff(vault, commitSha, filePath);
    }
    return GitHubService.fetchCommitFileDiff(vault, commitSha, filePath);
  }

  /**
   * Fetch recently updated files from repository commits
   */
  static async fetchRecentUpdatedFiles(
    vault: VaultConfig,
    limit: number = 8
  ): Promise<RecentUpdatedFile[]> {
    if (this.isGitLab(vault)) {
      return GitLabService.fetchRecentUpdatedFiles(vault, limit);
    }
    return GitHubService.fetchRecentUpdatedFiles(vault, limit);
  }
}

