import YAML from 'yaml';
import { VaultConfig } from '../../types';
import { GitService } from '../../services/GitService';
import { BaseTargetType } from './types';

export interface SavePropertyParams {
  vault: VaultConfig;
  targetType: BaseTargetType;
  filePath: string;
  propertyKey: string;
  newValue: any;
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
 * Save property update to Git and update local SWR cache
 */
export async function saveBaseProperty(
  params: SavePropertyParams
): Promise<{ newSha: string; updatedContent: string }> {
  const { vault, targetType, filePath, propertyKey, newValue, rowIndex, yamlProperty } = params;

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
