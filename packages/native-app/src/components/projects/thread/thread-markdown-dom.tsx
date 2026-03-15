'use dom';

import 'katex/dist/katex.min.css';

import { marked } from 'marked';
import { memo, useEffect, useId, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import type { DOMProps } from 'expo/dom';
import type { CSSProperties } from 'react';
import type { Components } from 'react-markdown';

type ThreadMarkdownDomProps = {
  compact?: boolean;
  dom?: DOMProps;
  markdown: string;
  onHeightChange?: (height: number) => Promise<void> | void;
  resolveImageSource?: (source: string) => string | null;
  resolveLinkHref?: (href: string) => string | null;
  theme: {
    background: string;
    blockquoteBackground: string;
    border: string;
    codeBackground: string;
    foreground: string;
    link: string;
    muted: string;
  };
};

type ThreadMarkdownBlockProps = {
  components: Partial<Components>;
  content: string;
};

const WORD_BREAK_STYLE = 'break-word';

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const blocks = marked
    .lexer(markdown)
    .map((token) => token.raw)
    .filter((block) => block.trim().length > 0);

  return blocks.length > 0 ? blocks : [markdown];
}

function extractLanguage(className?: string): string {
  if (!className) {
    return 'plaintext';
  }

  const match = className.match(/language-([A-Za-z0-9_+-]+)/);
  return match ? match[1] : 'plaintext';
}

const MemoizedThreadMarkdownBlock = memo(
  function ThreadMarkdownBlock({ components, content }: ThreadMarkdownBlockProps) {
    return (
      <ReactMarkdown
        components={components}
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
      >
        {content}
      </ReactMarkdown>
    );
  },
  (previousProps, nextProps) =>
    previousProps.content === nextProps.content && previousProps.components === nextProps.components
);

