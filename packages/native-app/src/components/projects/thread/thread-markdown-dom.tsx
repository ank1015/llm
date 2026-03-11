'use dom';

import 'katex/dist/katex.min.css';

import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import type { DOMProps } from 'expo/dom';

type ThreadMarkdownDomProps = {
  compact?: boolean;
  markdown: string;
  theme: {
    background: string;
    blockquoteBackground: string;
    border: string;
    codeBackground: string;
    foreground: string;
    link: string;
    muted: string;
  };
  dom?: DOMProps;
};

export default function ThreadMarkdownDom({
  compact = false,
  markdown,
  theme,
}: ThreadMarkdownDomProps) {
  const fontSize = compact ? 13 : 15;
  const lineHeight = compact ? 1.55 : 1.8;
  const headingScale = compact ? 1.05 : 1.15;

  return (
    <div
      style={{
        color: theme.foreground,
        fontFamily:
          'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize,
        lineHeight,
        width: '100%',
        wordBreak: 'break-word',
      }}
    >
      <ReactMarkdown
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              rel="noreferrer"
              style={{ color: theme.link, textDecoration: 'none' }}
              target="_blank"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote
              style={{
                background: theme.blockquoteBackground,
                borderLeft: `3px solid ${theme.border}`,
                borderRadius: 12,
                margin: '14px 0',
                padding: '12px 14px',
              }}
            >
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isInline = !className;

            if (isInline) {
              return (
                <code
                  style={{
                    background: theme.codeBackground,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 6,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: compact ? 12 : 13,
                    padding: '2px 6px',
                  }}
                >
                  {children}
                </code>
              );
            }

            return (
              <pre
                style={{
                  background: theme.background,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 14,
                  overflowX: 'auto',
                  padding: '12px 14px',
                }}
              >
                <code
                  style={{
                    color: theme.foreground,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: compact ? 12 : 13,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {children}
                </code>
              </pre>
            );
          },
          h1: ({ children }) => (
            <h1 style={{ fontSize: `${fontSize * (headingScale + 0.25)}px`, margin: '18px 0 8px' }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: `${fontSize * (headingScale + 0.12)}px`, margin: '16px 0 8px' }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: `${fontSize * headingScale}px`, margin: '14px 0 8px' }}>
              {children}
            </h3>
          ),
          img: ({ alt, src }) => (
            <img
              alt={alt ?? ''}
              src={src ?? ''}
              style={{ borderRadius: 14, margin: '12px 0', maxWidth: '100%' }}
            />
          ),
          ol: ({ children }) => <ol style={{ margin: '12px 0', paddingLeft: 20 }}>{children}</ol>,
          p: ({ children }) => <p style={{ margin: '0 0 12px' }}>{children}</p>,
          table: ({ children }) => (
            <div
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: 14,
                margin: '14px 0',
                overflowX: 'auto',
              }}
            >
              <table
                style={{
                  borderCollapse: 'collapse',
                  minWidth: '100%',
                  width: '100%',
                }}
              >
                {children}
              </table>
            </div>
          ),
          td: ({ children }) => (
            <td style={{ borderTop: `1px solid ${theme.border}`, padding: '10px 12px' }}>
              {children}
            </td>
          ),
          th: ({ children }) => (
            <th
              style={{
                background: theme.codeBackground,
                padding: '10px 12px',
                textAlign: 'left',
              }}
            >
              {children}
            </th>
          ),
          ul: ({ children }) => <ul style={{ margin: '12px 0', paddingLeft: 20 }}>{children}</ul>,
        }}
      >
        {markdown}
      </ReactMarkdown>
      <style>{`
        .katex-display {
          overflow-x: auto;
          overflow-y: hidden;
          padding: 8px 0;
        }
        p:last-child {
          margin-bottom: 0;
        }
        li {
          margin: 6px 0;
        }
        hr {
          border: 0;
          border-top: 1px solid ${theme.border};
          margin: 20px 0;
        }
        strong {
          color: ${theme.foreground};
        }
        em {
          color: ${theme.foreground};
        }
        code {
          color: ${theme.foreground};
        }
        .katex {
          color: ${theme.foreground};
        }
        .katex .base {
          color: ${theme.foreground};
        }
      `}</style>
    </div>
  );
}
