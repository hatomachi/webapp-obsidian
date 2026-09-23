import YAML from 'yaml';
import { BaseConfig } from './types';

/**
 * Check if a file is considered an Obsidian Bases file
 */
export function isBasesFile(filePath: string, content?: string): boolean {
  if (!filePath) return false;
  const lower = filePath.toLowerCase();

  // Extensions: .base, .bases, .base.md, .bases.md
  if (
    lower.endsWith('.base') ||
    lower.endsWith('.bases') ||
    lower.endsWith('.base.md') ||
    lower.endsWith('.bases.md')
  ) {
    return true;
  }

  // Frontmatter check: type: base or type: bases
  if (content && (lower.endsWith('.md') || lower.endsWith('.markdown'))) {
    const fm = extractFrontmatter(content);
    if (fm && (fm.type === 'base' || fm.type === 'bases')) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a target path points to a YAML file
 */
export function isYamlPath(path: string): boolean {
  if (!path) return false;
  const lower = path.toLowerCase().trim();
  const withoutAnchor = lower.split('#')[0].trim();
  return withoutAnchor.endsWith('.yaml') || withoutAnchor.endsWith('.yml');
}

/**
 * Resolve target YAML file path relative to bases file or vault root
 */
export function resolveTargetYamlPath(targetPath: string, basesFilePath: string): string {
  let cleaned = targetPath.trim().replace(/^['"]|['"]$/g, '');
  if (!cleaned) return '';

  // Remove anchor if any (e.g. data.yaml#tasks -> data.yaml)
  cleaned = cleaned.split('#')[0].trim();

  // If starts with /, treat as vault root path
  if (cleaned.startsWith('/')) {
    return cleaned.replace(/^\/+/, '');
  }

  if (cleaned.startsWith('./')) {
    cleaned = cleaned.substring(2);
  }

  // Parent directory of the bases file
  const parts = basesFilePath.split('/');
  const parentFolder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';

  if (parentFolder && !cleaned.includes('/')) {
    return `${parentFolder}/${cleaned}`;
  }

  return cleaned;
}

/**
 * Extract target folder or file from Obsidian filter expressions
 */
export function extractFilterTarget(filters: any): string | null {
  if (!filters) return null;
  const list: string[] = [];

  if (Array.isArray(filters)) {
    filters.forEach((f) => list.push(typeof f === 'string' ? f : JSON.stringify(f)));
  } else if (typeof filters === 'object') {
    if (Array.isArray(filters.and)) {
      filters.and.forEach((f: any) => list.push(typeof f === 'string' ? f : JSON.stringify(f)));
    }
    if (Array.isArray(filters.or)) {
      filters.or.forEach((f: any) => list.push(typeof f === 'string' ? f : JSON.stringify(f)));
    }
  }

  for (const expr of list) {
    // 1. file.inFolder("...")
    const inFolderMatch = expr.match(/file\.inFolder\(\s*["']?([^"')]+)["']?\s*\)/);
    if (inFolderMatch) return inFolderMatch[1].trim();

    // 2. file == "..." or file.path == "..." or file.name == "..."
    const fileMatch = expr.match(/file(?:\.path|\.name)?\s*==\s*["']?([^"'\\\\]+)["']?/);
    if (fileMatch) return fileMatch[1].trim();
  }

  return null;
}

/**
 * Parse Bases file content into BaseConfig
 */
export function parseBaseConfig(content: string, basesFilePath: string): BaseConfig {
  // Determine default folder from the bases file's own parent folder
  const parts = basesFilePath.split('/');
  const defaultFolder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';

  const config: BaseConfig = {
    targetType: 'folder',
    folder: defaultFolder,
    view: 'table',
    sortOrder: 'asc',
  };

  if (!content) return config;

  // 1. If content contains a ```base code block, extract that inner text
  const codeBlockMatch = content.match(/```(?:base|bases)\s*([\s\S]*?)```/i);
  let textToParse = codeBlockMatch ? codeBlockMatch[1] : content;

  // 2. If content has frontmatter, extract the frontmatter text
  if (!codeBlockMatch && textToParse.startsWith('---')) {
    const fmMatch = textToParse.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fmMatch) {
      textToParse = fmMatch[1];
    }
  }

  // Attempt full YAML parse
  let parsed: any = null;
  try {
    parsed = YAML.parse(textToParse);
  } catch {
    // If full YAML parse fails, fallback logic below handles it
  }

  let rawTarget: string | null = null;
  let rawProperty: string | null = null;
  let foundColumns: string[] | null = null;
  let foundEditableColumns: string[] | undefined = undefined;
  let isEditableByDefault = true;
  let foundSortBy: string | null = null;
  let foundSortOrder: 'asc' | 'desc' | null = null;
  let foundTitle: string | null = null;

  if (parsed && typeof parsed === 'object') {
    if (parsed.title) foundTitle = String(parsed.title);

    // Target from direct keys
    const targetKey = ['file', 'yaml', 'target', 'path', 'source', 'from', 'folder'].find(
      (k) => parsed[k] != null
    );
    if (targetKey) {
      rawTarget = String(parsed[targetKey]).trim();
    }

    // Property from direct keys
    const propKey = ['property', 'prop', 'key', 'items', 'array', 'root', 'field'].find(
      (k) => parsed[k] != null
    );
    if (propKey) {
      rawProperty = String(parsed[propKey]).trim();
    }

    // Columns / Order
    if (Array.isArray(parsed.columns)) {
      foundColumns = parsed.columns.map((c: any) => String(c).trim()).filter(Boolean);
    } else if (Array.isArray(parsed.order)) {
      foundColumns = parsed.order.map((c: any) => String(c).trim()).filter(Boolean);
    }

    // Editable columns / permissions
    const editableKey = ['editable', 'editableColumns', 'editable_columns', 'allowEdit', 'allow_edit'].find(
      (k) => parsed[k] !== undefined
    );
    if (editableKey) {
      const editOpt = parseEditableOption(parsed[editableKey]);
      foundEditableColumns = editOpt.editableColumns;
      isEditableByDefault = editOpt.isEditableByDefault;
    }

    // Sort
    if (parsed.sortBy || parsed.sort) {
      foundSortBy = String(parsed.sortBy || parsed.sort).trim();
    }
    if (parsed.sortOrder || parsed.orderDirection) {
      const ord = String(parsed.sortOrder || parsed.orderDirection).toLowerCase();
      foundSortOrder = ord === 'desc' ? 'desc' : 'asc';
    }

    // Obsidian official Bases format: views
    if (Array.isArray(parsed.views) && parsed.views.length > 0) {
      const view = parsed.views[0];
      if (view && typeof view === 'object') {
        if (!foundColumns && Array.isArray(view.order)) {
          foundColumns = view.order
            .map((c: any) => String(c).trim().replace(/^note\.|^file\./, ''))
            .filter(Boolean);
        }
        if (!rawProperty && view.property) {
          rawProperty = String(view.property).trim();
        }
        if (foundEditableColumns === undefined && view.editable !== undefined) {
          const editOpt = parseEditableOption(view.editable);
          foundEditableColumns = editOpt.editableColumns;
          isEditableByDefault = editOpt.isEditableByDefault;
        }
        if (!foundSortBy && Array.isArray(view.sort) && view.sort.length > 0) {
          const s = view.sort[0];
          if (s && s.property) {
            foundSortBy = String(s.property).replace(/^note\.|^file\./, '');
            foundSortOrder = String(s.direction).toUpperCase() === 'DESC' ? 'desc' : 'asc';
          }
        }
        // Check filters
        if (!rawTarget && view.filters) {
          rawTarget = extractFilterTarget(view.filters);
        }
      }
    }
  }

  // Fallback line-by-line parsing
  if (!rawTarget) {
    const lines = textToParse.split(/\r?\n/);
    let currentKey: string | null = null;
    const listItems: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('- ') && currentKey) {
        const item = line.substring(2).trim().replace(/^['"]|['"]$/g, '');
        if (item) listItems.push(item);
        continue;
      }

      if (currentKey && listItems.length > 0) {
        if ((currentKey === 'columns' || currentKey === 'order') && !foundColumns) {
          foundColumns = [...listItems];
        }
        listItems.length = 0;
        currentKey = null;
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex !== -1) {
        const key = line.substring(0, colonIndex).trim().toLowerCase();
        const val = line.substring(colonIndex + 1).trim().replace(/^['"]|['"]$/g, '');
        currentKey = key;

        if (['file', 'yaml', 'target', 'path', 'source', 'from', 'folder'].includes(key) && !rawTarget) {
          rawTarget = val;
        } else if (['property', 'prop', 'key', 'items', 'array', 'root', 'field'].includes(key) && !rawProperty) {
          rawProperty = val;
        } else if (key === 'title' && !foundTitle) {
          foundTitle = val;
        } else if ((key === 'sortby' || key === 'sort') && !foundSortBy) {
          foundSortBy = val;
        } else if ((key === 'sortorder' || key === 'order') && !foundSortOrder) {
          foundSortOrder = val.toLowerCase() === 'desc' ? 'desc' : 'asc';
        } else if ((key === 'columns' || key === 'order') && val.startsWith('[') && val.endsWith(']')) {
          foundColumns = val
            .slice(1, -1)
            .split(',')
            .map((c) => c.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);
        } else if (['editable', 'editablecolumns', 'editable_columns', 'allowedit'].includes(key) && foundEditableColumns === undefined) {
          const editOpt = parseEditableOption(val);
          foundEditableColumns = editOpt.editableColumns;
          isEditableByDefault = editOpt.isEditableByDefault;
        }
      }

      // Check filters: file.inFolder("...") or file == "..."
      const inFolder = line.match(/file\.inFolder\(["']([^"']+)["']\)/);
      if (inFolder && !rawTarget) {
        rawTarget = inFolder[1];
      }
      const fileEq = line.match(/file(?:\.path|\.name)?\s*==\s*["']([^"']+)["']/);
      if (fileEq && !rawTarget) {
        rawTarget = fileEq[1];
      }
    }

    if (listItems.length > 0) {
      if ((currentKey === 'columns' || currentKey === 'order') && !foundColumns) {
        foundColumns = [...listItems];
      } else if (['editable', 'editablecolumns', 'editable_columns', 'allowedit'].includes(currentKey || '') && foundEditableColumns === undefined) {
        foundEditableColumns = [...listItems];
        isEditableByDefault = false;
      }
    }
  }

  // Check for anchor in rawTarget (e.g. data.yaml#tasks)
  if (rawTarget && rawTarget.includes('#')) {
    const [pathPart, anchorPart] = rawTarget.split('#');
    rawTarget = pathPart.trim();
    if (!rawProperty && anchorPart) {
      rawProperty = anchorPart.trim();
    }
  }

  if (foundTitle) config.title = foundTitle;
  if (foundColumns && foundColumns.length > 0) config.columns = foundColumns;
  config.editableColumns = foundEditableColumns;
  config.isEditableByDefault = isEditableByDefault;
  if (foundSortBy) config.sortBy = foundSortBy;
  if (foundSortOrder) config.sortOrder = foundSortOrder;

  // Determine targetType
  if (rawTarget && isYamlPath(rawTarget)) {
    config.targetType = 'yaml';
    config.yamlFile = resolveTargetYamlPath(rawTarget, basesFilePath);
    config.property = rawProperty || undefined;
  } else {
    config.targetType = 'folder';
    config.folder = (rawTarget || defaultFolder).replace(/^\/+|\/+$/g, '');
  }

  return config;
}

/**
 * Parse editable column option (boolean, string, or array)
 */
export function parseEditableOption(raw: any): { editableColumns?: string[]; isEditableByDefault: boolean } {
  if (raw === undefined || raw === null) {
    return { editableColumns: undefined, isEditableByDefault: true };
  }
  if (raw === false || raw === 'false' || raw === 'none' || raw === 'readonly' || raw === 'read-only') {
    return { editableColumns: [], isEditableByDefault: false };
  }
  if (raw === true || raw === 'true' || raw === 'all') {
    return { editableColumns: undefined, isEditableByDefault: true };
  }
  if (Array.isArray(raw)) {
    const cols = raw.map((c) => String(c).trim().replace(/^note\.|^file\./, '')).filter(Boolean);
    return { editableColumns: cols, isEditableByDefault: false };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { editableColumns: undefined, isEditableByDefault: true };
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const cols = trimmed
        .slice(1, -1)
        .split(',')
        .map((c) => c.trim().replace(/^['"]|['"]$/g, '').replace(/^note\.|^file\./, ''))
        .filter(Boolean);
      return { editableColumns: cols, isEditableByDefault: false };
    }
    const cols = trimmed
      .split(',')
      .map((c) => c.trim().replace(/^['"]|['"]$/g, '').replace(/^note\.|^file\./, ''))
      .filter(Boolean);
    return { editableColumns: cols, isEditableByDefault: false };
  }
  return { editableColumns: undefined, isEditableByDefault: true };
}

/**
 * Lightweight, robust Frontmatter parser (YAML subset: string, number, boolean, array)
 */
export function extractFrontmatter(content: string): Record<string, any> {
  const result: Record<string, any> = {};
  if (!content || !content.startsWith('---')) return result;

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return result;

  const yamlText = match[1];
  try {
    const parsed = YAML.parse(yamlText);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // Fallback to manual parsing below
  }

  const lines = yamlText.split(/\r?\n/);
  let activeListKey: string | null = null;
  const currentList: any[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // List item under active key
    if (line.startsWith('- ') && activeListKey) {
      const val = line.substring(2).trim().replace(/^['"]|['"]$/g, '');
      currentList.push(parseYamlValue(val));
      continue;
    }

    if (activeListKey && currentList.length > 0) {
      result[activeListKey] = [...currentList];
      currentList.length = 0;
      activeListKey = null;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex !== -1) {
      const key = line.substring(0, colonIndex).trim();
      const rawVal = line.substring(colonIndex + 1).trim();

      if (!rawVal) {
        // Multi-line list follows
        activeListKey = key;
        continue;
      }

      // Inline array: [a, b, c]
      if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        const items = rawVal
          .slice(1, -1)
          .split(',')
          .map((item) => parseYamlValue(item.trim()));
        result[key] = items;
      } else {
        result[key] = parseYamlValue(rawVal);
      }
    }
  }

  if (activeListKey && currentList.length > 0) {
    result[activeListKey] = [...currentList];
  }

  return result;
}

function parseYamlValue(val: string): any {
  const unquoted = val.replace(/^['"]|['"]$/g, '').trim();
  if (unquoted === 'true') return true;
  if (unquoted === 'false') return false;
  if (unquoted === 'null') return null;
  if (!isNaN(Number(unquoted)) && unquoted !== '') return Number(unquoted);
  return unquoted;
}

export interface HeadingsExtractResult {
  headings: Record<string, string>;
  rawHeadings: Record<string, string>;
}

/**
 * Extract ## Headings and their corresponding immediate body/summary text as well as raw content
 */
export function extractHeadingsData(content: string): HeadingsExtractResult {
  const headings: Record<string, string> = {};
  const rawHeadings: Record<string, string> = {};
  if (!content) return { headings, rawHeadings };

  // Split lines
  const lines = content.split(/\r?\n/);
  let currentHeading: string | null = null;
  const currentLines: string[] = [];

  const flushCurrent = () => {
    if (currentHeading && currentLines.length > 0) {
      // 1. Raw text (preserves original formatting and line breaks, trimmed at outer boundaries)
      const rawText = currentLines.join('\n').trim();
      if (rawText) {
        rawHeadings[currentHeading] = rawText;
      }
      // 2. Preview text
      const previewText = cleanHeadingContent(currentLines.map((l) => l.trim()));
      if (previewText) {
        headings[currentHeading] = previewText;
      }
      currentLines.length = 0;
    }
  };

  for (const line of lines) {
    // Check for H2 or H3 heading (e.g. "## 📍 現在地" or "### 目標")
    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/);
    if (headingMatch) {
      flushCurrent();
      const levelMarks = headingMatch[1]; // "##" or "###"
      const title = headingMatch[2].trim();
      currentHeading = `${levelMarks} ${title}`;
      continue;
    }

    // Stop heading content if H1 or horizontal rule
    if (line.match(/^#\s+/) || line.match(/^---+\s*$/)) {
      if (currentHeading) {
        flushCurrent();
        currentHeading = null;
      }
      continue;
    }

    if (currentHeading) {
      currentLines.push(line);
    }
  }

  flushCurrent();
  return { headings, rawHeadings };
}

/**
 * Helper to clean heading content into a readable preview string or checklist summary
 */
export function cleanHeadingContent(lines: string[]): string {
  const nonEmpty = lines.filter((l) => l && !l.startsWith('>')); // exclude blockquotes if needed, or keep
  if (nonEmpty.length === 0) return '';

  // Check if it's primarily a task list
  const tasks = nonEmpty.filter((l) => l.startsWith('- [ ]') || l.startsWith('- [x]'));
  if (tasks.length > 0) {
    const completed = tasks.filter((t) => t.startsWith('- [x]')).length;
    // Show first pending task or ratio
    const firstPending = tasks.find((t) => t.startsWith('- [ ]'));
    const summary = firstPending
      ? firstPending.replace('- [ ]', '').trim()
      : tasks[0].replace(/- \[[ x]\]/, '').trim();
    return `[${completed}/${tasks.length}] ${summary}`;
  }

  // Plain text: take first 1-2 lines, clean markdown bold/links
  const sample = nonEmpty.slice(0, 2).join(' ');
  return sample
    .replace(/\[\[(.*?)\]\]/g, '$1') // [[link]] -> link
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // [text](url) -> text
    .replace(/[*_`]/g, '') // remove markdown marks
    .trim();
}
