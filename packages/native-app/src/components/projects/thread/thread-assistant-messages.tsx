import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import type { AgentEvent, Api, BaseAssistantMessage, Message, MessageNode } from '@ank1015/llm-sdk';

import { ThreadActionButton } from '@/components/projects/thread/thread-action-button';
import { ThreadTranscriptMarkdown } from '@/components/projects/thread/thread-transcript-markdown';
import { ThreadWorkingTrace } from '@/components/projects/thread/thread-working-trace';
import { buildWorkingTraceModel } from '@/lib/messages/working-trace';
import { useChatStore } from '@/stores/chat-store';

type AssistantStreamingMessage = Omit<BaseAssistantMessage<Api>, 'message'>;
type CotRenderableMessage = Message | AssistantStreamingMessage;

type ThreadAssistantMessagesProps = {
  api: Api | null;
  assistantNode: MessageNode | null;
  cotMessages: CotRenderableMessage[];
  isStreamingTurn: boolean;
  sessionKey: string;
  streamingAssistant: AssistantStreamingMessage | null;
  userTimestamp: number | null;
};

const EMPTY_AGENT_EVENTS: AgentEvent[] = [];

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

export function ThreadAssistantMessages({
  api,
  assistantNode,
  cotMessages,
  isStreamingTurn,
  sessionKey,
  streamingAssistant,
  userTimestamp,
}: ThreadAssistantMessagesProps) {
  const [copied, setCopied] = useState(false);
  const liveAgentEvents = useChatStore((state) => {
    if (!isStreamingTurn) {
      return EMPTY_AGENT_EVENTS;
    }

    return state.agentEventsBySession[sessionKey] ?? EMPTY_AGENT_EVENTS;
  });

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setCopied(false);
    }, 1800);

    return () => {
      clearTimeout(timeout);
    };
  }, [copied]);

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
        agentEvents: liveAgentEvents,
        api,
        assistantNode,
        cotMessages,
        isStreamingTurn,
        streamingAssistant,
      }),
    [api, assistantNode, cotMessages, isStreamingTurn, liveAgentEvents, streamingAssistant]
  );

  const displayText = traceModel.finalResponseText;

  const handleCopy = () => {
    if (!displayText) {
      return;
    }

    void Clipboard.setStringAsync(displayText).then(() => {
      setCopied(true);
    });
  };

  if (!displayText && traceModel.items.length === 0) {
    return null;
  }

  return (
    <View className="w-full gap-4">
      <View className="w-full max-w-[96%]">
        <ThreadWorkingTrace label={label} live={isStreamingTurn} model={traceModel} />
      </View>

      {displayText ? (
        <>
          <View className="w-full max-w-[96%]">
            <ThreadTranscriptMarkdown>{displayText}</ThreadTranscriptMarkdown>
          </View>

          <View className="ml-1 flex-row items-center gap-1">
            <ThreadActionButton
              accessibilityLabel={copied ? 'Copied assistant message' : 'Copy assistant message'}
              icon={copied ? 'check' : 'copy'}
              onPress={handleCopy}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}
