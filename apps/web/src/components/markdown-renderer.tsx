/** biome-ignore-all lint/suspicious/noArrayIndexKey: block keys use index by design */
"use client";

import { marked } from "marked";
import { memo, useCallback, useId, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { useChatFileLinks } from "@/components/chat-file-links-provider";
import { CodeBlockThemed } from "@/components/code-block-themed";
import {
  linkifyArtifactFileText,
  resolveArtifactFileMention,
} from "@/lib/messages/chat-file-links";
import { cn } from "@/lib/utils";

import type { Components } from "react-markdown";

const ARTIFACT_FILE_HREF_PREFIX = "/__artifact_file__/";

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MarkdownNode[];
};

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown);
  return tokens.map((token) => token.raw);
}

function extractLanguage(className?: string): string {
  if (!className) {
    return "plaintext";
  }

  const match = className.match(/language-(\w+)/);
  return match ? match[1] : "plaintext";
}

function createArtifactFileLinkPlugin(
  resolve: ((raw: string) => string | null) | null,
) {
  return function artifactFileLinkPlugin() {
    return (tree: MarkdownNode) => {
      if (!resolve) {
        return;
      }
      const resolver = resolve;

      function transform(node: MarkdownNode) {
        if (!Array.isArray(node.children) || node.children.length === 0) {
          return;
        }

        const nextChildren: MarkdownNode[] = [];

        for (const child of node.children) {
          if (child.type === "text") {
            const segments = linkifyArtifactFileText(child.value ?? "", resolver);
            if (segments.length === 0) {
              nextChildren.push(child);
              continue;
            }

            nextChildren.push(
              ...segments.map((segment) =>
                segment.type === "text"
                  ? {
                      type: "text",
                      value: segment.value,
                    }
                  : {
                      type: "link",
                      url: `${ARTIFACT_FILE_HREF_PREFIX}${encodeURIComponent(segment.path)}`,
                      title: null,
                      children: [
                        {
                          type: "text",
                          value: segment.value,
                        },
                      ],
                    },
              ),
            );
            continue;
          }

          nextChildren.push(child);

          if (child.type === "link" || child.type === "code" || child.type === "html") {
            continue;
          }

          transform(child);
        }

        node.children = nextChildren;
      }

      transform(tree);
    };
  };
}

function getInlineCodeText(children: React.ReactNode): string {
  return Array.isArray(children) ? children.join("") : String(children);
}

function ArtifactFileButton({
  path,
  children,
  onOpen,
  className,
}: {
  path: string;
  children: React.ReactNode;
  onOpen: (path: string) => Promise<void> | void;
  className: string;
}) {
  const handleClick = useCallback(() => {
    void Promise.resolve(onOpen(path)).catch(() => {
      // Store-backed file open errors are surfaced by the preview drawer state.
    });
  }, [onOpen, path]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      title={path}
      aria-label={path}
    >
      {children}
    </button>
  );
}

const MemoizedChatBlock = memo(
  function ChatBlock({
    content,
    components,
    remarkPlugins,
  }: {
    content: string;
    components: Partial<Components>;
    remarkPlugins: Array<
      | typeof remarkGfm
      | typeof remarkBreaks
      | typeof remarkMath
      | ReturnType<typeof createArtifactFileLinkPlugin>
    >;
  }) {
    return (
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    );
  },
  (prev, next) =>
    prev.content === next.content &&
    prev.components === next.components &&
    prev.remarkPlugins === next.remarkPlugins,
);

MemoizedChatBlock.displayName = "MemoizedChatBlock";

type ChatMarkdownProps = {
  children: string;
  id?: string;
  className?: string;
  enableArtifactFileLinks?: boolean;
};

