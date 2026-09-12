import React, { useMemo, useRef, useCallback } from 'react';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Callout } from './Callout';
import { MermaidBlock } from './MermaidBlock';
import {
  preprocessWikiLinks,
  parseCallout,
  extractTOC,
  resolveWikiLinkPath,
} from '../../utils/markdownUtils';
import { ExternalLink, Hash, Copy, Check } from 'lucide-react';

interface MarkdownViewerProps {
  content: string;
  filePath: string;
  allFilePaths: string[];
  onNavigateFile: (path: string, heading?: string) => void;
  onToggleTask?: (lineIndex: number, lineText: string, checked: boolean) => void;
}

interface TaskItemMeta {
  lineIndex: number;
  lineText: string;
  checked: boolean;
}

const CodeBlock: React.FC<{
  language: string;
  children: React.ReactNode;
}> = ({ language, children }) => {
  const [copied, setCopied] = React.useState(false);

  const getCodeString = () => {
    if (typeof children === 'string') return children;
    if (Array.isArray(children)) {
      return children.map((c) => (typeof c === 'string' ? c : '')).join('');
    }
    return String(children || '');
  };

  const handleCopy = async () => {
    try {
      const text = getCodeString().replace(/\n$/, '');
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-zinc-800 bg-[#121214] shadow-sm">
      <div className="bg-zinc-800/50 px-3.5 py-1.5 text-xs text-zinc-400 font-mono border-b border-zinc-800/80 flex justify-between items-center select-none">
        <span className="font-medium text-zinc-300">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60 active:bg-zinc-600/60 transition-colors text-[11px]"
          title="コードをコピー"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">コピー完了</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-zinc-400" />
              <span>コピー</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 text-xs sm:text-sm font-mono text-zinc-300 overflow-x-auto select-text">
        <code>{children}</code>
      </pre>
    </div>
  );
};

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

  // Scroll to heading in document
  const scrollToHeading = useCallback((targetHeadingOrId: string) => {
    const clean = decodeURIComponent(targetHeadingOrId).replace(/^#/, '').trim().toLowerCase();
    if (!clean) return;

    // 1. Direct ID match
    let el = document.getElementById(clean) || document.getElementById(targetHeadingOrId.replace(/^#/, ''));
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    // 2. Look up in TOC items
    const matched = tocList.find((t) => {
      const itemText = t.text.toLowerCase().trim();
      const itemId = t.id.toLowerCase();
      return itemText === clean || itemId.includes(clean) || clean.includes(itemText);
    });
    if (matched) {
      el = document.getElementById(matched.id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }

    // 3. Search DOM headings
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (const h of headings) {
      const text = h.textContent?.trim().toLowerCase() || '';
      if (text === clean || text.includes(clean) || clean.includes(text)) {
        h.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
  }, [tocList]);

  return (
    <div className="markdown-body p-4 sm:p-8 max-w-4xl mx-auto text-zinc-200 leading-relaxed text-[15px] sm:text-[16px] select-text">
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        urlTransform={(url) => {
          if (url.startsWith('wikilink:')) {
            return url;
          }
          return defaultUrlTransform(url);
        }}
        components={{
          // WikiLinks, Internal Anchors, Vault Markdown Files, and External Links
          a({ href, children, ...props }) {
            // 1. WikiLinks: wikilink:TargetNote or wikilink:TargetNote#Heading or wikilink:#Heading
            if (href?.startsWith('wikilink:')) {
              const rawTarget = href.replace('wikilink:', '');
              let notePart = rawTarget;
              let headingPart = '';
              if (rawTarget.includes('#')) {
                const idx = rawTarget.indexOf('#');
                notePart = rawTarget.substring(0, idx);
                headingPart = rawTarget.substring(idx + 1);
              }

              let noteTarget = '';
              try {
                noteTarget = decodeURIComponent(notePart).trim();
              } catch {
                noteTarget = notePart.trim();
              }

              let headingTarget = '';
              try {
                headingTarget = decodeURIComponent(headingPart).trim();
              } catch {
                headingTarget = headingPart.trim();
              }

              const isSameNoteHeading = !noteTarget && !!headingTarget;
              const resolvedPath = noteTarget ? resolveWikiLinkPath(noteTarget, allFilePaths, filePath) : null;

              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    if (isSameNoteHeading) {
                      scrollToHeading(headingTarget);
                      return;
                    }
                    if (resolvedPath) {
                      onNavigateFile(resolvedPath, headingTarget || undefined);
                    } else {
                      alert(`リンク先のノートが見つかりませんでした: "${noteTarget}"`);
                    }
                  }}
                  className={`inline text-left text-purple-400 hover:text-purple-300 font-medium underline underline-offset-4 decoration-1 hover:decoration-2 transition-all cursor-pointer py-0.5 px-0.5 rounded hover:bg-purple-950/30 ${
                    resolvedPath || isSameNoteHeading
                      ? 'decoration-purple-500/50'
                      : 'opacity-60 decoration-dashed decoration-purple-400/40'
                  }`}
                  title={
                    isSameNoteHeading
                      ? `見出しへ移動: ${headingTarget}`
                      : resolvedPath
                      ? `移動: ${resolvedPath}${headingTarget ? ` (#${headingTarget})` : ''}`
                      : `未作成: ${noteTarget}`
                  }
                >
                  {children}
                </button>
              );
            }

            // 2. In-page anchor link: e.g. href="#some-heading"
            if (href?.startsWith('#')) {
              return (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToHeading(href);
                  }}
                  className="inline text-purple-400 hover:text-purple-300 font-medium underline underline-offset-4 decoration-purple-500/50 cursor-pointer"
                  {...props}
                >
                  {children}
                </a>
              );
            }

            // 3. Vault Markdown file link: e.g. [Link](another-note.md) or [Link](./folder/another-note.md)
            const isExternal = /^https?:\/\//i.test(href || '') || /^mailto:/i.test(href || '') || /^tel:/i.test(href || '');
            if (!isExternal && href) {
              const [linkPath, linkHeading] = href.split('#');
              const resolved = resolveWikiLinkPath(linkPath, allFilePaths, filePath);
              if (resolved) {
                return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigateFile(resolved, linkHeading || undefined);
                    }}
                    className="inline text-left text-purple-400 hover:text-purple-300 font-medium underline underline-offset-4 decoration-purple-500/50 decoration-1 hover:decoration-2 transition-all cursor-pointer py-0.5 px-0.5 rounded hover:bg-purple-950/30"
                    title={`移動: ${resolved}`}
                  >
                    {children}
                  </button>
                );
              }
            }

            // 4. Normal external link
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
          input(props) {
            const { type, checked, disabled, readOnly, node, ...rest } = props as any;
            if (type === 'checkbox') {
              const currentTaskIndex = taskRenderIndexRef.current++;
              const taskMeta = taskMetaList[currentTaskIndex];

              return (
                <input
                  type="checkbox"
                  checked={!!checked}
                  disabled={false}
                  onChange={(e) => {
                    if (taskMeta && onToggleTask) {
                      onToggleTask(taskMeta.lineIndex, taskMeta.lineText, e.target.checked);
                    }
                  }}
                  className="w-[18px] h-[18px] mr-2.5 rounded border-zinc-600 bg-zinc-800 text-purple-600 focus:ring-purple-500 focus:ring-offset-zinc-900 cursor-pointer accent-purple-600 align-middle -mt-0.5 transition-transform active:scale-125 shrink-0"
                  {...rest}
                />
              );
            }
            return <input type={type} {...rest} />;
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

            const language = className?.replace('language-', '') || '';

            // Render Mermaid diagrams with lazy loading
            if (language === 'mermaid') {
              return <MermaidBlock code={String(children).replace(/\n$/, '')} />;
            }

            return (
              <CodeBlock language={language} {...props}>
                {children}
              </CodeBlock>
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
