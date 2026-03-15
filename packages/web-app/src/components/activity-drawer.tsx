'use client';
import { Globe, Wrench } from 'lucide-react';
import { useMemo } from 'react';

import { ChatMarkdown } from './markdown-renderer';

import type { Api, BaseAssistantMessage, Message, MessageNode } from '@ank1015/llm-types';

import { useChatStore } from '@/stores/chat-store';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type AssistantStreamingMessage = Omit<BaseAssistantMessage<Api>, 'message'>;
type CotRenderableMessage = Message | AssistantStreamingMessage;

type ActivityItem = {
  id: string;
  type: 'thinking-paragraph' | 'toolCall' | 'toolResult';
  title: string;
  body: string;
  format: 'plain' | 'markdown';
  toolName?: string;
  /** URLs for search tool results */
  urls?: string[];
};

type ActivitySection = {
  id: string;
  heading: string;
  items: ActivityItem[];
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const EMPTY_NODES: MessageNode[] = [];
const THINKING_PARAGRAPH_TYPE = 'thinking-paragraph' as const;
const PLAIN_FORMAT = 'plain' as const;
const MARKDOWN_FORMAT = 'markdown' as const;

type TurnMessages = {
  userMessageId: string | null;
  cotMessages: Message[];
};

function groupIntoTurnMessages(nodes: MessageNode[]): TurnMessages[] {
  if (nodes.length === 0) return [];

  const turns: TurnMessages[] = [];
  let i = 0;

  if (i < nodes.length && nodes[i]?.message.role !== 'user') {
    const leading: Message[] = [];
    while (i < nodes.length && nodes[i]?.message.role !== 'user') {
      const message = nodes[i]?.message;
      if (message) leading.push(message);
      i++;
    }
    turns.push({ userMessageId: null, cotMessages: leading });
  }

  while (i < nodes.length) {
    const userNode = nodes[i];
    if (!userNode) break;
    i++;

    const between: Message[] = [];
    while (i < nodes.length && nodes[i]?.message.role !== 'user') {
      const message = nodes[i]?.message;
      if (message) between.push(message);
      i++;
    }

    turns.push({ userMessageId: userNode.message.id, cotMessages: between });
  }

  return turns;
}

function isBoldHeading(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4;
}

function stripBold(text: string): string {
  return text.replace(/^\*\*|\*\*$/g, '').trim();
}

/** APIs that use structured bold-heading format (split into title/body pairs) */
const STRUCTURED_THINKING_APIS: Set<string> = new Set(['google', 'openai', 'codex', 'deepseek']);

/**
 * Splits thinking text into grouped items.
 * For google/openai/deepseek: splits by bold headings into title/body pairs.
 * For anthropic/kimi/zai: renders as a single markdown block per thinking content.
 */
function splitThinkingIntoItems(text: string, messageId: string, api: Api | null): ActivityItem[] {
  // For providers with structured markdown thinking, render as-is
  if (api && !STRUCTURED_THINKING_APIS.has(api)) {
    return [
      {
        id: `${messageId}-thinking-md`,
        type: THINKING_PARAGRAPH_TYPE,
        title: '',
        body: text.trim(),
        format: MARKDOWN_FORMAT,
      },
    ];
  }

  // For google/openai/deepseek: split by bold headings
  const rawParagraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const items: ActivityItem[] = [];
  let i = 0;

  while (i < rawParagraphs.length) {
    const para = rawParagraphs[i];

    if (isBoldHeading(para)) {
      const title = stripBold(para);
      const body = i + 1 < rawParagraphs.length ? rawParagraphs[i + 1] : '';
      items.push({
        id: `${messageId}-thinking-p${i}`,

        type: THINKING_PARAGRAPH_TYPE,
        title,
        body,
        format: PLAIN_FORMAT,
      });
      i += body ? 2 : 1;
    } else {
      const newlineIdx = para.indexOf('\n');
      if (newlineIdx === -1) {
        items.push({
          id: `${messageId}-thinking-p${i}`,
          type: THINKING_PARAGRAPH_TYPE,
          title: para,
          body: '',
          format: PLAIN_FORMAT,
        });
      } else {
        items.push({
          id: `${messageId}-thinking-p${i}`,
          type: THINKING_PARAGRAPH_TYPE,
          title: para.slice(0, newlineIdx).trim(),
          body: para.slice(newlineIdx + 1).trim(),
          format: PLAIN_FORMAT,
        });
      }
      i++;
    }
  }

  return items;
}

function isWebSearchTool(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes('web') || lower.includes('search') || lower.includes('browse');
}

function buildActivitySections(
  messages: CotRenderableMessage[],
  api: Api | null
): ActivitySection[] {
  const sections: ActivitySection[] = [];
  let currentThinkingItems: ActivityItem[] = [];
  let thinkingCounter = 0;

  const flushThinking = () => {
    if (currentThinkingItems.length > 0) {
      thinkingCounter++;
      sections.push({
        id: `thinking-section-${thinkingCounter}`,
        heading: 'Thinking',
        items: currentThinkingItems,
      });
      currentThinkingItems = [];
    }
  };

  for (const message of messages) {
    if (message.role === 'assistant') {
      for (let contentIdx = 0; contentIdx < message.content.length; contentIdx++) {
        const content = message.content[contentIdx];
        if (content.type === 'thinking') {
          const thinkingItems = splitThinkingIntoItems(content.thinkingText, message.id, api);
          currentThinkingItems.push(...thinkingItems);
          continue;
        }

        if (content.type === 'toolCall') {
          // Flush any accumulated thinking before a tool call
          flushThinking();

          let title = content.name;
          let body = '';
          let urls: string[] | undefined;

          // Special formatting for search tool
          if (content.name === 'search') {
            const args =
              typeof content.arguments === 'object' && content.arguments !== null
                ? (content.arguments as { objective?: string })
                : {};
            title = `Searching for ${args.objective ?? 'results'}`;
          } else if (content.name === 'extract') {
            // Special formatting for extract tool - show "Reading" with URL pill
            const args =
              typeof content.arguments === 'object' && content.arguments !== null
                ? (content.arguments as { url?: string })
                : {};
            title = 'Reading';
            if (args.url) {
              urls = [args.url];
            }
          } else {
            body =
              typeof content.arguments === 'string'
                ? content.arguments
                : JSON.stringify(content.arguments, null, 2);
          }

          sections.push({
            id: `${message.id}-toolcall-${content.name}-${contentIdx}`,
            heading: '',
            items: [
              {
                id: `${message.id}-toolcall-item-${contentIdx}`,
                type: 'toolCall',
                title,
                body,
                format: 'plain',
                toolName: content.name,
                urls,
              },
            ],
          });
        }
      }
      continue;
    }

    if (message.role === 'toolResult') {
      // Skip extract tool results - we only show the toolCall with URL
      if (message.toolName === 'extract') {
        continue;
      }

      const text = message.content
        .filter((c) => c.type === 'text')
        .map((c) => c.content)
        .join('\n')
        .trim();

      // Extract URLs from search tool results
      let urls: string[] | undefined;
      if (message.toolName === 'search' && message.details) {
        const details = message.details as { urls?: string[] };
        if (Array.isArray(details.urls)) {
          urls = details.urls;
        }
      }

      // Attach tool result to previous section if it was a tool call
      const lastSection = sections[sections.length - 1];
      if (
        lastSection &&
        lastSection.items.length === 1 &&
        lastSection.items[0].type === 'toolCall'
      ) {
        lastSection.items.push({
          id: `${message.id}-toolresult`,
          type: 'toolResult',
          title: `Result`,
          body: urls ? '' : text.length > 0 ? text : '(no textual output)',
          format: 'plain',
          toolName: message.toolName,
          urls,
        });
      } else {
        sections.push({
          id: `${message.id}-toolresult-section`,
          heading: '',
          items: [
            {
              id: `${message.id}-toolresult`,
              type: 'toolResult',
              title: `Result: ${message.toolName}`,
              body: urls ? '' : text.length > 0 ? text : '(no textual output)',
              format: 'plain',
              toolName: message.toolName,
              urls,
            },
          ],
        });
      }
    }
  }

  // Flush remaining thinking
  flushThinking();

  return sections;
}

/* ------------------------------------------------------------------ */
/*  UI Components                                                     */
/* ------------------------------------------------------------------ */

function getDomainFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function UrlPills({ urls }: { urls: string[] }) {
  const MAX_VISIBLE = 3;
  const visible = urls.slice(0, MAX_VISIBLE);
  const remaining = urls.length - MAX_VISIBLE;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {visible.map((url) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-surface-secondary hover:bg-surface-tertiary inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors"
        >
          {/* Favicon source is dynamic and external, so next/image is not a good fit here. */}
          {}
          <img
            src={`https://www.google.com/s2/favicons?domain=${getDomainFromUrl(url)}&sz=32`}
            alt=""
            className="size-4 rounded-sm"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <span className="text-foreground">{getDomainFromUrl(url)}</span>
        </a>
      ))}
      {remaining > 0 && (
        <span className="bg-surface-secondary text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs">
          <Globe size={14} />
          {remaining} more
        </span>
      )}
    </div>
  );
}

