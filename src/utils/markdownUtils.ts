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
 * Preserves code blocks and inline code without modification.
 */
export function preprocessWikiLinks(content: string): string {
  // Split content by code blocks and inline code to prevent replacing inside code
  const codeBlockRegex = /(```[\s\S]*?```|`[^`\n]+`)/g;
  const parts = content.split(codeBlockRegex);

  return parts
    .map((part, index) => {
      // Odd indices are code blocks or inline code matched by regex; preserve as-is
      if (index % 2 === 1) {
        return part;
      }

      // Matches [[target]] or [[target|alias]]
      return part.replace(/\[\[(.*?)\]\]/g, (_, inner) => {
        let target = inner.trim();
        let alias = target;

        if (target.includes('|')) {
          const splitParts = target.split('|');
          target = splitParts[0].trim();
          alias = splitParts.slice(1).join('|').trim();
        }

        // Check if there is a heading anchor: Note#Heading or #Heading
        let noteName = target;
        let heading = '';
        if (target.includes('#')) {
          const hashIndex = target.indexOf('#');
          noteName = target.substring(0, hashIndex).trim();
          heading = target.substring(hashIndex + 1).trim();
        }

        // Default display alias formatting for headings if no explicit alias provided
        if (alias === target && heading) {
          alias = noteName ? `${noteName} > ${heading}` : heading;
        }

        const encodedNote = encodeURIComponent(noteName);
        const encodedHeading = heading ? `#${encodeURIComponent(heading)}` : '';

        return `[${alias}](wikilink:${encodedNote}${encodedHeading})`;
      });
    })
    .join('');
}

/**
 * Resolve WikiLink note name to actual file path in vault
 */
export function resolveWikiLinkPath(
  targetNoteName: string,
  allFilePaths: string[],
  currentFilePath: string
): string | null {
  if (!targetNoteName) return null;

  let decodedTarget = targetNoteName.trim();
  try {
    decodedTarget = decodeURIComponent(decodedTarget).trim();
  } catch {
    // ignore
  }
  if (!decodedTarget) return null;

  // Clean heading anchor if present: "Note#Heading" -> "Note"
  if (decodedTarget.includes('#')) {
    decodedTarget = decodedTarget.split('#')[0].trim();
  }
  if (!decodedTarget) return null;

  // Normalize leading slashes and ./
  let normalized = decodedTarget.replace(/^\/+/, '');
  if (normalized.startsWith('./')) {
    normalized = normalized.substring(2);
  }

  // Handle relative path with ../
  if (normalized.includes('../')) {
    const currentDir = currentFilePath.includes('/')
      ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))
      : '';
    const parts = currentDir ? currentDir.split('/') : [];
    const relParts = normalized.split('/');
    for (const part of relParts) {
      if (part === '.' || part === '') continue;
      if (part === '..') {
        parts.pop();
      } else {
        parts.push(part);
      }
    }
    normalized = parts.join('/');
  }

  const targetWithExt = normalized.endsWith('.md') ? normalized : `${normalized}.md`;
  const targetNameOnly = normalized.replace(/\.md$/, '');
  const basenameOnly = targetNameOnly.split('/').pop() || targetNameOnly;
  const basenameWithExt = `${basenameOnly}.md`;

  // 1. Check exact path match
  if (allFilePaths.includes(targetWithExt)) {
    return targetWithExt;
  }

  // 2. Check same directory match
  const currentDir = currentFilePath.includes('/')
    ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))
    : '';
  if (currentDir) {
    const siblingPath = `${currentDir}/${basenameWithExt}`;
    if (allFilePaths.includes(siblingPath)) {
      return siblingPath;
    }
  }

  // 3. Match by path ending (e.g. user linked "folder/note" and full path is "root/folder/note.md")
  for (const path of allFilePaths) {
    if (path.endsWith(`/${targetWithExt}`) || path === targetWithExt) {
      return path;
    }
  }

  // 4. Search anywhere in vault by basename
  for (const path of allFilePaths) {
    const fileName = path.split('/').pop() || '';
    const baseName = fileName.replace(/\.md$/, '');
    if (fileName === basenameWithExt || baseName === basenameOnly) {
      return path;
    }
  }

  // 5. Case-insensitive fallback search
  const lowerTargetWithExt = targetWithExt.toLowerCase();
  const lowerBasenameWithExt = basenameWithExt.toLowerCase();
  const lowerBasenameOnly = basenameOnly.toLowerCase();

  for (const path of allFilePaths) {
    const lowerPath = path.toLowerCase();
    const fileName = path.split('/').pop() || '';
    const baseName = fileName.replace(/\.md$/, '');

    if (
      lowerPath === lowerTargetWithExt ||
      lowerPath.endsWith(`/${lowerTargetWithExt}`) ||
      fileName.toLowerCase() === lowerBasenameWithExt ||
      baseName.toLowerCase() === lowerBasenameOnly
    ) {
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
