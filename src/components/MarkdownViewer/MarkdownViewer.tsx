import React, { useMemo, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Callout } from './Callout';
import {
  preprocessWikiLinks,
  parseCallout,
  extractTOC,
  resolveWikiLinkPath,
} from '../../utils/markdownUtils';
import { ExternalLink, Hash } from 'lucide-react';

interface MarkdownViewerProps {
  content: string;
  filePath: string;
  allFilePaths: string[];
  onNavigateFile: (path: string) => void;
  onToggleTask?: (lineIndex: number, lineText: string, checked: boolean) => void;
}

interface TaskItemMeta {
  lineIndex: number;
  lineText: string;
  checked: boolean;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  content,
  filePath,
  allFilePaths,
  onNavigateFile,
  onToggleTask,
}) => {
  // Preprocess content for WikiLinks
  const processedContent = useMemo(() => {
    return preprocessWikiLinks(content);
  }, [content]);

  // Index all tasks in the raw content to map to interactive checkboxes
  const taskMetaList = useMemo(() => {
    const list: TaskItemMeta[] = [];
    const lines = content.split('\n');
    let inCode = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('```')) {
        inCode = !inCode;
        continue;
      }
      if (inCode) continue;

      const taskMatch = line.match(/^(\s*[-*+]\s*\[)([ xX])(\]\s*.*)$/);
      if (taskMatch) {
        const isChecked = taskMatch[2].toLowerCase() === 'x';
        list.push({
          lineIndex: i,
          lineText: line,
          checked: isChecked,
        });
      }
    }
    return list;
  }, [content]);

  // Counter to map rendered checkboxes to taskMetaList
  const taskRenderIndexRef = useRef(0);
  taskRenderIndexRef.current = 0;

  // Extract headings for ID mapping
  const tocList = useMemo(() => {
    return extractTOC(content);
  }, [content]);
  const headingRenderIndexRef = useRef(0);
  headingRenderIndexRef.current = 0;

  return (
    <div className="markdown-body p-4 sm:p-8 max-w-4xl mx-auto text-zinc-200 leading-relaxed text-[15px] sm:text-[16px]">
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          // WikiLinks and External Links
          a({ href, children, ...props }) {
            if (href?.startsWith('wikilink:')) {
              const noteTarget = decodeURIComponent(href.replace('wikilink:', ''));
              const resolvedPath = resolveWikiLinkPath(noteTarget, allFilePaths, filePath);

              return (
                <button
                  type="button"
                  onClick={() => {
                    if (resolvedPath) {
                      onNavigateFile(resolvedPath);
                    } else {
                      alert(`リンク先のノートが見つかりませんでした: "${noteTarget}"`);
                    }
                  }}
                  className="inline-flex items-center gap-0.5 text-purple-400 hover:text-purple-300 font-medium underline decoration-purple-500/50 underline-offset-4 decoration-1 hover:decoration-2 transition-all cursor-pointer py-0.5 px-1 -mx-1 rounded hover:bg-purple-950/30"
                  title={resolvedPath ? `移動: ${resolvedPath}` : `未作成: ${noteTarget}`}
                >
                  <span>{children}</span>
                </button>
              );
            }

            // Normal external link
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 underline underline-offset-4 decoration-sky-500/40 hover:decoration-sky-400 transition-colors"
                {...props}
              >
                <span>{children}</span>
                <ExternalLink className="w-3 h-3 inline-block shrink-0 opacity-70" />
              </a>
            );
          },

          // Callouts via blockquote
          blockquote({ children, ...props }) {
            // Check if first child paragraph contains [!TYPE]
            let calloutType: string | null = null;
            let calloutTitle = '';
            let contentNodes = children;

            const childArray = React.Children.toArray(children);
            if (childArray.length > 0) {
              const firstChild = childArray[0];
              if (React.isValidElement(firstChild) && firstChild.props?.children) {
                const subChildren = React.Children.toArray(firstChild.props.children);
                if (typeof subChildren[0] === 'string') {
                  const firstText = subChildren[0];
                  const calloutInfo = parseCallout(firstText);
                  if (calloutInfo) {
                    calloutType = calloutInfo.type;
                    calloutTitle = calloutInfo.title;

                    // Remaining text in first paragraph
                    const remainingText = firstText.replace(/^\[!([a-zA-Z]+)\][+-]?\s*.*(\n|$)/, '').trim();
                    const newSubChildren = [remainingText, ...subChildren.slice(1)].filter(Boolean);

                    const updatedFirstChild = React.cloneElement(firstChild, {}, ...newSubChildren);
                    contentNodes = [updatedFirstChild, ...childArray.slice(1)];
                  }
                }
              }
            }

            if (calloutType) {
              return (
                <Callout type={calloutType as any} title={calloutTitle}>
                  {contentNodes}
                </Callout>
              );
            }

            return (
              <blockquote
                className="border-l-4 border-zinc-700 pl-4 py-1 my-3 text-zinc-400 italic bg-zinc-900/30 rounded-r"
                {...props}
              >
                {children}
              </blockquote>
            );
          },

          // Headings with IDs for TOC scrolling
          h1({ children }) {
            const heading = tocList[headingRenderIndexRef.current++];
            return (
              <h1
                id={heading?.id}
                className="text-2xl sm:text-3xl font-bold text-white mt-8 mb-4 pb-2 border-b border-zinc-800 flex items-center gap-2 group scroll-mt-20"
              >
                <span>{children}</span>
                {heading?.id && (
                  <a
                    href={`#${heading.id}`}
                    className="opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity text-zinc-500"
                  >
                    <Hash className="w-5 h-5" />
                  </a>
                )}
              </h1>
            );
          },
          h2({ children }) {
            const heading = tocList[headingRenderIndexRef.current++];
            return (
              <h2
                id={heading?.id}
                className="text-xl sm:text-2xl font-bold text-zinc-100 mt-7 mb-3 pb-1 border-b border-zinc-800/60 flex items-center gap-2 group scroll-mt-20"
              >
                <span>{children}</span>
                {heading?.id && (
                  <a
                    href={`#${heading.id}`}
                    className="opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity text-zinc-500"
                  >
                    <Hash className="w-4 h-4" />
                  </a>
                )}
              </h2>
            );
          },
          h3({ children }) {
            const heading = tocList[headingRenderIndexRef.current++];
            return (
              <h3
                id={heading?.id}
                className="text-lg sm:text-xl font-semibold text-zinc-200 mt-6 mb-2 flex items-center gap-2 group scroll-mt-20"
              >
                <span>{children}</span>
              </h3>
            );
          },
          h4({ children }) {
            const heading = tocList[headingRenderIndexRef.current++];
            return (
              <h4 id={heading?.id} className="text-base font-semibold text-zinc-300 mt-5 mb-2 scroll-mt-20">
                {children}
              </h4>
            );
          },

          // Interactive Checkboxes
          input({ type, checked, ...props }) {
            if (type === 'checkbox') {
              const currentTaskIndex = taskRenderIndexRef.current++;
              const taskMeta = taskMetaList[currentTaskIndex];

              return (
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (taskMeta && onToggleTask) {
                      onToggleTask(taskMeta.lineIndex, taskMeta.lineText, e.target.checked);
                    }
                  }}
                  className="w-4 h-4 mr-2 rounded border-zinc-600 bg-zinc-800 text-purple-600 focus:ring-purple-500 focus:ring-offset-zinc-900 cursor-pointer accent-purple-600 align-middle -mt-0.5 transition-transform active:scale-125"
                  {...props}
                />
              );
            }
            return <input type={type} {...props} />;
          },

          // Tables
          table({ children }) {
            return (
              <div className="my-4 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/40">
                <table className="w-full text-left text-sm border-collapse">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-zinc-800/60 text-zinc-200 font-semibold border-b border-zinc-700/60">{children}</thead>;
          },
          tbody({ children }) {
            return <tbody className="divide-y divide-zinc-800/50">{children}</tbody>;
          },
          tr({ children }) {
            return <tr className="hover:bg-zinc-800/30 transition-colors">{children}</tr>;
          },
          th({ children }) {
            return <th className="py-2.5 px-3.5 whitespace-nowrap">{children}</th>;
          },
          td({ children }) {
            return <td className="py-2.5 px-3.5">{children}</td>;
          },

          // Lists
          ul({ children, className }) {
            // Task lists have class 'contains-task-list'
            const isTaskList = className?.includes('contains-task-list');
            return (
              <ul className={`my-2 space-y-1.5 ${isTaskList ? 'list-none pl-0' : 'list-disc pl-6 text-zinc-300'}`}>
                {children}
              </ul>
            );
          },
          ol({ children }) {
            return <ol className="my-2 space-y-1.5 list-decimal pl-6 text-zinc-300">{children}</ol>;
          },
          li({ children, className }) {
            const isTaskItem = className?.includes('task-list-item');
            return (
              <li className={`leading-relaxed ${isTaskItem ? 'flex items-start my-1' : ''}`}>
                {children}
              </li>
            );
          },

          // Code blocks
          code({ className, children, ...props }) {
            const isInline = !className && typeof children === 'string' && !children.includes('\n');
            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded text-[13px] bg-zinc-800 text-purple-300 font-mono border border-zinc-700/60"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <div className="my-3 rounded-lg overflow-hidden border border-zinc-800 bg-[#121214]">
                <div className="bg-zinc-800/40 px-3 py-1 text-xs text-zinc-400 font-mono border-b border-zinc-800/60 flex justify-between items-center">
                  <span>{className?.replace('language-', '') || 'code'}</span>
                </div>
                <pre className="p-3 text-xs sm:text-sm font-mono text-zinc-300 overflow-x-auto">
                  <code {...props}>{children}</code>
                </pre>
              </div>
            );
          },

          // Paragraphs
          p({ children }) {
            return <p className="my-2.5 text-zinc-300 leading-relaxed">{children}</p>;
          },

          // Horizontal rule
          hr() {
            return <hr className="my-6 border-zinc-800" />;
          },
        }}
      >
        {processedContent}
      </Markdown>
    </div>
  );
};
