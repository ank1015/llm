'use client';

import { Check, Copy } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { ChatMarkdown } from './markdown-renderer';
import { WorkingTrace } from './working-trace';

import type {
  AgentEvent,
  Api,
  BaseAssistantMessage,
  Message,
  MessageNode,
} from '@ank1015/llm-types';

import { buildWorkingTraceModel } from '@/lib/messages/working-trace';
import { useChatStore } from '@/stores/chat-store';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type AssistantStreamingMessage = Omit<BaseAssistantMessage<Api>, 'message'>;
type CotRenderableMessage = Message | AssistantStreamingMessage;
const EMPTY_AGENT_EVENTS: AgentEvent[] = [];

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

function AssistantMessageActions({
  copied,
  displayText,
  isStreamingTurn,
  onCopy,
}: {
  copied: boolean;
  displayText: string | null;
  isStreamingTurn: boolean;
  onCopy: () => void;
}) {
  if (isStreamingTurn || !displayText) {
    return null;
  }

  return (
    <div className="ml-[2%] mt-1 flex h-5 items-center opacity-0 transition-opacity group-hover/assistant:opacity-100">
      <button
        type="button"
        onClick={onCopy}
        className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-colors"
        aria-label={copied ? 'Copied' : 'Copy message'}
      >
        {copied ? <Check className="size-3.5 text-blue-500" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
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
  userTimestamp,
}: AssistantMessagesProps) {
  const liveAgentEvents = useChatStore((state) => {
    if (!sessionKey || !isStreamingTurn) {
      return EMPTY_AGENT_EVENTS;
    }

    return state.agentEventsBySession[sessionKey] ?? EMPTY_AGENT_EVENTS;
  });

  const duration = useMemo(
    () => getDurationInSeconds(userTimestamp, assistantNode),
    [userTimestamp, assistantNode]
  );

  const label = isStreamingTurn
    ? 'Working'
    : duration !== undefined
      ? `Worked for ${duration.toFixed(1)}s`
      : 'Worked';

  const traceModel = useMemo(
    () =>
      buildWorkingTraceModel({
        cotMessages,
        assistantNode,
        isStreamingTurn,
        streamingAssistant,
        agentEvents: liveAgentEvents,
        api,
      }),
    [api, assistantNode, cotMessages, isStreamingTurn, liveAgentEvents, streamingAssistant]
  );

  const displayText = traceModel.finalResponseText;
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
    <div className="group/assistant flex w-full flex-col gap-3">
      <WorkingTrace
        model={traceModel}
        presentation={isStreamingTurn ? 'streaming' : 'completed'}
        label={label}
      />

      {/* Final assistant response */}
      {!isStreamingTurn && displayText && (
        <div className="max-w-[96%] ml-[2%]" data-streaming={isStreamingTurn ? 'true' : 'false'}>
          <ChatMarkdown className="text-foreground">{displayText}</ChatMarkdown>
        </div>
      )}

      <AssistantMessageActions
        copied={copied}
        displayText={displayText}
        isStreamingTurn={isStreamingTurn}
        onCopy={handleCopy}
      />
    </div>
  );
}
