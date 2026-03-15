'use dom';

import './artifact-file-viewer-dom.css';
import 'katex/dist/katex.min.css';

import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { codeToHtml } from 'shiki';

import type {
  ArtifactFileViewerTheme,
  ArtifactViewerKind,
} from '@/components/projects/artifacts/artifact-file-viewer-shared';
import type { DOMProps } from 'expo/dom';
import type { ComponentType, CSSProperties, ReactNode } from 'react';
import type { Components } from 'react-markdown';

import {
  buildRawArtifactFileUrl,
  getPathBasename,
  getPathExtension,
  normalizeRelativePath,
  resolveMonacoLanguage,
} from '@/components/projects/artifacts/artifact-file-viewer-shared';

type ArtifactFileViewerDomProps = {
  artifactFileBaseUrl: string;
  content: string;
  copyText: (text: string) => Promise<void>;
  currentFileRawUrl: string;
  dom?: DOMProps;
  filePath: string;
  isBinary: boolean;
  openExternal: (url: string) => Promise<void>;
  size: number;
  theme: ArtifactFileViewerTheme;
  truncated: boolean;
  viewerKind: ArtifactViewerKind;
};

type MonacoEditorProps = {
  height: string;
  language: string;
  options: Record<string, unknown>;
  theme: string;
  value: string;
};

const GENERIC_PROTOCOL_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const EXTERNAL_LINK_RE = /^(https?:|mailto:|tel:)/i;
const EXTERNAL_IMAGE_RE = /^(https?:|data:image\/)/i;
const MAX_TABLE_ROWS = 500;
const MAX_TABLE_COLUMNS = 50;

function getParentDirectory(path: string): string {
  const safePath = normalizeRelativePath(path);
  const slashIndex = safePath.lastIndexOf('/');

  if (slashIndex === -1) {
    return '';
  }

  return safePath.slice(0, slashIndex);
}

