import { Fragment, memo, useMemo } from 'react';
import { View } from 'react-native';

import type { Api, BaseAssistantMessage, MessageNode } from '@ank1015/llm-sdk';

import { AppText } from '@/components/app-text';
import { ThreadAssistantMessages } from '@/components/projects/thread/thread-assistant-messages';
import { ThreadUserMessage } from '@/components/projects/thread/thread-user-message';
import { groupMessageNodesIntoTurns } from '@/lib/messages/chat-turns';
import { getBranchNavigatorState, type BranchNavigatorState } from '@/lib/messages/session-tree';

const EMPTY_STREAMING_ASSISTANT: Omit<BaseAssistantMessage<Api>, 'message'> | null = null;

type UserBranchStateByNodeId = Record<string, BranchNavigatorState>;

const MessageTurnRow = memo(function MessageTurnRow({
  artifactId,
  branchState,
  isStreamingTurn,
  projectId,
  sessionId,
  streamingAssistant,
  turn,
}: {
  artifactId: string;
  branchState: BranchNavigatorState | null;
  isStreamingTurn: boolean;
  projectId: string;
  sessionId: string;
  streamingAssistant: Omit<BaseAssistantMessage<Api>, 'message'> | null;
  turn: ReturnType<typeof groupMessageNodesIntoTurns>[number];
}) {
  return (
    <Fragment>
      {turn.userNode ? (
        <ThreadUserMessage
          artifactId={artifactId}
          branchState={branchState}
          projectId={projectId}
          sessionId={sessionId}
          userNode={turn.userNode}
        />
      ) : null}

      <ThreadAssistantMessages
        api={(turn.assistantNode?.api as Api | undefined) ?? 'openai'}
        assistantNode={turn.assistantNode}
        cotMessages={turn.cotMessages}
        isStreamingTurn={isStreamingTurn}
        sessionKey={sessionId}
        streamingAssistant={isStreamingTurn ? streamingAssistant : null}
        userTimestamp={
          typeof turn.userNode?.message.timestamp === 'number'
            ? turn.userNode.message.timestamp
            : null
        }
      />
    </Fragment>
  );
});

type ThreadMessagesProps = {
  artifactId: string;
  isStreaming: boolean;
  messageTree: MessageNode[];
  messages: MessageNode[];
  projectId: string;
  sessionId: string;
  streamingAssistant?: Omit<BaseAssistantMessage<Api>, 'message'> | null;
};

export function ThreadMessages({
  artifactId,
  isStreaming,
  messageTree,
  messages,
  projectId,
  sessionId,
  streamingAssistant = EMPTY_STREAMING_ASSISTANT,
}: ThreadMessagesProps) {
  const turns = useMemo(() => groupMessageNodesIntoTurns(messages), [messages]);
  const branchStateByNodeId = useMemo<UserBranchStateByNodeId>(() => {
    if (messageTree.length === 0) {
      return {};
    }

    return turns.reduce<UserBranchStateByNodeId>((accumulator, turn) => {
      if (!turn.userNode) {
        return accumulator;
      }

      const branchState = getBranchNavigatorState(messageTree, turn.userNode);
      if (branchState) {
        accumulator[turn.userNode.id] = branchState;
      }

      return accumulator;
    }, {});
  }, [messageTree, turns]);

  if (turns.length === 0 && !streamingAssistant) {
    return (
      <View className="items-center gap-2 rounded-[28px] border border-dashed border-foreground/10 px-5 py-8">
        <AppText className="text-base font-semibold text-foreground">No messages yet</AppText>
        <AppText className="text-center text-sm leading-6 text-muted">
          Send a prompt below to start this thread.
        </AppText>
      </View>
    );
  }

  return (
    <View className="w-full gap-6 pt-2">
      {turns.map((turn, index) => (
        <MessageTurnRow
          key={turn.userNode?.id ?? `turn-${index}`}
          artifactId={artifactId}
          branchState={turn.userNode ? (branchStateByNodeId[turn.userNode.id] ?? null) : null}
          isStreamingTurn={isStreaming && index === turns.length - 1}
          projectId={projectId}
          sessionId={sessionId}
          streamingAssistant={streamingAssistant}
          turn={turn}
        />
      ))}

      {turns.length === 0 && streamingAssistant ? (
        <ThreadAssistantMessages
          api={streamingAssistant.api}
          assistantNode={null}
          cotMessages={[]}
          isStreamingTurn
          sessionKey={sessionId}
          streamingAssistant={streamingAssistant}
          userTimestamp={null}
        />
      ) : null}
    </View>
  );
}
