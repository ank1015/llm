'use client';

import {
  CheckmarkCircle02Icon,
  Copy01Icon,
  DownloadSquare01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useCallback, useMemo, useState } from 'react';

import type { MessageNode } from '@/stores/types';
import type { AgentEvent, Api, BaseAssistantMessage, Message } from '@ank1015/llm-sdk';

import { AssistantTurnMetricsInline } from '@/components/assistant-turn-metrics';
import { ChatMarkdown } from '@/components/markdown-renderer';
import { WorkingTrace } from '@/components/working-trace';
import { getAssistantTurnMetrics } from '@/lib/messages/assistant-turn-metrics';
import { buildWorkingTraceModel } from '@/lib/messages/working-trace';
import { useChatStore } from '@/stores/chat-store';


type AssistantStreamingMessage = Omit<BaseAssistantMessage<Api>, 'message'>;
type CotRenderableMessage = Message | AssistantStreamingMessage;
const EMPTY_AGENT_EVENTS: AgentEvent[] = [];

type AssistantMessagesProps = {
  cotMessages: CotRenderableMessage[];
  assistantNode: MessageNode | null;
  isStreamingTurn: boolean;
  streamingAssistant: AssistantStreamingMessage | null;
  api: Api | null;
  sessionKey: string | null;
  userTimestamp: number | null;
  onExportChat: () => string | null;
};

function getDurationInSeconds(
  userTimestamp: number | null,
  assistantNode: MessageNode | null
): number | undefined {
  if (userTimestamp === null || !assistantNode) {
    return undefined;
  }

  const endTimestamp = assistantNode.message.timestamp;
  if (typeof endTimestamp !== 'number') {
    return undefined;
  }

  return (endTimestamp - userTimestamp) / 1000;
}

function AssistantMessageActions({
  copied,
  exported,
  displayText,
  isStreamingTurn,
  onCopy,
  onExport,
  metrics,
}: {
  copied: boolean;
  exported: boolean;
  displayText: string | null;
  isStreamingTurn: boolean;
  onCopy: () => void;
  onExport: () => void;
  metrics: ReturnType<typeof getAssistantTurnMetrics>;
}) {
  if (isStreamingTurn) {
    return null;
  }

  return (
    <div className="text-muted-foreground ml-[2%] mt-1 flex min-h-5 items-center gap-1.5 opacity-0 transition-opacity group-hover/assistant:opacity-100">
      {displayText ? (
        <button
          type="button"
          onClick={onCopy}
          className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-colors"
          aria-label={copied ? 'Copied' : 'Copy message'}
        >
          <HugeiconsIcon
            icon={copied ? CheckmarkCircle02Icon : Copy01Icon}
            size={14}
            color="currentColor"
            strokeWidth={1.8}
          />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onExport}
        className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-colors"
        aria-label={exported ? 'Exported' : 'Export chat'}
      >
        <HugeiconsIcon
          icon={exported ? CheckmarkCircle02Icon : DownloadSquare01Icon}
          size={14}
          color="currentColor"
          strokeWidth={1.8}
        />
      </button>
      <AssistantTurnMetricsInline metrics={metrics} />
    </div>
  );
}

export function AssistantMessages({
  cotMessages,
  assistantNode,
  isStreamingTurn,
  streamingAssistant,
  api,
  sessionKey,
  userTimestamp,
  onExportChat,
}: AssistantMessagesProps) {
  const liveAgentEvents = useChatStore((state) => {
    if (!sessionKey || !isStreamingTurn) {
      return EMPTY_AGENT_EVENTS;
    }

    return state.agentEventsBySession[sessionKey] ?? EMPTY_AGENT_EVENTS;
  });

  const duration = useMemo(
    () => getDurationInSeconds(userTimestamp, assistantNode),
    [assistantNode, userTimestamp]
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
  const turnMetrics = useMemo(
    () =>
      getAssistantTurnMetrics({
        cotMessages,
        assistantMessage:
          assistantNode?.message.role === 'assistant'
            ? (assistantNode.message as BaseAssistantMessage<Api>)
            : null,
      }),
    [assistantNode, cotMessages]
  );

  const displayText = traceModel.finalResponseText;
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!displayText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(displayText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may not be available.
    }
  }, [displayText]);

  const handleExport = useCallback(async () => {
    const markdown = onExportChat();
    if (!markdown) {
      return;
    }

    try {
      await navigator.clipboard.writeText(markdown);
      setExported(true);
      setTimeout(() => setExported(false), 2000);
    } catch {
      // Clipboard may not be available.
    }
  }, [onExportChat]);

  return (
    <div className="group/assistant flex w-full flex-col gap-3">
      <WorkingTrace
        model={traceModel}
        presentation={isStreamingTurn ? 'streaming' : 'completed'}
        label={label}
      />

      {!isStreamingTurn && displayText ? (
        <div className="ml-[2%] max-w-[96%]" data-streaming={isStreamingTurn ? 'true' : 'false'}>
          <ChatMarkdown enableArtifactFileLinks className="text-foreground">
            {displayText}
          </ChatMarkdown>
        </div>
      ) : null}

      <AssistantMessageActions
        copied={copied}
        exported={exported}
        displayText={displayText}
        isStreamingTurn={isStreamingTurn}
        onCopy={handleCopy}
        onExport={handleExport}
        metrics={turnMetrics}
      />
    </div>
  );
}
