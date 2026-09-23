import YAML from 'yaml';
import { VaultConfig } from '../../types';
import { GitService } from '../../services/GitService';
import { BaseTargetType, ColumnType } from './types';

export interface SavePropertyParams {
  vault: VaultConfig;
  targetType: BaseTargetType;
  filePath: string;
  propertyKey: string;
  newValue: any;
  columnType?: ColumnType;
  // For YAML mode:
  rowIndex?: number;
  yamlProperty?: string;
}

/**
 * Safely update a property in a YAML array element using YAML AST (preserves comments and formatting)
 */
export function updateYamlProperty(
  originalYamlText: string,
  propertyPath: string | undefined,
  rowIndex: number,
  key: string,
  newValue: any
): string {
  const doc = YAML.parseDocument(originalYamlText || '');

  // Determine path within doc
  const targetPath: (string | number)[] = [];

  if (propertyPath && propertyPath.trim()) {
    const parts = propertyPath.trim().split('.');
    targetPath.push(...parts);
  }

  targetPath.push(rowIndex);
  targetPath.push(key);

  // Set the value into the AST
  doc.setIn(targetPath, newValue);

  return doc.toString();
}

/**
 * Safely update a frontmatter property in Markdown text using YAML AST (preserves comments and body)
 */
export function updateMarkdownFrontmatter(
  originalMdText: string,
  key: string,
  newValue: any
): string {
  const fmMatch = originalMdText.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (fmMatch) {
    const fmYaml = fmMatch[1];
    const doc = YAML.parseDocument(fmYaml || '');
    doc.setIn([key], newValue);
    const updatedYaml = doc.toString().trim();
    return originalMdText.replace(/^---\r?\n([\s\S]*?)\r?\n---/, `---\n${updatedYaml}\n---`);
  }

  // No frontmatter yet: prepend new frontmatter
  const doc = new YAML.Document();
  doc.set(key, newValue);
  const newFm = doc.toString().trim();
  return `---\n${newFm}\n---\n\n${originalMdText}`;
}

/**
 * Safely update the body text under a specific Markdown heading (e.g. "## 📍 現在地")
 * Preserves frontmatter, other headings, and Markdown formatting.
 */
export function updateMarkdownHeadingSection(
  originalMdText: string,
  targetHeading: string,
  newSectionText: string
): string {
  const lines = originalMdText.split(/\r?\n/);

  // 1. Skip frontmatter if present
  let fmEndIndex = -1;
  if (lines.length > 0 && lines[0].trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        fmEndIndex = i;
        break;
      }
    }
  }

  // Normalize target heading for matching
  const headingMatch = targetHeading.trim().match(/^(#{1,6})\s+(.+)$/);
  const targetLevel = headingMatch ? headingMatch[1].length : null;
  const targetTitle = headingMatch ? headingMatch[2].trim().toLowerCase() : targetHeading.trim().toLowerCase();

  // 2. Find matching heading line
  let headingIndex = -1;
  let matchedLevel = 2; // default H2

  const startIndex = fmEndIndex !== -1 ? fmEndIndex + 1 : 0;
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (!hMatch) continue;

    const level = hMatch[1].length;
    const title = hMatch[2].trim().toLowerCase();

    // Match exact line or match by level + title
    if (line.trim().toLowerCase() === targetHeading.trim().toLowerCase()) {
      headingIndex = i;
      matchedLevel = level;
      break;
    }

    if (title === targetTitle && (targetLevel === null || targetLevel === level)) {
      headingIndex = i;
      matchedLevel = level;
      break;
    }
  }

  const trimmedContent = newSectionText.trim();

  // 3. If heading was not found, append it at the end of the document
  if (headingIndex === -1) {
    const headingToAdd = targetHeading.trim().startsWith('#')
      ? targetHeading.trim()
      : `## ${targetHeading.trim()}`;
    const baseText = originalMdText.trimEnd();
    if (!baseText) {
      return `${headingToAdd}\n${trimmedContent}\n`;
    }
    return `${baseText}\n\n${headingToAdd}\n${trimmedContent}\n`;
  }

  // 4. Find the end of this heading section (next heading with <= level, horizontal rule, or EOF)
  let endIndex = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    // Check for next heading of same or higher level
    const nextHMatch = line.match(/^(#{1,6})\s+/);
    if (nextHMatch) {
      const nextLevel = nextHMatch[1].length;
      if (nextLevel <= matchedLevel) {
        endIndex = i;
        break;
      }
    }

    // Check for horizontal rule
    if (line.match(/^---+\s*$/)) {
      endIndex = i;
      break;
    }
  }

  // 5. Reconstruct lines
  const before = lines.slice(0, headingIndex + 1); // includes the heading itself
  const after = lines.slice(endIndex); // starts from next heading or hr

  const resultLines: string[] = [...before];

  if (trimmedContent) {
    resultLines.push(trimmedContent);
  }

  // Add blank line before next section if there is one
  if (after.length > 0) {
    resultLines.push('');
    resultLines.push(...after);
  }

  return resultLines.join('\n');
}

/**
 * Save property update to Git and update local SWR cache
 */
export async function saveBaseProperty(
  params: SavePropertyParams
): Promise<{ newSha: string; updatedContent: string }> {
  const { vault, targetType, filePath, propertyKey, newValue, columnType, rowIndex, yamlProperty } = params;

  // 1. Fetch current content and SHA
  let currentContent = '';
  let currentSha: string | undefined = undefined;

  const cached = GitService.getCachedContent(vault, filePath);
  if (cached) {
    currentContent = cached.content;
    currentSha = cached.sha;
  }

  if (!currentContent) {
    const fetchRes = await GitService.fetchFileContent(vault, filePath, { force: true });
    currentContent = fetchRes.content;
    currentSha = fetchRes.sha;
  }

  // 2. Generate updated content
  let updatedContent = '';
  let commitMessage = '';

  if (targetType === 'yaml') {
    const index = rowIndex !== undefined ? rowIndex : 0;
    updatedContent = updateYamlProperty(currentContent, yamlProperty, index, propertyKey, newValue);
    const rowLabel = `#${index + 1}`;
    commitMessage = `chore(bases): update ${propertyKey} to ${JSON.stringify(newValue)} for row ${rowLabel} in ${filePath}`;
  } else if (
    columnType === 'heading' ||
    propertyKey.startsWith('##') ||
    propertyKey.startsWith('###') ||
    propertyKey.startsWith('#')
  ) {
    updatedContent = updateMarkdownHeadingSection(currentContent, propertyKey, String(newValue ?? ''));
    commitMessage = `chore(bases): update section "${propertyKey}" in ${filePath}`;
  } else {
    updatedContent = updateMarkdownFrontmatter(currentContent, propertyKey, newValue);
    commitMessage = `chore(bases): update frontmatter ${propertyKey} to ${JSON.stringify(newValue)} in ${filePath}`;
  }

  // 3. Commit to Git repository
  const saveRes = await GitService.saveFile(vault, filePath, updatedContent, currentSha, commitMessage);

  return {
    newSha: saveRes.newSha,
    updatedContent,
  };
}