function ChatMarkdownComponent({
  children,
  id,
  className,
  enableArtifactFileLinks = false,
}: ChatMarkdownProps) {
  const generatedId = useId();
  const blockId = id ?? generatedId;
  const blocks = useMemo(() => parseMarkdownIntoBlocks(children), [children]);
  const fileLinks = useChatFileLinks();
  const artifactFileLinks = enableArtifactFileLinks ? fileLinks : null;
  const remarkPlugins = useMemo(
    () => [
      remarkGfm,
      remarkBreaks,
      remarkMath,
      createArtifactFileLinkPlugin(artifactFileLinks?.resolve ?? null),
    ],
    [artifactFileLinks],
  );
  const components = useMemo<Partial<Components>>(
    () => ({
      h1: ({ children }) => (
        <h1 className="text-foreground mt-7 mb-3 text-xl font-semibold">{children}</h1>
      ),
      h2: ({ children }) => (
        <h2 className="text-foreground mt-6 mb-3 text-lg font-semibold">{children}</h2>
      ),
      h3: ({ children }) => (
        <h3 className="text-foreground mt-5 mb-2 text-base font-semibold">{children}</h3>
      ),
      h4: ({ children }) => (
        <h4 className="text-foreground mt-4 mb-2 text-[15px] font-semibold">{children}</h4>
      ),
      h5: ({ children }) => (
        <h5 className="text-foreground mt-4 mb-2 text-[15px] font-medium">{children}</h5>
      ),
      h6: ({ children }) => (
        <h6 className="text-foreground mt-4 mb-2 text-[15px] font-medium">{children}</h6>
      ),
      p: ({ children }) => (
        <p className="text-foreground mb-4 text-[15px] leading-[1.8] last:mb-0">{children}</p>
      ),
      a: ({ href, children }) => {
        if (href?.startsWith(ARTIFACT_FILE_HREF_PREFIX) && artifactFileLinks) {
          const decodedPath = decodeURIComponent(href.slice(ARTIFACT_FILE_HREF_PREFIX.length));

          return (
            <ArtifactFileButton
              path={decodedPath}
              onOpen={artifactFileLinks.open}
              className="bg-home-panel border-home-border text-foreground inline-flex rounded-md border px-1.5 py-0.5 font-mono text-[13px] transition-colors hover:text-[#FF6363]"
            >
              {children}
            </ArtifactFileButton>
          );
        }

        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#FF6363] transition-colors hover:underline"
          >
            {children}
          </a>
        );
      },
      strong: ({ children }) => (
        <strong className="text-foreground font-semibold">{children}</strong>
      ),
      em: ({ children }) => <em className="italic">{children}</em>,
      blockquote: ({ children }) => (
        <blockquote className="border-home-border bg-home-panel/50 text-muted-foreground my-4 rounded-r-lg border-l-[3px] py-3 pr-4 pl-4 [&>p:last-child]:mb-0 [&>p]:mb-2">
          {children}
        </blockquote>
      ),
      ul: ({ children }) => (
        <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] [&>li]:leading-[1.8]">
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol className="my-4 list-decimal space-y-2 pl-6 text-[15px] [&>li]:leading-[1.8]">
          {children}
        </ol>
      ),
      li: ({ children }) => <li className="text-foreground leading-[1.8]">{children}</li>,
      code({ className, children, node }) {
        const isInline =
          !node?.position?.start.line || node.position.start.line === node.position.end.line;

        if (isInline) {
          const inlineText = getInlineCodeText(children).replace(/\n$/, "");
          const resolvedMention = artifactFileLinks
            ? resolveArtifactFileMention(inlineText, artifactFileLinks.resolve)
            : null;

          if (resolvedMention && artifactFileLinks) {
            return (
              <ArtifactFileButton
                path={resolvedMention.path}
                onOpen={artifactFileLinks.open}
                className="bg-home-panel border-home-border text-foreground inline-flex rounded-md border px-1.5 py-0.5 font-mono text-[13px] transition-colors hover:text-[#FF6363]"
              >
                {children}
              </ArtifactFileButton>
            );
          }

          return (
            <code className="bg-home-panel border-home-border rounded-md border px-1.5 py-0.5 font-mono text-[13px]">
              {children}
            </code>
          );
        }

        const language = extractLanguage(className);
        return <CodeBlockThemed code={String(children)} language={language} />;
      },
      pre: ({ children }) => <>{children}</>,
      table: ({ children }) => (
        <div className="border-home-border my-5 w-full overflow-x-auto rounded-lg border">
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
      img: ({ src, alt }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt ?? ""} className="my-3 max-w-full rounded-lg" />
      ),
    }),
    [artifactFileLinks],
  );

  return (
    <div className={cn("chat-markdown text-[15px] leading-[1.8]", className)}>
      {blocks.map((block, index) => (
        <MemoizedChatBlock
          key={`${blockId}-block-${index}`}
          content={block}
          components={components}
          remarkPlugins={remarkPlugins}
        />
      ))}
    </div>
  );
}

export const ChatMarkdown = memo(ChatMarkdownComponent);
ChatMarkdown.displayName = "ChatMarkdown";
