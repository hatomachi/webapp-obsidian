import React, { useState } from 'react';
import {
  Table,
  Columns,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileText,
  FileCode,
  Folder,
  RotateCw,
  Edit3,
  Edit2,
  Check,
  Hash,
  Heading,
  Code2,
  ExternalLink,
  SlidersHorizontal,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { BasesViewerProps } from './types';
import { useBasesData } from './useBasesData';
import { EditableCell } from './EditableCell';

export const BasesViewer: React.FC<BasesViewerProps> = ({
  vault,
  filePath,
  content,
  allFilePaths,
  onNavigateFile,
  onOpenEditModal,
}) => {
  const {
    targetType,
    targetFolder,
    targetYamlPath,
    targetYamlProperty,
    columns,
    rows,
    allRowsCount,
    isLoading,
    progress,
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
  } = useBasesData(vault, filePath, content, allFilePaths);

  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fileName = filePath.split('/').pop() || filePath;
  const visibleColumns = columns.filter((c) => c.isVisible);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
    } finally {
      setIsRefreshing(false);
    }
  };

  const renderCellValue = (row: any, col: any) => {
    // 1. File column (in folder mode)
    if (col.type === 'file') {
      return (
        <button
          type="button"
          onClick={() => onNavigateFile(row.path)}
          className="group flex items-center gap-2 text-left font-medium text-purple-300 hover:text-purple-100 transition-colors"
        >
          <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0 group-hover:scale-110 transition-transform" />
          <span className="underline decoration-purple-500/40 hover:decoration-purple-400 truncate max-w-[200px] sm:max-w-xs">
            {row.name}
          </span>
          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
        </button>
      );
    }

    // 2. Property column (in YAML mode)
    if (col.type === 'property') {
      const val = row.properties ? row.properties[col.id] : row.frontmatter[col.id];

      if (val === undefined || val === null || val === '') {
        return <span className="text-zinc-600 font-mono text-[11px]">-</span>;
      }

      // ID or Index column: stylish monospace accent
      if (col.id.toLowerCase() === 'id' || col.id.toLowerCase() === 'index' || col.id.toLowerCase() === 'no') {
        return (
          <span className="font-mono font-semibold text-purple-300 text-xs px-1.5 py-0.5 rounded bg-purple-950/40 border border-purple-800/30">
            {String(val)}
          </span>
        );
      }

      // Array (e.g. tags, skills, categories)
      if (Array.isArray(val)) {
        if (val.length === 0) return <span className="text-zinc-600 text-[11px]">-</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {val.map((item, idx) => (
              <span
                key={idx}
                className="px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-800/40 text-[10px] text-purple-300 font-medium whitespace-nowrap"
              >
                {typeof item === 'object' ? JSON.stringify(item) : String(item)}
              </span>
            ))}
          </div>
        );
      }

      // Status styling
      const keyLower = col.id.toLowerCase();
      if (keyLower.includes('status') || keyLower === 'state') {
        const str = String(val);
        const isDone = /完了|done|close|済|pass/i.test(str);
        const isInProgress = /進行|progress|作業|doing|wip/i.test(str);
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              isDone
                ? 'bg-emerald-950/70 border border-emerald-700/60 text-emerald-300'
                : isInProgress
                ? 'bg-amber-950/70 border border-amber-700/60 text-amber-300'
                : 'bg-zinc-800 border border-zinc-700 text-zinc-300'
            }`}
          >
            {str}
          </span>
        );
      }

      // Priority styling
      if (keyLower.includes('priority')) {
        const str = String(val);
        const isHigh = /高|high|urgent|緊急/i.test(str);
        const isLow = /低|low/i.test(str);
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
              isHigh
                ? 'bg-rose-950/60 border border-rose-800/50 text-rose-300'
                : isLow
                ? 'bg-zinc-800/60 border border-zinc-700/50 text-zinc-400'
                : 'bg-amber-950/50 border border-amber-800/40 text-amber-300'
            }`}
          >
            {str}
          </span>
        );
      }

      // Boolean
      if (typeof val === 'boolean') {
        return (
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              val
                ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/40'
                : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            {val ? 'TRUE' : 'FALSE'}
          </span>
        );
      }

      // Object (render JSON concisely)
      if (typeof val === 'object') {
        return (
          <span className="font-mono text-[11px] text-zinc-400 truncate max-w-xs block">
            {JSON.stringify(val)}
          </span>
        );
      }

      // WikiLink detection in string (e.g. [[Note]])
      const strVal = String(val);
      const wikiMatch = strVal.match(/^\[\[(.*?)\]\]$/);
      if (wikiMatch) {
        const noteTarget = wikiMatch[1].split('|')[0].trim();
        const displayLabel = wikiMatch[1].split('|')[1]?.trim() || noteTarget;
        return (
          <button
            type="button"
            onClick={() => onNavigateFile(noteTarget)}
            className="text-purple-400 hover:text-purple-200 underline decoration-purple-500/40 text-xs font-medium"
          >
            {displayLabel}
          </button>
        );
      }

      return <span className="text-zinc-200 text-xs break-words">{strVal}</span>;
    }

    // 3. Frontmatter column (in folder mode)
    if (col.type === 'frontmatter') {
      const key = col.id.replace('fm:', '');
      const val = row.frontmatter[key];

      if (val === undefined || val === null || val === '') {
        return <span className="text-zinc-600 font-mono text-[11px]">-</span>;
      }

      // Array (e.g. tags)
      if (Array.isArray(val)) {
        if (val.length === 0) return <span className="text-zinc-600 text-[11px]">-</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {val.map((item, idx) => (
              <span
                key={idx}
                className="px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-800/40 text-[10px] text-purple-300 font-medium whitespace-nowrap"
              >
                #{item}
              </span>
            ))}
          </div>
        );
      }

      // Status styling
      if (key.toLowerCase() === 'status') {
        const str = String(val);
        const isDone = /完了|done|close|済/i.test(str);
        const isInProgress = /進行|progress|作業|doing/i.test(str);
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              isDone
                ? 'bg-emerald-950/70 border border-emerald-700/60 text-emerald-300'
                : isInProgress
                ? 'bg-amber-950/70 border border-amber-700/60 text-amber-300'
                : 'bg-zinc-800 border border-zinc-700 text-zinc-300'
            }`}
          >
            {str}
          </span>
        );
      }

      // Boolean
      if (typeof val === 'boolean') {
        return (
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              val
                ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/40'
                : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            {val ? 'TRUE' : 'FALSE'}
          </span>
        );
      }

      return <span className="text-zinc-200 text-xs break-words">{String(val)}</span>;
    }

    // 4. Heading column (in folder mode)
    if (col.type === 'heading') {
      const headingKey = col.id.replace('heading:', '');
      const val = row.headings[headingKey];

      if (!val) {
        return <span className="text-zinc-600 font-mono text-[11px]">-</span>;
      }

      // Checklist summary format: [x/y] text
      const taskMatch = val.match(/^\[(\d+\/\d+)\]\s*(.*)$/);
      if (taskMatch) {
        const [, count, text] = taskMatch;
        return (
          <div className="flex items-center gap-1.5 max-w-sm">
            <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-purple-300 font-mono text-[10px] shrink-0 font-medium">
              {count}
            </span>
            <span className="text-xs text-zinc-300 truncate" title={text}>
              {text}
            </span>
          </div>
        );
      }

      return (
        <span
          className="text-xs text-zinc-300 line-clamp-2 max-w-sm leading-relaxed"
          title={val}
        >
          {val}
        </span>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col h-full bg-obsidian-bg text-obsidian-text">
      {/* Top Banner / Base Header */}
      <div className="shrink-0 border-b border-obsidian-border bg-zinc-900/60 px-4 py-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Base Info & Target Folder */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0">
              <Table className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-zinc-100 truncate">
                  {fileName}
                </h1>
                <span className="px-1.5 py-0.5 rounded bg-purple-950/80 border border-purple-800/60 text-[10px] font-mono text-purple-300 font-semibold uppercase tracking-wider">
                  BASE
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-0.5">
                {targetType === 'yaml' ? (
                  <>
                    <FileCode className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <button
                      type="button"
                      onClick={() => targetYamlPath && onNavigateFile(targetYamlPath)}
                      className="truncate text-purple-300 hover:text-purple-200 underline decoration-purple-500/40 font-mono text-[11px]"
                      title="対象のYAMLファイルを開く"
                    >
                      {targetYamlPath?.split('/').pop() || targetYamlPath}
                    </button>
                    {targetYamlProperty && (
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-mono">
                        › {targetYamlProperty}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Folder className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="truncate">対象: {targetFolder}</span>
                  </>
                )}
                <span className="text-zinc-600">•</span>
                <span>{allRowsCount} 件</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Column Picker Button */}
            <button
              type="button"
              onClick={() => setIsColumnPickerOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                isColumnPickerOpen
                  ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                  : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700/80'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>列設定 ({visibleColumns.length})</span>
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              title="データを再取得"
              className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/80 disabled:opacity-50 transition-colors"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-purple-400' : ''}`} />
            </button>

            {/* Edit Base Definition Button */}
            {onOpenEditModal && (
              <button
                type="button"
                onClick={onOpenEditModal}
                title="Basesの定義ファイルを編集"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/80 text-xs font-medium transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">定義を編集</span>
              </button>
            )}
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="mt-3 flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="表内を検索（属性値、文字列）..."
              className="w-full bg-zinc-900/90 border border-zinc-700/70 rounded-lg pl-8 pr-8 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500/80"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="text-xs text-zinc-400 hidden sm:block">
            表示中: <strong className="text-zinc-200">{rows.length}</strong> / {allRowsCount}
          </div>
        </div>

        {/* Loading Progress Bar */}
        {isLoading && (
          <div className="mt-2.5 flex items-center gap-2 text-[11px] text-purple-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
            <span>
              {targetType === 'yaml'
                ? 'YAMLファイルを取得・パース中...'
                : `ノート情報を同期中 (${progress.loaded} / ${progress.total} 件)...`}
            </span>
          </div>
        )}
      </div>

      {/* Column Visibility Dropdown / Panel */}
      {isColumnPickerOpen && (
        <div className="border-b border-obsidian-border bg-zinc-900/95 p-3.5 text-xs animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
              表示する列（属性）を選択
            </span>
            <button
              type="button"
              onClick={() => setIsColumnPickerOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 mb-3">
            {targetType === 'yaml'
              ? 'チェックを入れたプロパティがテーブルに表示されます。YAML内の項目を検出しています。'
              : 'チェックを入れた属性がテーブルに表示されます。フロントマターおよび共通する ## 見出し を自動検出しています。'}
          </p>
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
            {columns.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() => toggleColumnVisibility(col.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  col.isVisible
                    ? 'bg-purple-600/30 border-purple-500/70 text-purple-200'
                    : 'bg-zinc-800/50 border-zinc-700/60 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[10px] ${
                    col.isVisible
                      ? 'bg-purple-600 border-purple-400 text-white'
                      : 'border-zinc-600'
                  }`}
                >
                  {col.isVisible && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                </div>
                {col.type === 'property' && <Code2 className="w-3 h-3 text-purple-400" />}
                {col.type === 'frontmatter' && <Hash className="w-3 h-3 text-zinc-400" />}
                {col.type === 'heading' && <Heading className="w-3 h-3 text-purple-400" />}
                <span>{col.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Table Container (Responsive Horizontal Scroll) */}
      <div className="flex-1 overflow-auto">
        {errorMessage ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-12 h-12 rounded-xl bg-amber-950/40 border border-amber-800/50 flex items-center justify-center mb-3 text-amber-400">
              <AlertCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-zinc-200 mb-1">
              データソースを読み込めませんでした
            </p>
            <p className="text-xs text-amber-300/90 max-w-md bg-amber-950/50 border border-amber-800/40 rounded-lg p-2.5 my-2 font-mono break-all">
              {errorMessage}
            </p>
            <p className="text-xs text-zinc-500 max-w-sm">
              Bases定義ファイルの <code>target</code> (または <code>file</code>) と <code>property</code> の設定を確認してください。
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-12 h-12 rounded-xl bg-zinc-800/80 flex items-center justify-center mb-3 text-zinc-500">
              <Table className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-zinc-300 mb-1">
              表示できるデータがありません
            </p>
            <p className="text-xs text-zinc-500 max-w-sm">
              {targetType === 'yaml'
                ? `YAMLファイル「${targetYamlPath}」のプロパティ「${targetYamlProperty || 'root'}」にデータが存在するか、検索条件に一致するか確認してください。`
                : `フォルダ ${targetFolder} にMarkdownファイルが存在するか、検索条件に一致するか確認してください。`}
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse min-w-full">
            <thead>
              <tr className="border-b border-obsidian-border bg-zinc-900/80 sticky top-0 z-10 backdrop-blur">
                {visibleColumns.map((col) => {
                  const isCurrentSort = sortColumn === col.id;
                  return (
                    <th
                      key={col.id}
                      onClick={() => handleSort(col.id)}
                      className="px-3.5 py-2.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer select-none transition-colors border-r border-obsidian-border last:border-r-0 whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1.5">
                        {col.type === 'property' && (
                          <Code2 className="w-3 h-3 text-purple-400/80 shrink-0" />
                        )}
                        {col.type === 'frontmatter' && (
                          <Hash className="w-3 h-3 text-zinc-500 shrink-0" />
                        )}
                        {col.type === 'heading' && (
                          <Heading className="w-3 h-3 text-purple-400/80 shrink-0" />
                        )}
                        <span>{col.label}</span>
                        {col.isEditable && (
                          <span
                            className="inline-flex items-center text-purple-400/80 hover:text-purple-300"
                            title="編集可能列 (表上で直接値を変更できます)"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </span>
                        )}
                        <span className="text-zinc-500 ml-0.5">
                          {isCurrentSort ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-purple-400" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-purple-400" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-40 hover:opacity-100" />
                          )}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {rows.map((row) => (
                <tr
                  key={row.path + (row.index != null ? `#${row.index}` : '')}
                  className="hover:bg-zinc-800/40 transition-colors group"
                >
                  {visibleColumns.map((col) => {
                    const rawVal =
                      col.type === 'property'
                        ? row.properties ? row.properties[col.id] : row.frontmatter[col.id]
                        : col.type === 'frontmatter'
                        ? row.frontmatter[col.id.replace('fm:', '')]
                        : undefined;

                    const cellKey = `${row.path}:${row.index ?? ''}:${col.id}`;
                    const isCellSaving = savingCellKey === cellKey;

                    return (
                      <td
                        key={col.id}
                        className="px-3.5 py-2.5 text-xs border-r border-zinc-800/40 last:border-r-0 align-top"
                      >
                        <EditableCell
                          row={row}
                          col={col}
                          value={rawVal}
                          isSaving={isCellSaving}
                          onSave={(newVal) => updateCellProperty(row, col.id, newVal)}
                        >
                          {renderCellValue(row, col)}
                        </EditableCell>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="shrink-0 px-4 py-2 border-t border-obsidian-border bg-zinc-900/50 text-[11px] text-zinc-500 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>Obsidian Bases View</span>
          <span className="text-zinc-600">•</span>
          <span>{visibleColumns.length} 列表示中</span>
          <span className="text-zinc-600">•</span>
          <span className="text-purple-400/90 font-medium">
            {columns.filter((c) => c.isEditable).length} 列が直接編集可能
          </span>
        </div>
        <div className="font-mono text-[10px] text-zinc-600">
          ソート: {sortColumn} ({sortOrder})
        </div>
      </div>
    </div>
  );
};
