import { VaultConfig } from '../../types';

export type BaseTargetType = 'folder' | 'yaml';

export type ColumnType = 'file' | 'frontmatter' | 'heading' | 'property';

export interface BaseColumn {
  id: string;
  label: string;
  type: ColumnType;
  isVisible: boolean;
  isEditable: boolean;
}

export interface BaseRow {
  path: string;
  name: string;
  frontmatter: Record<string, any>;
  headings: Record<string, string>;
  rawHeadings?: Record<string, string>;
  properties?: Record<string, any>;
  index?: number;
  rawContent?: string;
}

export interface BaseConfig {
  title?: string;
  targetType: BaseTargetType;
  folder: string;
  yamlFile?: string;
  property?: string;
  columns?: string[];
  editableColumns?: string[];
  isEditableByDefault?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  view?: 'table' | 'cards' | 'list';
}

export interface BasesViewerProps {
  vault: VaultConfig;
  filePath: string;
  content: string;
  allFilePaths: string[];
  onNavigateFile: (path: string) => void;
  onOpenEditModal?: () => void;
}
