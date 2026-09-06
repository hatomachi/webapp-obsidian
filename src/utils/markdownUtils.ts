import { TOCItem } from '../types';

/**
 * Extract Table of Contents from Markdown content
 */
export function extractTOC(content: string): TOCItem[] {
  const lines = content.split('\n');
  const toc: TOCItem[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Toggle code block
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      let text = headingMatch[2].trim();
      
      // Clean up markdown formatting in heading text
      text = text.replace(/\[\[(.*?)\]\]/g, '$1');
      text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1');
      text = text.replace(/[*_`]/g, '');

      // Generate a slug-like ID
      const id = `heading-${i}-${text.toLowerCase().replace(/[^\w\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff]+/g, '-')}`;

      toc.push({
        id,
        level,
        text,
      });
    }
  }

  return toc;
}

/**
 * Preprocess Obsidian WikiLinks: [[Target Note]] or [[Target Note|Display Text]]
 * Converts them to custom markdown link format: [Display Text](wikilink:Target Note)
 */
export function preprocessWikiLinks(content: string): string {
  // Matches [[target]] or [[target|alias]]
  return content.replace(/\[\[(.*?)\]\]/g, (_, inner) => {
    let target = inner.trim();
    let alias = target;

    if (target.includes('|')) {
      const parts = target.split('|');
      target = parts[0].trim();
      alias = parts.slice(1).join('|').trim();
    }

    // Handle heading links: [[Note#Heading]] -> target is Note
    let cleanTarget = target;
    if (cleanTarget.includes('#')) {
      cleanTarget = cleanTarget.split('#')[0].trim();
    }

    // Return custom URI link
    return `[${alias}](wikilink:${encodeURIComponent(cleanTarget)})`;
  });
}

/**
 * Resolve WikiLink note name to actual file path in vault
 */
export function resolveWikiLinkPath(
  targetNoteName: string,
  allFilePaths: string[],
  currentFilePath: string
): string | null {
  const decodedTarget = decodeURIComponent(targetNoteName).trim();
  if (!decodedTarget) return null;

  const targetWithExt = decodedTarget.endsWith('.md') ? decodedTarget : `${decodedTarget}.md`;
  const targetNameOnly = decodedTarget.replace(/\.md$/, '');

  // 1. Check exact path match
  if (allFilePaths.includes(targetWithExt)) {
    return targetWithExt;
  }

  // 2. Check same directory match
  const currentDir = currentFilePath.includes('/')
    ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))
    : '';
  if (currentDir) {
    const siblingPath = `${currentDir}/${targetWithExt}`;
    if (allFilePaths.includes(siblingPath)) {
      return siblingPath;
    }
  }

  // 3. Search anywhere in vault by basename
  for (const path of allFilePaths) {
    const fileName = path.split('/').pop() || '';
    const baseName = fileName.replace(/\.md$/, '');
    if (fileName === targetWithExt || baseName === targetNameOnly) {
      return path;
    }
  }

  return null;
}

export type CalloutType =
  | 'note'
  | 'info'
  | 'todo'
  | 'tip'
  | 'hint'
  | 'important'
  | 'warning'
  | 'caution'
  | 'attention'
  | 'failure'
  | 'fail'
  | 'danger'
  | 'error'
  | 'bug'
  | 'success'
  | 'check'
  | 'done'
  | 'question'
  | 'help'
  | 'faq'
  | 'quote'
  | 'cite';

export interface CalloutInfo {
  type: CalloutType;
  title: string;
}

export function parseCallout(text: string): CalloutInfo | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^\[!([a-zA-Z]+)\][+-]?\s*(.*)$/);
  if (!match) return null;

  const type = match[1].toLowerCase() as CalloutType;
  const rawTitle = match[2].trim();

  // Format default title if none provided
  const title = rawTitle || (type.charAt(0).toUpperCase() + type.slice(1));

  return { type, title };
}
