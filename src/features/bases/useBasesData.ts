import { useState, useEffect, useMemo, useCallback } from 'react';
import YAML from 'yaml';
import { VaultConfig } from '../../types';
import { GitService } from '../../services/GitService';
import { BaseConfig, BaseRow, BaseColumn } from './types';
import { parseBaseConfig, extractFrontmatter, extractHeadingsData, cleanHeadingContent } from './basesParser';
import { saveBaseProperty } from './basesUpdater';

interface UseBasesDataReturn {
  config: BaseConfig;
  targetType: 'folder' | 'yaml';
  targetFolder: string;
  targetYamlPath?: string;
  targetYamlProperty?: string;
  columns: BaseColumn[];
  rows: BaseRow[];
  allRowsCount: number;
  isLoading: boolean;
  progress: { loaded: number; total: number };
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortColumn: string;
  sortOrder: 'asc' | 'desc';
  handleSort: (columnId: string) => void;
  toggleColumnVisibility: (columnId: string) => void;
  refreshData: () => Promise<void>;
  updateCellProperty: (row: BaseRow, columnId: string, newValue: any) => Promise<boolean>;
  savingCellKey: string | null;
  errorMessage: string | null;
}

export function useBasesData(
  vault: VaultConfig,
  basesFilePath: string,
  basesContent: string,
  allFilePaths: string[]
): UseBasesDataReturn {
  // Parse Bases config
  const config = useMemo(() => {
    return parseBaseConfig(basesContent, basesFilePath);
  }, [basesContent, basesFilePath]);

  // Determine matched files in target folder (for folder mode)
  const targetFiles = useMemo(() => {
    if (config.targetType !== 'folder') return [];
    const folder = config.folder.trim();
    return allFilePaths.filter((path) => {
      if (path === basesFilePath) return false;
      const lower = path.toLowerCase();
      if (!lower.endsWith('.md') && !lower.endsWith('.markdown')) return false;

      if (!folder) return true;
      return path.startsWith(`${folder}/`) || path === folder;
    });
  }, [allFilePaths, config.folder, config.targetType, basesFilePath]);

  // Resolve target YAML file path (for YAML mode)
  const resolvedYamlPath = useMemo(() => {
    if (config.targetType !== 'yaml' || !config.yamlFile) return null;

    const target = config.yamlFile.trim();
    // 1. Exact match in allFilePaths
    if (allFilePaths.includes(target)) return target;

    // 2. Case-insensitive exact match
    const lowerTarget = target.toLowerCase();
    const ciMatch = allFilePaths.find((p) => p.toLowerCase() === lowerTarget);
    if (ciMatch) return ciMatch;

    // 3. Basename match (e.g. "project.yaml" matches "10_Projects/project.yaml")
    const targetBasename = target.split('/').pop()?.toLowerCase();
    if (targetBasename) {
      const baseMatch = allFilePaths.find(
        (p) => p.split('/').pop()?.toLowerCase() === targetBasename
      );
      if (baseMatch) return baseMatch;
    }

    return target;
  }, [config.targetType, config.yamlFile, allFilePaths]);

  // Data state
  const [rowsMap, setRowsMap] = useState<Map<string, BaseRow>>(new Map());
  const [loadingCount, setLoadingCount] = useState<number>(0);
  const [isYamlLoading, setIsYamlLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortColumn, setSortColumn] = useState<string>(config.sortBy || (config.targetType === 'yaml' ? '' : 'file'));
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(config.sortOrder || 'asc');
  const [visibleColumnsMap, setVisibleColumnsMap] = useState<Record<string, boolean>>({});

  // Helper to parse a single markdown file's content into BaseRow
  const parseMarkdownRow = useCallback((filePath: string, content: string): BaseRow => {
    const fileName = filePath.split('/').pop() || filePath;
    const cleanName = fileName.replace(/\.(md|markdown)$/i, '');
    const frontmatter = extractFrontmatter(content);
    const { headings, rawHeadings } = extractHeadingsData(content);

    return {
      path: filePath,
      name: cleanName,
      frontmatter,
      headings,
      rawHeadings,
      rawContent: content,
    };
  }, []);

  // Fetch or load from cache
  const loadData = useCallback(async (forceFetch = false) => {
    setErrorMessage(null);

    // ==========================================
    // Mode 1: Single YAML Target
    // ==========================================
    if (config.targetType === 'yaml') {
      if (!resolvedYamlPath) {
        setErrorMessage(`対象のYAMLファイルが見つかりません: ${config.yamlFile || '未指定'}`);
        setRowsMap(new Map());
        return;
      }

      setIsYamlLoading(true);
      try {
        let rawContent = '';
        if (!forceFetch) {
          const cached = GitService.getCachedContent(vault, resolvedYamlPath);
          if (cached && cached.content) {
            rawContent = cached.content;
          }
        }

        if (!rawContent) {
          const res = await GitService.fetchFileContent(vault, resolvedYamlPath, { force: forceFetch });
          rawContent = res.content;
        }

        if (!rawContent || !rawContent.trim()) {
          setErrorMessage(`YAMLファイルの内容が空です: ${resolvedYamlPath}`);
          setRowsMap(new Map());
          return;
        }

        // Parse YAML
        let parsedData: any;
        try {
          parsedData = YAML.parse(rawContent);
        } catch (yamlErr: any) {
          setErrorMessage(`YAMLの構文解析に失敗しました: ${yamlErr.message || yamlErr}`);
          setRowsMap(new Map());
          return;
        }

        // Extract array from parsedData
        let arrayData: any[] | null = null;
        const requestedProperty = config.property?.trim();

        if (requestedProperty) {
          // Supports dot-notation: e.g. "project.tasks"
          const parts = requestedProperty.split('.');
          let curr = parsedData;
          for (const part of parts) {
            if (curr != null && typeof curr === 'object') {
              curr = curr[part];
            } else {
              curr = undefined;
              break;
            }
          }

          if (Array.isArray(curr)) {
            arrayData = curr;
          } else {
            const availableKeys = parsedData && typeof parsedData === 'object' ? Object.keys(parsedData).join(', ') : '';
            setErrorMessage(
              `指定されたプロパティ「${requestedProperty}」は配列ではありません。（利用可能なキー: ${availableKeys || 'なし'}）`
            );
            setRowsMap(new Map());
            return;
          }
        } else {
          // Property not specified: check if parsedData itself is an array
          if (Array.isArray(parsedData)) {
            arrayData = parsedData;
          } else if (parsedData && typeof parsedData === 'object') {
            const arrayKeys = Object.keys(parsedData).filter((k) =>
              Array.isArray(parsedData[k])
            );
            if (arrayKeys.length === 1) {
              arrayData = parsedData[arrayKeys[0]];
            } else if (arrayKeys.length > 1) {
              const priorityKey = ['items', 'tasks', 'list', 'data', 'rows', 'records', 'members', 'events'].find(
                (k) => arrayKeys.includes(k)
              );
              arrayData = parsedData[priorityKey || arrayKeys[0]];
            } else {
              setErrorMessage(
                `YAMLファイル内に配列プロパティが見つかりませんでした。（検出されたキー: ${Object.keys(parsedData).join(', ')}）`
              );
              setRowsMap(new Map());
              return;
            }
          }
        }

        if (!arrayData || arrayData.length === 0) {
          setRowsMap(new Map());
          return;
        }

        // Convert array items to BaseRow
        const newMap = new Map<string, BaseRow>();
        arrayData.forEach((item, index) => {
          const rowId = `${resolvedYamlPath}#${index}`;
          const isObj = item && typeof item === 'object' && !Array.isArray(item);
          const props: Record<string, any> = isObj ? { ...item } : { value: item };

          const displayName =
            props.name ||
            props.title ||
            (props.id != null ? `#${props.id}` : `#${index + 1}`);

          const row: BaseRow = {
            path: resolvedYamlPath,
            name: String(displayName),
            frontmatter: props,
            headings: {},
            properties: props,
            index: index + 1,
            rawContent: JSON.stringify(item),
          };
          newMap.set(rowId, row);
        });

        setRowsMap(newMap);
      } catch (err: any) {
        console.error('[Bases] YAML loading error:', err);
        setErrorMessage(`YAMLファイルの読み込みに失敗しました: ${err.message || err}`);
        setRowsMap(new Map());
      } finally {
        setIsYamlLoading(false);
      }
      return;
    }

    // ==========================================
    // Mode 2: Folder of Markdown Files
    // ==========================================
    if (targetFiles.length === 0) {
      setRowsMap(new Map());
      return;
    }

    const newMap = new Map<string, BaseRow>();
    const pendingFetchPaths: string[] = [];

    // 1. Initial pass: load immediately from cache
    for (const filePath of targetFiles) {
      if (!forceFetch) {
        const cached = GitService.getCachedContent(vault, filePath);
        if (cached && cached.content) {
          newMap.set(filePath, parseMarkdownRow(filePath, cached.content));
          continue;
        }
      }
      pendingFetchPaths.push(filePath);
    }

    // Set initial cached rows
    setRowsMap(new Map(newMap));
    setLoadingCount(targetFiles.length - pendingFetchPaths.length);

    // 2. Fetch uncached files in parallel with rate limit safety (concurrency = 3)
    if (pendingFetchPaths.length > 0) {
      const concurrency = 3;
      const chunks: string[][] = [];
      for (let i = 0; i < pendingFetchPaths.length; i += concurrency) {
        chunks.push(pendingFetchPaths.slice(i, i + concurrency));
      }

      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(async (path) => {
            try {
              const res = await GitService.fetchFileContent(vault, path, { force: forceFetch });
              const row = parseMarkdownRow(path, res.content);
              newMap.set(path, row);
              setRowsMap(new Map(newMap));
            } catch (err) {
              console.warn(`[Bases] Failed to fetch content for ${path}:`, err);
              const row = parseMarkdownRow(path, '');
              newMap.set(path, row);
              setRowsMap(new Map(newMap));
            } finally {
              setLoadingCount((prev) => prev + 1);
            }
          })
        );
      }
    }
  }, [config.targetType, config.yamlFile, config.property, resolvedYamlPath, targetFiles, vault, parseMarkdownRow]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Discover all possible columns from loaded rows
  const allColumns = useMemo<BaseColumn[]>(() => {
    const rows = Array.from(rowsMap.values());
    if (rows.length === 0) return [];

    // 1. YAML Target Mode: collect property keys
    if (config.targetType === 'yaml') {
      const propertyKeys = new Set<string>();
      for (const row of rows) {
        const props = row.properties || row.frontmatter || {};
        Object.keys(props).forEach((k) => propertyKeys.add(k));
      }

      const keyOrder = Array.from(propertyKeys);
      keyOrder.sort((a, b) => {
        const priorityKeys = ['id', 'name', 'title', 'key'];
        const pA = priorityKeys.indexOf(a.toLowerCase());
        const pB = priorityKeys.indexOf(b.toLowerCase());
        if (pA !== -1 && pB !== -1) return pA - pB;
        if (pA !== -1) return -1;
        if (pB !== -1) return 1;
        return a.localeCompare(b, 'ja');
      });

      return keyOrder.map((key) => ({
        id: key,
        label: key,
        type: 'property',
        isVisible: true,
        isEditable: false, // will be computed in columns useMemo
      }));
    }

    // 2. Folder Target Mode
    const fmKeys = new Set<string>();
    const headingCounts = new Map<string, number>();

    for (const row of rows) {
      Object.keys(row.frontmatter).forEach((k) => fmKeys.add(k));
      Object.keys(row.headings).forEach((h) => {
        headingCounts.set(h, (headingCounts.get(h) || 0) + 1);
      });
    }

    const cols: BaseColumn[] = [
      { id: 'file', label: 'ファイル名', type: 'file', isVisible: true, isEditable: false },
    ];

    // Frontmatter columns
    Array.from(fmKeys).sort().forEach((key) => {
      cols.push({
        id: `fm:${key}`,
        label: key,
        type: 'frontmatter',
        isVisible: true,
        isEditable: false,
      });
    });

    // Heading columns (ordered by frequency)
    const sortedHeadings = Array.from(headingCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([h]) => h);

    sortedHeadings.forEach((heading) => {
      cols.push({
        id: `heading:${heading}`,
        label: heading,
        type: 'heading',
        isVisible: true,
        isEditable: false,
      });
    });

    return cols;
  }, [rowsMap, config.targetType]);

  // Check if a specific column is editable based on config
  const isColumnEditable = useCallback(
    (col: BaseColumn): boolean => {
      if (col.type === 'file') return false;

      // 1. Frontmatter column
      if (col.type === 'frontmatter') {
        const propName = col.id.replace(/^fm:/, '');
        if (config.editableColumns !== undefined) {
          const normProp = propName.toLowerCase().trim();
          return config.editableColumns.some((c) => {
            const normC = c.toLowerCase().trim();
            return normC === normProp || normC === col.id.toLowerCase().trim();
          });
        }
        return config.isEditableByDefault ?? true;
      }

      // 2. Heading body section column
      if (col.type === 'heading') {
        const headingKey = col.id.replace(/^heading:/, '');
        const cleanHeading = headingKey.replace(/^#+\s*/, '').trim();
        if (config.editableColumns !== undefined) {
          return config.editableColumns.some((c) => {
            const normC = c.toLowerCase().trim();
            return (
              normC === headingKey.toLowerCase().trim() ||
              normC === cleanHeading.toLowerCase().trim() ||
              normC === col.id.toLowerCase().trim() ||
              normC === col.label.toLowerCase().trim()
            );
          });
        }
        return config.isEditableByDefault ?? true;
      }

      // 3. Property column (YAML mode)
      if (config.editableColumns !== undefined) {
        const normProp = col.id.toLowerCase().trim();
        return config.editableColumns.some((c) => {
          const normC = c.toLowerCase().trim();
          return normC === normProp;
        });
      }

      return config.isEditableByDefault ?? true;
    },
    [config.editableColumns, config.isEditableByDefault]
  );

  // Apply visibility and isEditable based on config.columns or user override
  const columns = useMemo<BaseColumn[]>(() => {
    return allColumns.map((col) => {
      const isEditable = isColumnEditable(col);
      let isVisible = true;

      if (typeof visibleColumnsMap[col.id] === 'boolean') {
        isVisible = visibleColumnsMap[col.id];
      } else if (config.columns && config.columns.length > 0) {
        if (col.type === 'file') {
          isVisible = true;
        } else {
          isVisible = config.columns.some((c) => {
            const normC = c.toLowerCase().trim();
            const normLabel = col.label.toLowerCase().trim();
            return normC === normLabel || normC === col.id.toLowerCase();
          });
        }
      }

      return { ...col, isVisible, isEditable };
    });
  }, [allColumns, config.columns, visibleColumnsMap, isColumnEditable]);

  // Auto-set initial sortColumn if not set
  useEffect(() => {
    if (!sortColumn && allColumns.length > 0) {
      if (config.targetType === 'yaml') {
        const idCol = allColumns.find((c) => ['id', 'name', 'title'].includes(c.id.toLowerCase()));
        setSortColumn(idCol ? idCol.id : allColumns[0].id);
      } else {
        setSortColumn('file');
      }
    }
  }, [sortColumn, allColumns, config.targetType]);

  // Sort and filter rows
  const sortedAndFilteredRows = useMemo(() => {
    let result = Array.from(rowsMap.values());

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((row) => {
        if (row.name.toLowerCase().includes(q)) return true;
        const props = row.properties || row.frontmatter || {};
        const hasPropMatch = Object.values(props).some((val) => {
          if (val == null) return false;
          if (Array.isArray(val)) {
            return val.some((item) => String(item).toLowerCase().includes(q));
          }
          return String(val).toLowerCase().includes(q);
        });
        if (hasPropMatch) return true;

        if (row.headings) {
          const hasHeadingMatch = Object.values(row.headings).some((val) =>
            val.toLowerCase().includes(q)
          );
          if (hasHeadingMatch) return true;
        }

        return false;
      });
    }

    // Sort rows
    result.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (config.targetType === 'yaml') {
        const propsA = a.properties || a.frontmatter || {};
        const propsB = b.properties || b.frontmatter || {};
        valA = propsA[sortColumn];
        valB = propsB[sortColumn];
      } else {
        if (sortColumn === 'file') {
          valA = a.name;
          valB = b.name;
        } else if (sortColumn.startsWith('fm:')) {
          const key = sortColumn.replace('fm:', '');
          valA = a.frontmatter[key] ?? '';
        } else if (sortColumn.startsWith('heading:')) {
          const key = sortColumn.replace('heading:', '');
          valA = a.headings[key] ?? '';
        }
      }

      if (valA === valB) return 0;
      if (valA == null || valA === '') return 1;
      if (valB == null || valB === '') return -1;

      // Numeric comparison if both are numbers or parseable numeric values
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      const comp = String(valA).localeCompare(String(valB), 'ja', { numeric: true });
      return sortOrder === 'asc' ? comp : -comp;
    });

    return result;
  }, [rowsMap, searchQuery, sortColumn, sortOrder, config.targetType]);

  const handleSort = (columnId: string) => {
    if (sortColumn === columnId) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(columnId);
      setSortOrder('asc');
    }
  };

  const toggleColumnVisibility = (columnId: string) => {
    setVisibleColumnsMap((prev) => {
      const current = columns.find((c) => c.id === columnId)?.isVisible ?? true;
      return { ...prev, [columnId]: !current };
    });
  };

  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);

  const updateCellProperty = useCallback(
    async (row: BaseRow, columnId: string, newValue: any): Promise<boolean> => {
      const cellKey = `${row.path}:${row.index ?? ''}:${columnId}`;
      const isHeading = columnId.startsWith('heading:');
      const headingKey = isHeading ? columnId.replace(/^heading:/, '') : '';
      const propKey = isHeading ? headingKey : (columnId.startsWith('fm:') ? columnId.replace(/^fm:/, '') : columnId);

      // 1. Snapshot previous state for rollback
      const rowId = config.targetType === 'yaml' ? `${row.path}#${(row.index ?? 1) - 1}` : row.path;
      const prevRow = rowsMap.get(rowId);
      if (!prevRow) return false;

      const prevValue = isHeading
        ? (prevRow.rawHeadings ? prevRow.rawHeadings[headingKey] : prevRow.headings[headingKey])
        : config.targetType === 'yaml'
        ? (prevRow.properties ? prevRow.properties[propKey] : prevRow.frontmatter[propKey])
        : prevRow.frontmatter[propKey];

      // If value didn't change, do nothing
      if (JSON.stringify(prevValue) === JSON.stringify(newValue)) {
        return true;
      }

      // 2. Optimistic UI update
      setRowsMap((prev) => {
        const next = new Map(prev);
        const target = next.get(rowId);
        if (target) {
          let nextRow: BaseRow;
          if (isHeading) {
            const rawVal = String(newValue ?? '');
            const previewVal = cleanHeadingContent(rawVal.split('\n'));
            nextRow = {
              ...target,
              headings: { ...target.headings, [headingKey]: previewVal },
              rawHeadings: { ...(target.rawHeadings || {}), [headingKey]: rawVal },
            };
          } else {
            nextRow = {
              ...target,
              frontmatter: { ...target.frontmatter, [propKey]: newValue },
              properties: target.properties ? { ...target.properties, [propKey]: newValue } : undefined,
            };
            // Also update display name if name/title was edited
            if (['name', 'title'].includes(propKey.toLowerCase())) {
              nextRow.name = String(newValue);
            }
          }
          next.set(rowId, nextRow);
        }
        return next;
      });

      // 3. Save to Git
      setSavingCellKey(cellKey);
      try {
        const rowIndex = config.targetType === 'yaml' ? (row.index != null ? row.index - 1 : 0) : undefined;
        await saveBaseProperty({
          vault,
          targetType: config.targetType,
          filePath: row.path,
          propertyKey: propKey,
          newValue,
          columnType: isHeading ? 'heading' : (config.targetType === 'yaml' ? 'property' : 'frontmatter'),
          rowIndex,
          yamlProperty: config.property,
        });
        return true;
      } catch (err: any) {
        console.error('[Bases] Save property failed:', err);
        // Rollback optimistic update
        setRowsMap((prev) => {
          const next = new Map(prev);
          if (prevRow) {
            next.set(rowId, prevRow);
          }
          return next;
        });
        setErrorMessage(`変更の保存に失敗しました: ${err.message || err}`);
        return false;
      } finally {
        setSavingCellKey(null);
      }
    },
    [config.targetType, config.property, rowsMap, vault]
  );

  const refreshData = async () => {
    await loadData(true);
  };

  const isLoading = config.targetType === 'yaml' ? isYamlLoading : loadingCount < targetFiles.length;
  const totalCount = config.targetType === 'yaml' ? rowsMap.size : targetFiles.length;
  const loadedCount = config.targetType === 'yaml' ? (isYamlLoading ? 0 : rowsMap.size) : loadingCount;

  return {
    config,
    targetType: config.targetType,
    targetFolder: config.folder || 'Vault全体',
    targetYamlPath: resolvedYamlPath || config.yamlFile,
    targetYamlProperty: config.property,
    columns,
    rows: sortedAndFilteredRows,
    allRowsCount: rowsMap.size,
    isLoading,
    progress: { loaded: loadedCount, total: totalCount },
    searchQuery,
    setSearchQuery,
    sortColumn,
    sortOrder,
    handleSort,
    toggleColumnVisibility,
    refreshData,
    updateCellProperty,
    savingCellKey,
    errorMessage,
  };
}