function resolveArtifactPath(baseFilePath: string, target: string): string | null {
  const trimmedTarget = target.trim();
  if (!trimmedTarget || trimmedTarget.startsWith('#') || GENERIC_PROTOCOL_RE.test(trimmedTarget)) {
    return null;
  }

  const match = /^(.*?)([?#].*)?$/.exec(trimmedTarget);
  const pathPart = match?.[1] ?? trimmedTarget;
  const segments = pathPart.startsWith('/')
    ? []
    : getParentDirectory(baseFilePath).split('/').filter(Boolean);

  for (const segment of pathPart.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  const resolvedPath = normalizeRelativePath(segments.join('/'));
  return resolvedPath.length > 0 ? resolvedPath : null;
}

function resolveArtifactUrl(
  artifactFileBaseUrl: string,
  baseFilePath: string,
  target: string,
  kind: 'link' | 'image'
): string | null {
  const trimmedTarget = target.trim();
  if (!trimmedTarget || trimmedTarget.startsWith('#')) {
    return null;
  }

  if (kind === 'link' && EXTERNAL_LINK_RE.test(trimmedTarget)) {
    return trimmedTarget;
  }

  if (kind === 'image' && EXTERNAL_IMAGE_RE.test(trimmedTarget)) {
    return trimmedTarget;
  }

  if (GENERIC_PROTOCOL_RE.test(trimmedTarget)) {
    return null;
  }

  const match = /^(.*?)([?#].*)?$/.exec(trimmedTarget);
  const suffix = match?.[2] ?? '';
  const resolvedPath = resolveArtifactPath(baseFilePath, trimmedTarget);

  if (!resolvedPath) {
    return null;
  }

  return `${buildRawArtifactFileUrl(artifactFileBaseUrl, resolvedPath)}${suffix}`;
}

function extractLanguage(className?: string): string {
  if (!className) return 'plaintext';
  const match = className.match(/language-([A-Za-z0-9_+-]+)/);
  return match ? match[1] : 'plaintext';
}

function stringifyNodeChildren(children: ReactNode): string {
  if (typeof children === 'string') {
    return children;
  }

  if (typeof children === 'number') {
    return `${children}`;
  }

  if (Array.isArray(children)) {
    return children.map((child) => stringifyNodeChildren(child)).join('');
  }

  return '';
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(value);
      value = '';
      continue;
    }

    value += char;
  }

  cells.push(value);
  return cells;
}

function parseDelimitedTable(
  content: string,
  delimiter: string
): {
  rows: string[][];
  truncatedColumns: boolean;
  truncatedRows: boolean;
} {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const limitedLines = lines.slice(0, MAX_TABLE_ROWS);
  const rows: string[][] = [];
  let truncatedColumns = false;

  for (const line of limitedLines) {
    const parsed = parseDelimitedLine(line, delimiter);
    if (parsed.length > MAX_TABLE_COLUMNS) {
      truncatedColumns = true;
    }
    rows.push(parsed.slice(0, MAX_TABLE_COLUMNS));
  }

  return {
    rows,
    truncatedColumns,
    truncatedRows: lines.length > MAX_TABLE_ROWS,
  };
}

function CopyButton({
  copyText,
  text,
}: {
  copyText: (text: string) => Promise<void>;
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setCopied(false);
    }, 1800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copied]);

  const handleCopy = async () => {
    try {
      await copyText(text);
      setCopied(true);
    } catch {
      // Native clipboard bridge can fail silently in the webview; keep the viewer usable.
    }
  };

  return (
    <button
      className="artifact-file-viewer__button artifact-file-viewer__button--ghost"
      type="button"
      onClick={() => void handleCopy()}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CodeBlockThemed({
  code,
  copyText,
  isDark,
  language = 'plaintext',
}: {
  code: string;
  copyText: (text: string) => Promise<void>;
  isDark: boolean;
  language?: string;
}) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const trimmedCode = code.replace(/\n$/, '');
  const displayLanguage = language === 'plaintext' ? '' : language;

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      if (!trimmedCode) {
        setHighlightedHtml('<pre><code></code></pre>');
        return;
      }

      try {
        const html = await codeToHtml(trimmedCode, {
          lang: language,
          theme: isDark ? 'github-dark' : 'github-light',
        });

        if (!cancelled) {
          setHighlightedHtml(html);
        }
      } catch {
        try {
          const html = await codeToHtml(trimmedCode, {
            lang: 'plaintext',
            theme: isDark ? 'github-dark' : 'github-light',
          });

          if (!cancelled) {
            setHighlightedHtml(html);
          }
        } catch {
          if (!cancelled) {
            setHighlightedHtml(null);
          }
        }
      }
    }

    void highlight();

    return () => {
      cancelled = true;
    };
  }, [isDark, language, trimmedCode]);

  return (
    <div className="artifact-file-viewer__code">
      <div className="artifact-file-viewer__code-header">
        <span className="artifact-file-viewer__code-language">{displayLanguage || 'Code'}</span>
        <CopyButton copyText={copyText} text={trimmedCode} />
      </div>

      {highlightedHtml ? (
        <div
          className="artifact-file-viewer__code-scroll"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <div className="artifact-file-viewer__code-scroll">
          <pre className="artifact-file-viewer__code-fallback">
            <code>{trimmedCode}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

function ArtifactCodeViewer({
  content,
  filePath,
  isDark,
  copyText,
}: {
  content: string;
  copyText: (text: string) => Promise<void>;
  filePath: string;
  isDark: boolean;
}) {
  const [MonacoEditor, setMonacoEditor] = useState<ComponentType<MonacoEditorProps> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const language = useMemo(() => resolveMonacoLanguage(filePath), [filePath]);

  useEffect(() => {
    let cancelled = false;

    void import('@monaco-editor/react')
      .then((module) => {
        if (!cancelled) {
          setMonacoEditor(() => module.default as ComponentType<MonacoEditorProps>);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!MonacoEditor || loadFailed) {
    return (
      <CodeBlockThemed code={content} copyText={copyText} isDark={isDark} language={language} />
    );
  }

  return (
    <div className="artifact-file-viewer__fill">
      <MonacoEditor
        height="100%"
        language={language}
        options={{
          automaticLayout: true,
          bracketPairColorization: {
            enabled: true,
          },
          contextmenu: false,
          folding: true,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: 13,
          glyphMargin: false,
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          lineDecorationsWidth: 12,
          lineNumbers: 'on',
          minimap: { enabled: false },
          padding: {
            bottom: 20,
            top: 10,
          },
          readOnly: true,
          renderLineHighlight: 'line',
          renderWhitespace: 'selection',
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          tabSize: 2,
          wordWrap: 'off',
        }}
        theme={isDark ? 'vs-dark' : 'vs'}
        value={content}
      />
    </div>
  );
}

function ArtifactMarkdownPreview({
  artifactFileBaseUrl,
  copyText,
  filePath,
  markdown,
  openExternal,
  theme,
}: {
  artifactFileBaseUrl: string;
  copyText: (text: string) => Promise<void>;
  filePath: string;
  markdown: string;
  openExternal: (url: string) => Promise<void>;
  theme: ArtifactFileViewerTheme;
}) {
  const components = useMemo<Partial<Components>>(
    () => ({
      a: ({ href, children: content }) => {
        const targetHref = href?.trim() ?? '';
        if (!targetHref) {
          return <span>{content}</span>;
        }

        if (targetHref.startsWith('#')) {
          return <a href={targetHref}>{content}</a>;
        }

        if (GENERIC_PROTOCOL_RE.test(targetHref) && !EXTERNAL_LINK_RE.test(targetHref)) {
          return <span>{content}</span>;
        }

        const resolvedHref =
          resolveArtifactUrl(artifactFileBaseUrl, filePath, targetHref, 'link') ?? targetHref;

        return (
          <a
            href={resolvedHref}
            onClick={(event) => {
              event.preventDefault();
              void openExternal(resolvedHref);
            }}
          >
            {content}
          </a>
        );
      },
      blockquote: ({ children: content }) => <blockquote>{content}</blockquote>,
      code: ({ className, children: content }) => {
        const language = extractLanguage(className);
        const code = stringifyNodeChildren(content).replace(/\n$/, '');
        const isBlock = Boolean(className);

        if (!isBlock) {
          return <code>{content}</code>;
        }

        return (
          <CodeBlockThemed
            code={code}
            copyText={copyText}
            isDark={theme.isDark}
            language={language}
          />
        );
      },
      img: ({ alt, src }) => {
        const safeSrc = typeof src === 'string' ? src.trim() : '';
        if (!safeSrc) {
          return null;
        }

        if (GENERIC_PROTOCOL_RE.test(safeSrc) && !EXTERNAL_IMAGE_RE.test(safeSrc)) {
          return null;
        }

        const resolvedSrc = resolveArtifactUrl(artifactFileBaseUrl, filePath, safeSrc, 'image');
        const finalSrc = resolvedSrc ?? safeSrc;

        return <img alt={alt ?? ''} src={finalSrc} />;
      },
      input: ({ checked, disabled, type }) => {
        if (type !== 'checkbox') {
          return null;
        }

        return <input checked={checked} disabled={disabled ?? true} readOnly type="checkbox" />;
      },
      pre: ({ children: content }) => <>{content}</>,
      table: ({ children: content }) => (
        <div className="artifact-file-viewer__markdown-table">
          <table>{content}</table>
        </div>
      ),
    }),
    [artifactFileBaseUrl, copyText, filePath, openExternal, theme.isDark]
  );

  return (
    <div className="artifact-file-viewer__markdown">
      <ReactMarkdown
        components={components}
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

export default function ArtifactFileViewerDom({
  artifactFileBaseUrl,
  content,
  copyText,
  currentFileRawUrl,
  filePath,
  openExternal,
  theme,
  truncated,
  viewerKind,
}: ArtifactFileViewerDomProps) {
  const safeFilePath = filePath || '';
  const rootStyle = useMemo(
    () =>
      ({
        '--viewer-background': theme.background,
        '--viewer-border': theme.border,
        '--viewer-foreground': theme.foreground,
        '--viewer-hover': theme.hover,
        '--viewer-link': theme.link,
        '--viewer-muted': theme.muted,
        '--viewer-panel': theme.panel,
      }) as CSSProperties,
    [theme]
  );

  const tableData = useMemo(() => {
    if (viewerKind !== 'csv') {
      return null;
    }

    const delimiter = getPathExtension(safeFilePath) === 'tsv' ? '\t' : ',';
    return parseDelimitedTable(content, delimiter);
  }, [content, safeFilePath, viewerKind]);

  let preview: ReactNode;

  switch (viewerKind) {
    case 'code':
      preview = (
        <ArtifactCodeViewer
          content={content}
          copyText={copyText}
          filePath={safeFilePath}
          isDark={theme.isDark}
        />
      );
      break;
    case 'markdown':
      preview = (
        <div className="artifact-file-viewer__scroll artifact-file-viewer__scroll--padded">
          <ArtifactMarkdownPreview
            artifactFileBaseUrl={artifactFileBaseUrl}
            copyText={copyText}
            filePath={safeFilePath}
            markdown={content}
            openExternal={openExternal}
            theme={theme}
          />
        </div>
      );
      break;
    case 'csv':
      preview =
        tableData && tableData.rows.length > 0 ? (
          <div className="artifact-file-viewer__table-wrap">
            <div className="artifact-file-viewer__table-scroll">
              <table className="artifact-file-viewer__table">
                <thead>
                  <tr>
                    {tableData.rows[0].map((cell, index) => (
                      <th key={`header-${index}`}>{cell || `Column ${index + 1}`}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.rows.slice(1).map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`cell-${rowIndex}-${cellIndex}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tableData.truncatedRows || tableData.truncatedColumns ? (
              <div className="artifact-file-viewer__table-note">
                Table preview truncated for performance.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="artifact-file-viewer__center">
            <div className="artifact-file-viewer__empty">CSV file has no rows.</div>
          </div>
        );
      break;
    case 'image':
      preview = (
        <div className="artifact-file-viewer__image">
          <img alt={getPathBasename(safeFilePath)} src={currentFileRawUrl} />
        </div>
      );
      break;
    case 'pdf':
      preview = (
        <iframe
          className="artifact-file-viewer__iframe"
          src={currentFileRawUrl}
          title={safeFilePath}
        />
      );
      break;
    case 'audio':
      preview = (
        <div className="artifact-file-viewer__media">
          <audio controls src={currentFileRawUrl}>
            <track kind="captions" />
          </audio>
        </div>
      );
      break;
    case 'video':
      preview = (
        <div className="artifact-file-viewer__media">
          <video className="artifact-file-viewer__video" controls src={currentFileRawUrl} />
        </div>
      );
      break;
    case 'binary':
      preview = (
        <div className="artifact-file-viewer__center">
          <div className="artifact-file-viewer__empty">
            <div>This file is binary and cannot be rendered as text.</div>
            <div className="artifact-file-viewer__actions">
              <button
                className="artifact-file-viewer__button"
                type="button"
                onClick={() => void openExternal(currentFileRawUrl)}
              >
                Open Raw File
              </button>
            </div>
          </div>
        </div>
      );
      break;
    case 'text':
    default:
      preview = (
        <div className="artifact-file-viewer__text">
          <pre>
            <code>
              {content.split('\n').map((line, index) => (
                <span className="artifact-file-viewer__text-line" key={`line-${index + 1}`}>
                  <span className="artifact-file-viewer__text-line-number">{index + 1}</span>
                  {line.length > 0 ? line : ' '}
                </span>
              ))}
            </code>
          </pre>
        </div>
      );
      break;
  }

  return (
    <div className="artifact-file-viewer" style={rootStyle}>
      <div className="artifact-file-viewer__panel">
        {truncated ? (
          <div className="artifact-file-viewer__truncate-note">
            Only part of this file is loaded on mobile. Open the raw file externally if you need the
            full contents.
          </div>
        ) : null}
        {preview}
      </div>
    </div>
  );
}
