'use client';

import { Check, Copy, GitBranch, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { ActivityDrawerContent } from './activity-drawer';
import { ChatMarkdown } from './markdown-renderer';

import type { Api, BaseAssistantMessage, Message, MessageNode } from '@ank1015/llm-sdk';

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
  isStreamingTurn: boolean;
  /** The streaming assistant message (partial, not yet a node) */
  streamingAssistant: AssistantStreamingMessage | null;
  /** The API provider used for this turn */
  api: Api | null;
  /** Session key for live reasoning drawer updates */
  sessionKey: string | null;
  /** The user message id that started this turn */
  turnUserMessageId: string | null;
  /** Timestamp (ms epoch) of the user message that started this turn */
  userTimestamp: number | null;
};

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
  isStreamingTurn,
  streamingAssistant,
  api,
  sessionKey,
  turnUserMessageId,
  userTimestamp,
}: AssistantMessagesProps) {
  const openDrawer = useUiStore((state) => state.openSideDrawer);
  const dismissDrawer = useUiStore((state) => state.dismissSideDrawer);
  const isDrawerOpen = useUiStore((state) => state.sideDrawer.open);

  const effectiveMessages = useMemo(() => {
    if (!isStreamingTurn || !streamingAssistant) return cotMessages;
    return [...cotMessages, streamingAssistant];
  }, [cotMessages, isStreamingTurn, streamingAssistant]);

  const duration = useMemo(
    () => getDurationInSeconds(userTimestamp, assistantNode),
    [userTimestamp, assistantNode]
  );

  const label = isStreamingTurn
    ? 'Reasoning'
    : duration !== undefined
      ? `Reasoned for ${duration.toFixed(1)}s`
      : 'Reasoned';
  const showThinkingBar =
    isStreamingTurn ||
    assistantNode !== null ||
    streamingAssistant !== null ||
    cotMessages.length > 0;

  const toggleActivityDrawer = () => {
    if (isDrawerOpen) {
      dismissDrawer();
      return;
    }

    openDrawer({
      title: 'Activity',
      renderContent: () => (
        <ActivityDrawerContent
          live={isStreamingTurn}
          sessionKey={sessionKey}
          turnUserMessageId={turnUserMessageId}
          fallbackMessages={effectiveMessages}
          api={api}
          statusLabel={label}
        />
      ),
    });
  };

  const assistantText = assistantNode
    ? getTextFromBaseAssistantMessage(assistantNode.message as BaseAssistantMessage<Api>)
    : null;

  const streamingText =
    isStreamingTurn && streamingAssistant
      ? getTextFromBaseAssistantMessage(streamingAssistant)
      : null;

  const displayText = assistantText ?? streamingText;

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!displayText) return;
    try {
      await navigator.clipboard.writeText(displayText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  }, [displayText]);

  return (
    <div className="group/assistant flex w-full flex-col gap-2">
      {/* Reasoning / thinking bar */}
      {showThinkingBar && (
        <div className="ml-[2%]">
          <ThinkingBar
            text={label}
            className="cursor-pointer"
            onClick={toggleActivityDrawer}
            stop={!isStreamingTurn}
          />
        </div>
      )}

      {/* Final assistant response */}
      {displayText && (
        <div className="max-w-[96%] ml-[2%]" data-streaming={isStreamingTurn ? 'true' : 'false'}>
          <ChatMarkdown className="text-foreground">{displayText}</ChatMarkdown>
        </div>
      )}

      {/* Action buttons — space always reserved, visible on hover */}
      {!isStreamingTurn && (
        <div className="flex ml-[2%] mt-1 h-6 items-center gap-1 opacity-0 transition-opacity group-hover/assistant:opacity-100">
          <button
            type="button"
            onClick={handleCopy}
            className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1.5 transition-colors"
            aria-label={copied ? 'Copied' : 'Copy message'}
          >
            {copied ? <Check className="size-4 text-blue-500" /> : <Copy className="size-4" />}
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1.5 transition-colors"
            aria-label="Branch conversation"
          >
            <GitBranch className="size-4" />
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1.5 transition-colors"
            aria-label="Regenerate response"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
