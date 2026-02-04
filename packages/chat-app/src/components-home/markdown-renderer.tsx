/** biome-ignore-all lint/suspicious/noArrayIndexKey: block keys use index by design */
'use client';

import { marked } from 'marked';
import { memo, useId, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import { CodeBlockThemed } from './code-block-themed';

import type { Components } from 'react-markdown';

import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Block-based parsing (reused pattern for streaming perf)            */
/* ------------------------------------------------------------------ */

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown);
  return tokens.map((token) => token.raw);
}

function extractLanguage(className?: string): string {
  if (!className) return 'plaintext';
  const match = className.match(/language-(\w+)/);
  return match ? match[1] : 'plaintext';
}

/* ------------------------------------------------------------------ */
/*  Component overrides                                                */
/* ------------------------------------------------------------------ */

const CHAT_COMPONENTS: Partial<Components> = {
  h1: ({ children }) => (
    <h1 className="text-foreground mt-5 mb-2 text-lg font-semibold">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-foreground mt-4 mb-2 text-base font-semibold">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-foreground mt-3 mb-1.5 text-[15px] font-semibold">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-foreground mt-3 mb-1 text-[15px] font-medium">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="text-foreground mt-3 mb-1 text-[15px] font-medium">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="text-foreground mt-3 mb-1 text-[15px] font-medium">{children}</h6>
  ),

  p: ({ children }) => (
    <p className="text-foreground mb-3 text-[15px] leading-relaxed last:mb-0">{children}</p>
  ),

  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 transition-colors hover:underline dark:text-blue-400"
    >
      {children}
    </a>
  ),

  strong: ({ children }) => <strong className="text-foreground font-semibold">{children}</strong>,

  em: ({ children }) => <em className="italic">{children}</em>,

  blockquote: ({ children }) => (
    <blockquote className="border-home-border bg-home-panel/50 text-muted-foreground my-3 rounded-r-lg border-l-[3px] py-2 pr-3 pl-4 [&>p:last-child]:mb-0 [&>p]:mb-1">
      {children}
    </blockquote>
  ),

  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-5 text-[15px] [&>li]:leading-relaxed">
      {children}
    </ul>
  ),

  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-5 text-[15px] [&>li]:leading-relaxed">
      {children}
    </ol>
  ),

  li: ({ children }) => <li className="text-foreground leading-relaxed">{children}</li>,

  code: function CodeComponent({ className, children, ...props }) {
    const isInline =
      !props.node?.position?.start.line ||
      props.node?.position?.start.line === props.node?.position?.end.line;

    if (isInline) {
      return (
        <code className="bg-home-panel border-home-border rounded-md border px-1.5 py-0.5 font-mono text-[13px]">
          {children}
        </code>
      );
    }

    const language = extractLanguage(className);
    return <CodeBlockThemed code={children as string} language={language} />;
  },

  pre: ({ children }) => <>{children}</>,

  table: ({ children }) => (
    <div className="border-home-border my-3 w-full overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-[14px]">{children}</table>
    </div>
  ),

  thead: ({ children }) => <thead>{children}</thead>,

  tbody: ({ children }) => <tbody>{children}</tbody>,

  tr: ({ children }) => (
    <tr className="border-home-border even:bg-home-panel/30 border-b last:border-b-0">
      {children}
    </tr>
  ),

  th: ({ children }) => (
    <th className="bg-home-panel text-foreground border-home-border border-b px-3 py-2 text-left font-medium">
      {children}
    </th>
  ),

  td: ({ children }) => <td className="text-foreground px-3 py-2">{children}</td>,

  hr: () => <hr className="border-home-border my-6 border-t" />,

  img: ({ src, alt }) => <img src={src} alt={alt ?? ''} className="my-3 max-w-full rounded-lg" />,
};

/* ------------------------------------------------------------------ */
/*  Memoized block renderer                                            */
/* ------------------------------------------------------------------ */

const MemoizedChatBlock = memo(
  function ChatBlock({ content }: { content: string }) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={CHAT_COMPONENTS}>
        {content}
      </ReactMarkdown>
    );
  },
  (prev, next) => prev.content === next.content
);

MemoizedChatBlock.displayName = 'MemoizedChatBlock';

/* ------------------------------------------------------------------ */
/*  ChatMarkdown (public export)                                       */
/* ------------------------------------------------------------------ */

type ChatMarkdownProps = {
  children: string;
  id?: string;
  className?: string;
};

function ChatMarkdownComponent({ children, id, className }: ChatMarkdownProps) {
  const generatedId = useId();
  const blockId = id ?? generatedId;
  const blocks = useMemo(() => parseMarkdownIntoBlocks(children), [children]);

  return (
    <div className={cn('chat-markdown text-[15px] leading-relaxed', className)}>
      {blocks.map((block, index) => (
        <MemoizedChatBlock key={`${blockId}-block-${index}`} content={block} />
      ))}
    </div>
  );
}

export const ChatMarkdown = memo(ChatMarkdownComponent);
ChatMarkdown.displayName = 'ChatMarkdown';