function createComponents({
  compact,
  resolveImageSource,
  resolveLinkHref,
  theme,
}: {
  compact: boolean;
  resolveImageSource?: (source: string) => string | null;
  resolveLinkHref?: (href: string) => string | null;
  theme: ThreadMarkdownDomProps['theme'];
}): Partial<Components> {
  const fontSize = compact ? 13 : 15;
  const inlineCodeStyle: CSSProperties = {
    background: theme.codeBackground,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    color: theme.foreground,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: compact ? 12 : 13,
    overflowWrap: 'anywhere',
    padding: '2px 6px',
    wordBreak: WORD_BREAK_STYLE,
  };

  return {
    a: ({ href, children }) => {
      const resolvedHref =
        typeof href === 'string'
          ? (resolveLinkHref?.(href) ?? (resolveLinkHref ? null : href))
          : null;

      if (!resolvedHref) {
        return <span>{children}</span>;
      }

      return (
        <a
          href={resolvedHref}
          rel="noreferrer"
          style={{ color: theme.link, textDecoration: 'none' }}
          target="_blank"
        >
          {children}
        </a>
      );
    },
    blockquote: ({ children }) => (
      <blockquote
        style={{
          background: theme.blockquoteBackground,
          borderLeft: `3px solid ${theme.border}`,
          borderRadius: 14,
          margin: compact ? '12px 0' : '16px 0',
          padding: compact ? '10px 12px' : '12px 14px',
        }}
      >
        {children}
      </blockquote>
    ),
    code: ({ children, className, node }) => {
      const isInline =
        !node?.position?.start.line || node.position.start.line === node.position.end.line;

      if (isInline) {
        return <code style={inlineCodeStyle}>{children}</code>;
      }

      const language = extractLanguage(className);

      return (
        <pre
          style={{
            background: theme.codeBackground,
            border: `1px solid ${theme.border}`,
            borderRadius: 16,
            margin: compact ? '12px 0' : '16px 0',
            overflowX: 'auto',
            padding: compact ? '10px 12px' : '12px 14px',
          }}
        >
          <code
            data-language={language}
            style={{
              color: theme.foreground,
              display: 'block',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: compact ? 12 : 13,
              lineHeight: compact ? 1.6 : 1.75,
              whiteSpace: 'pre-wrap',
              wordBreak: WORD_BREAK_STYLE,
            }}
          >
            {children}
          </code>
        </pre>
      );
    },
    h1: ({ children }) => (
      <h1 style={{ fontSize: compact ? 20 : 24, margin: '18px 0 8px' }}>{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 style={{ fontSize: compact ? 18 : 20, margin: '16px 0 8px' }}>{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 style={{ fontSize: compact ? 16 : 18, margin: '14px 0 8px' }}>{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 style={{ fontSize: compact ? 15 : 16, margin: '14px 0 8px' }}>{children}</h4>
    ),
    h5: ({ children }) => (
      <h5 style={{ fontSize: compact ? 14 : 15, margin: '12px 0 6px' }}>{children}</h5>
    ),
    h6: ({ children }) => (
      <h6 style={{ fontSize: compact ? 13 : 14, margin: '12px 0 6px' }}>{children}</h6>
    ),
    img: ({ alt, src }) => {
      const resolvedSource =
        typeof src === 'string'
          ? (resolveImageSource?.(src) ?? (resolveImageSource ? null : src))
          : null;

      if (!resolvedSource) {
        return null;
      }

      return (
        <img
          alt={alt ?? ''}
          src={resolvedSource}
          style={{
            borderRadius: 16,
            display: 'block',
            margin: compact ? '12px 0' : '16px 0',
            maxWidth: '100%',
          }}
        />
      );
    },
    li: ({ children }) => (
      <li
        style={{
          color: theme.foreground,
          fontSize,
          lineHeight: compact ? 1.55 : 1.8,
          margin: '6px 0',
          overflowWrap: 'anywhere',
          wordBreak: WORD_BREAK_STYLE,
        }}
      >
        {children}
      </li>
    ),
    ol: ({ children }) => (
      <ol
        style={{
          margin: compact ? '10px 0 14px' : '12px 0 18px',
          paddingLeft: 24,
        }}
      >
        {children}
      </ol>
    ),
    p: ({ children }) => (
      <p
        style={{
          color: theme.foreground,
          fontSize,
          lineHeight: compact ? 1.55 : 1.8,
          margin: compact ? '0 0 10px' : '0 0 14px',
          overflowWrap: 'anywhere',
          wordBreak: WORD_BREAK_STYLE,
        }}
      >
        {children}
      </p>
    ),
    pre: ({ children }) => <>{children}</>,
    table: ({ children }) => (
      <div
        style={{
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          margin: compact ? '12px 0' : '16px 0',
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
      <td
        style={{
          borderTop: `1px solid ${theme.border}`,
          color: theme.foreground,
          fontSize: compact ? 12 : 14,
          padding: '10px 12px',
          verticalAlign: 'top',
        }}
      >
        {children}
      </td>
    ),
    th: ({ children }) => (
      <th
        style={{
          background: theme.codeBackground,
          color: theme.foreground,
          fontSize: compact ? 12 : 14,
          fontWeight: 600,
          padding: '10px 12px',
          textAlign: 'left',
        }}
      >
        {children}
      </th>
    ),
    ul: ({ children }) => (
      <ul
        style={{
          margin: compact ? '10px 0 14px' : '12px 0 18px',
          paddingLeft: 24,
        }}
      >
        {children}
      </ul>
    ),
  };
}

export default function ThreadMarkdownDom({
  compact = false,
  markdown,
  onHeightChange,
  resolveImageSource,
  resolveLinkHref,
  theme,
}: ThreadMarkdownDomProps) {
  const blockId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastHeightRef = useRef(0);
  const blocks = useMemo(() => parseMarkdownIntoBlocks(markdown), [markdown]);
  const components = useMemo(
    () =>
      createComponents({
        compact,
        resolveImageSource,
        resolveLinkHref,
        theme,
      }),
    [compact, resolveImageSource, resolveLinkHref, theme]
  );

  useEffect(() => {
    if (!onHeightChange) {
      return undefined;
    }

    let frame: number | null = null;
    const minimumHeight = compact ? 24 : 32;
    const reportHeight = () => {
      frame = null;
      const element = containerRef.current;
      if (!element) {
        return;
      }

      const nextHeight = Math.max(
        minimumHeight,
        Math.ceil(Math.max(element.getBoundingClientRect().height, element.scrollHeight))
      );

      if (lastHeightRef.current === nextHeight) {
        return;
      }

      lastHeightRef.current = nextHeight;
      void onHeightChange(nextHeight);
    };

    const scheduleReport = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }

      frame = requestAnimationFrame(reportHeight);
    };

    scheduleReport();

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            scheduleReport();
          })
        : null;

    const element = containerRef.current;
    if (observer && element) {
      observer.observe(element);
    }

    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }

      observer?.disconnect();
    };
  }, [compact, markdown, onHeightChange]);

  return (
    <div
      ref={containerRef}
      style={{
        color: theme.foreground,
        fontFamily:
          'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: compact ? 13 : 15,
        lineHeight: compact ? 1.55 : 1.8,
        overflowWrap: 'anywhere',
        width: '100%',
        wordBreak: WORD_BREAK_STYLE,
      }}
    >
      {blocks.map((block, index) => (
        <MemoizedThreadMarkdownBlock
          key={`${blockId}-block-${index}`}
          components={components}
          content={block}
        />
      ))}

      <style>{`
        .katex-display {
          overflow-x: auto;
          overflow-y: hidden;
          padding: 8px 0;
        }
        p:last-child {
          margin-bottom: 0;
        }
        hr {
          border: 0;
          border-top: 1px solid ${theme.border};
          margin: ${compact ? '14px' : '20px'} 0;
        }
        strong {
          color: ${theme.foreground};
          font-weight: 600;
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