function ActivityItemDot({ type, toolName }: { type: ActivityItem['type']; toolName?: string }) {
  if (type === 'toolCall') {
    return (
      <div className="bg-home-page text-muted-foreground z-10 flex size-5 shrink-0 items-center justify-center rounded-full">
        {toolName && isWebSearchTool(toolName) ? (
          <Globe size={14} strokeWidth={2} />
        ) : (
          <Wrench size={14} strokeWidth={2} />
        )}
      </div>
    );
  }

  return (
    <div className="z-10 flex size-5 shrink-0 items-center justify-center">
      <div className="bg-foreground size-[7px] rounded-full" />
    </div>
  );
}

function ActivityItemRow({ item }: { item: ActivityItem }) {
  const cleanTitle = item.title.replace(/^\*\*|\*\*$/g, '');

  if (item.format === 'markdown') {
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center pt-1">
          <ActivityItemDot type={item.type} toolName={item.toolName} />
        </div>
        <div className="min-w-0 flex-1 pb-5">
          <ChatMarkdown className="text-muted-foreground text-[13px] leading-relaxed [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-[13px] [&_h4]:text-[13px] [&_h5]:text-[13px] [&_h6]:text-[13px] [&_p]:text-[13px] [&_p]:mb-2 [&_p]:leading-relaxed [&_li]:text-[13px] [&_ul]:my-1.5 [&_ol]:my-1.5 [&_strong]:text-foreground">
            {item.body}
          </ChatMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-1">
        <ActivityItemDot type={item.type} toolName={item.toolName} />
      </div>
      <div className="min-w-0 flex-1 pb-5">
        {cleanTitle && (
          <p className="text-foreground text-[13px] font-medium leading-snug">{cleanTitle}</p>
        )}
        {item.body && (
          <p className="text-foreground mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">
            {item.body}
          </p>
        )}
        {item.urls && item.urls.length > 0 && <UrlPills urls={item.urls} />}
      </div>
    </div>
  );
}

