import { VaultConfig } from '../../types';
import { GitService } from '../../services/GitService';

/**
 * Save updated meeting minutes Markdown file to Git repository
 */
export async function saveMinutesMarkdown(
  vault: VaultConfig,
  filePath: string,
  newContent: string,
  currentSha?: string,
  meetingTitle?: string
): Promise<{ newSha: string }> {
  const title = meetingTitle || filePath.split('/').pop()?.replace(/\.md$/i, '') || 'meeting';
  const commitMessage = `docs(minutes): update minutes for ${title}`;

  try {
    const result = await GitService.saveFile(
      vault,
      filePath,
      newContent,
      currentSha,
      commitMessage
    );
    return result;
  } catch (err) {
    console.error('[Minutes] Failed to save minutes markdown:', err);
    throw err;
  }
}
