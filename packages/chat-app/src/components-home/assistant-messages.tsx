'use client';

import { useMemo } from 'react';

import { ActivityDrawerContent } from './activity-drawer';

import type { Api, BaseAssistantMessage, Message, MessageNode } from '@ank1015/llm-sdk';

import { Message as MessageWrapper, MessageContent } from '@/components/ai/message';
import { ThinkingBar } from '@/components/ai/thinking-bar';
import { getTextFromBaseAssistantMessage } from '@/lib/messages/utils';
import { useUiStore } from '@/stores';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type AssistantStreamingMessage = Omit<BaseAssistantMessage<Api>, 'message'>;
type CotRenderableMessage = Message | AssistantStreamingMessage;

type AssistantMessagesProps = {
  /** All message nodes between this turn's user message and the next user message */
  cotMessages: CotRenderableMessage[];
  /** The final assistant node for this turn (if completed) */
  assistantNode: MessageNode | null;
  /** Whether this is the currently streaming turn */
  isStreaming: boolean;
  /** The streaming assistant message (partial, not yet a node) */
  streamingAssistant: AssistantStreamingMessage | null;
  /** Session key for live reasoning drawer updates */
  sessionKey: string | null;
  /** The user message id that started this turn */
  turnUserMessageId: string | null;
  /** Timestamp (ms epoch) of the user message that started this turn */
  userTimestamp: number | null;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

type ReasoningStep = {
  id: string;
  title: string;
  body: string;
};

// eslint-disable-next-line sonarjs/cognitive-complexity
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
        .filter((c) => c.type === 'text')
        .map((c) => c.content)
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

function getDurationInSeconds(
  userTimestamp: number | null,
  assistantNode: MessageNode | null
): number | undefined {
  if (userTimestamp === null || !assistantNode) return undefined;
  const endTimestamp = assistantNode.message.timestamp;
  if (typeof endTimestamp !== 'number') return undefined;
  return (endTimestamp - userTimestamp) / 1000;
}

/* ------------------------------------------------------------------ */
/*  AssistantMessages                                                 */
/* ------------------------------------------------------------------ */

export function AssistantMessages({
  cotMessages,
  assistantNode,
  isStreaming,
  streamingAssistant,
  sessionKey,
  turnUserMessageId,
  userTimestamp,
}: AssistantMessagesProps) {
  const openDrawer = useUiStore((state) => state.openSideDrawer);

  const effectiveMessages = useMemo(() => {
    if (!isStreaming || !streamingAssistant) return cotMessages;
    return [...cotMessages, streamingAssistant];
  }, [cotMessages, isStreaming, streamingAssistant]);

  const steps = useMemo(() => getReasoningSteps(effectiveMessages), [effectiveMessages]);
  const duration = useMemo(
    () => getDurationInSeconds(userTimestamp, assistantNode),
    [userTimestamp, assistantNode]
  );
  const hasReasoning = steps.length > 0;

  const showThinkingBar = isStreaming || hasReasoning;

  const label = isStreaming
    ? hasReasoning
      ? 'Reasoning'
      : 'Thinking'
    : duration !== undefined
      ? `Reasoned for ${duration.toFixed(1)}s`
      : 'Reasoned';

  const openActivityDrawer = () => {
    openDrawer({
      title: 'Activity',
      renderContent: () => (
        <ActivityDrawerContent
          live={isStreaming}
          sessionKey={sessionKey}
          turnUserMessageId={turnUserMessageId}
          fallbackMessages={effectiveMessages}
        />
      ),
    });
  };

  const assistantText = assistantNode
    ? getTextFromBaseAssistantMessage(assistantNode.message as BaseAssistantMessage<Api>)
    : null;

  const streamingText =
    isStreaming && streamingAssistant ? getTextFromBaseAssistantMessage(streamingAssistant) : null;

  const displayText = assistantText ?? streamingText;

  return (
    <div className="flex w-full flex-col gap-2">
      {/* Reasoning / thinking bar */}
      {showThinkingBar && (
        <div className="px-2">
          <ThinkingBar
            text={label}
            className="cursor-pointer"
            onClick={openActivityDrawer}
            stop={!isStreaming}
          />
        </div>
      )}

      {/* Final assistant response */}
      {displayText && (
        <MessageWrapper className="max-w-[90%]" data-streaming={isStreaming ? 'true' : 'false'}>
          <MessageContent
            markdown
            className="bg-home-page text-foreground whitespace-pre-wrap text-[15px] leading-relaxed"
          >
            {displayText}
          </MessageContent>
        </MessageWrapper>
      )}
    </div>
  );
}
