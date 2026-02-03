'use client';

import { useMemo } from 'react';

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtItem,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
} from '../ai/chain-of-thought';
import { ThinkingBar } from '../ai/thinking-bar';

import type { Api, BaseAssistantMessage, Message, MessageNode } from '@ank1015/llm-sdk';

import { useUiStore } from '@/stores';
import { useChatStore } from '@/stores/chat-store';

type AssistantStreamingMessage = Omit<BaseAssistantMessage<Api>, 'message'>;
type CotRenderableMessage = Message | AssistantStreamingMessage;

type CotMessageProps = {
  messages: CotRenderableMessage[];
  isStreaming?: boolean;
  sessionKey?: string | null;
  turnUserMessageId?: string | null;
  live?: boolean;
};

type TurnMessages = {
  userMessageId: string | null;
  cotMessages: Message[];
};

type ReasoningStep = {
  id: string;
  title: string;
  body: string;
};

const EMPTY_RENDERABLE_MESSAGES: CotRenderableMessage[] = [];
const EMPTY_TURN_MESSAGES: TurnMessages[] = [];
const EMPTY_NODES: MessageNode[] = [];

function groupIntoTurnMessages(nodes: MessageNode[]): TurnMessages[] {
  if (nodes.length === 0) {
    return EMPTY_TURN_MESSAGES;
  }

  const turns: TurnMessages[] = [];
  let i = 0;

  if (i < nodes.length && nodes[i]?.message.role !== 'user') {
    const leading: Message[] = [];
    while (i < nodes.length && nodes[i]?.message.role !== 'user') {
      const message = nodes[i]?.message;
      if (message) {
        leading.push(message);
      }
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
      if (message) {
        between.push(message);
      }
      i++;
    }

    turns.push({
      userMessageId: userNode.message.id,
      cotMessages: between,
    });
  }

  return turns;
}

function getReasoningSteps(messages: CotRenderableMessage[]): ReasoningStep[] {
  const steps: ReasoningStep[] = [];

  for (const message of messages) {
    if (message.role === 'assistant') {
      for (const content of message.content) {
        if (content.type === 'thinking') {
          steps.push({
            id: `${message.id}-thinking-${steps.length}`,
            title: 'Thinking',
            body: content.thinkingText,
          });
          continue;
        }

        if (content.type === 'toolCall') {
          steps.push({
            id: `${message.id}-toolcall-${steps.length}`,
            title: `Calling ${content.name}`,
            body: JSON.stringify(content.arguments, null, 2),
          });
        }
      }
      continue;
    }

    if (message.role === 'toolResult') {
      const text = message.content
        .filter((content) => content.type === 'text')
        .map((content) => content.content)
        .join('\n')
        .trim();

      steps.push({
        id: `${message.id}-toolresult`,
        title: `Result: ${message.toolName}`,
        body: text.length > 0 ? text : '(no textual output)',
      });
    }
  }

  return steps;
}

function ReasoningDrawerContent({
  live,
  sessionKey,
  turnUserMessageId,
  fallbackMessages,
}: {
  live: boolean;
  sessionKey?: string | null;
  turnUserMessageId: string | null;
  fallbackMessages: CotRenderableMessage[];
}) {
  const nodes = useChatStore((state) => {
    if (!live || !sessionKey) {
      return EMPTY_NODES;
    }

    return state.messagesBySession[sessionKey] ?? EMPTY_NODES;
  });
  const isSessionStreaming = useChatStore((state) => {
    if (!live || !sessionKey) {
      return false;
    }

    return state.isStreamingBySession[sessionKey] ?? false;
  });
  const streamingAssistant = useChatStore((state) => {
    if (!live || !sessionKey) {
      return null;
    }

    return state.streamingAssistantBySession[sessionKey] ?? null;
  });

  const selectedMessages = useMemo(() => {
    if (!live || !sessionKey) {
      return fallbackMessages;
    }

    if (nodes.length === 0) {
      return fallbackMessages;
    }

    const turns = groupIntoTurnMessages(nodes);
    if (turns.length === 0) {
      return fallbackMessages;
    }

    const latestTurn = turns[turns.length - 1];
    const targetTurn = turns.find((turn) => turn.userMessageId === turnUserMessageId) ?? latestTurn;
    const baseMessages = targetTurn?.cotMessages ?? [];
    const shouldIncludeStreamingAssistant = targetTurn === latestTurn && isSessionStreaming;

    if (!shouldIncludeStreamingAssistant || !streamingAssistant) {
      return baseMessages;
    }

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

  const steps = useMemo(() => getReasoningSteps(selectedMessages), [selectedMessages]);

  if (steps.length === 0) {
    return <div className="text-sm text-muted-foreground">No reasoning details yet.</div>;
  }

  return (
    <ChainOfThought>
      {steps.map((step) => (
        <ChainOfThoughtStep key={step.id}>
          <ChainOfThoughtTrigger hideChevron={true}>{step.title}</ChainOfThoughtTrigger>
          <ChainOfThoughtContent>
            <ChainOfThoughtItem className="whitespace-pre-wrap">{step.body}</ChainOfThoughtItem>
          </ChainOfThoughtContent>
        </ChainOfThoughtStep>
      ))}
    </ChainOfThought>
  );
}

function getDurationInSeconds(messages: CotRenderableMessage[]): number | undefined {
  const first = messages[0];
  const last = messages[messages.length - 1];
  if (!first || !last) {
    return undefined;
  }

  if (typeof first.timestamp !== 'number' || typeof last.timestamp !== 'number') {
    return undefined;
  }

  return (last.timestamp - first.timestamp) / 1000;
}

export const COTMessageComponent = ({
  messages,
  isStreaming = false,
  sessionKey,
  turnUserMessageId = null,
  live = false,
}: CotMessageProps) => {
  const openDrawer = useUiStore((state) => state.openSideDrawer);

  const effectiveMessages = messages.length > 0 ? messages : EMPTY_RENDERABLE_MESSAGES;
  const steps = useMemo(() => getReasoningSteps(effectiveMessages), [effectiveMessages]);
  const duration = useMemo(() => getDurationInSeconds(effectiveMessages), [effectiveMessages]);
  const hasReasoning = steps.length > 0;

  if (!isStreaming && !hasReasoning) {
    return null;
  }

  const label = isStreaming
    ? hasReasoning
      ? 'Reasoning'
      : 'Thinking'
    : duration !== undefined
      ? `Reasoned for ${duration.toFixed(1)}s`
      : 'Reasoned';

  const openReasoningDrawer = () => {
    openDrawer({
      title: 'Reasoning',
      renderContent: () => (
        <ReasoningDrawerContent
          live={live}
          sessionKey={sessionKey}
          turnUserMessageId={turnUserMessageId}
          fallbackMessages={effectiveMessages}
        />
      ),
    });
  };

  return (
    <div className="px-2">
      <ThinkingBar
        text={label}
        className="cursor-pointer"
        onClick={openReasoningDrawer}
        stop={!isStreaming}
      />
    </div>
  );
};