function ActivitySectionView({ section }: { section: ActivitySection }) {
  return (
    <div>
      <div className="relative">
        {/* Vertical progress line */}
        <div className="bg-border absolute top-3 bottom-3 left-[9px] w-px" />

        {section.items.map((item) => (
          <ActivityItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ActivityDrawerContent (live-updating)                              */
/* ------------------------------------------------------------------ */

export function ActivityDrawerContent({
  live,
  sessionKey,
  turnUserMessageId,
  fallbackMessages,
  api,
  statusLabel,
}: {
  live: boolean;
  sessionKey?: string | null;
  turnUserMessageId: string | null;
  fallbackMessages: CotRenderableMessage[];
  api?: Api | null;
  statusLabel?: string;
}) {
  const nodes = useChatStore((state) => {
    if (!live || !sessionKey) return EMPTY_NODES;
    return state.messagesBySession[sessionKey] ?? EMPTY_NODES;
  });
  const isSessionStreaming = useChatStore((state) => {
    if (!live || !sessionKey) return false;
    return state.isStreamingBySession[sessionKey] ?? false;
  });
  const streamingAssistant = useChatStore((state) => {
    if (!live || !sessionKey) return null;
    return state.streamingAssistantBySession[sessionKey] ?? null;
  });

  const selectedMessages = useMemo(() => {
    if (!live || !sessionKey || nodes.length === 0) return fallbackMessages;

    const turns = groupIntoTurnMessages(nodes);
    if (turns.length === 0) return fallbackMessages;

    const latestTurn = turns[turns.length - 1];
    const targetTurn = turns.find((turn) => turn.userMessageId === turnUserMessageId) ?? latestTurn;
    const baseMessages = targetTurn?.cotMessages ?? [];
    const shouldIncludeStreamingAssistant = targetTurn === latestTurn && isSessionStreaming;

    if (!shouldIncludeStreamingAssistant || !streamingAssistant) return baseMessages;
    return [...baseMessages, streamingAssistant];
  }, [
    fallbackMessages,
    isSessionStreaming,
    live,
    nodes,
    sessionKey,
    streamingAssistant,
    turnUserMessageId,
  ]);

  const sections = useMemo(
    () => buildActivitySections(selectedMessages, api ?? null),
    [selectedMessages, api]
  );
  const isComplete = !live || !isSessionStreaming;

  if (sections.length === 0) {
    return (
      <div className="flex flex-col gap-2 py-2">
        <div className="flex gap-3">
          <div className="flex size-5 shrink-0 items-center justify-center">
            <div className="bg-foreground size-[7px] rounded-full" />
          </div>
          <p className="text-foreground text-[13px] font-medium">
            {statusLabel ?? (isComplete ? 'Reasoned' : 'Reasoning')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      {sections.map((section) => (
        <ActivitySectionView key={section.id} section={section} />
      ))}
      {isComplete && (
        <div className="relative">
          <div className="flex gap-3">
            <div className="flex size-5 shrink-0 items-center justify-center">
              <div className="bg-foreground size-[7px] rounded-full" />
            </div>
            <p className="text-foreground text-[13px] font-medium">
              {statusLabel ?? 'Reasoning complete'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
