'use client';

import { Fragment, memo, useMemo } from 'react';

import type { MessageNode } from '@/stores/types';
import type { Api, BaseAssistantMessage, Message } from '@ank1015/llm-sdk';

import { AssistantMessages } from '@/components/assistant-messages';
import { UserMessageComponent } from '@/components/user-message';
import { getBranchNavigatorState, type BranchNavigatorState } from '@/lib/messages/session-tree';
import { formatThreadMarkdownExport } from '@/lib/messages/thread-export';
import { useChatStore } from '@/stores/chat-store';


const EMPTY_MESSAGES: MessageNode[] = [];
const EMPTY_STREAMING_ASSISTANT: Omit<BaseAssistantMessage<Api>, 'message'> | null = null;

type MessageTurn = {
  userMessageId: string | null;
  userNode: MessageNode | null;
  cotMessages: Message[];
  assistantNode: MessageNode | null;
};

type UserBranchStateByNodeId = Record<string, BranchNavigatorState>;

function groupIntoTurns(nodes: MessageNode[]): MessageTurn[] {
  const turns: MessageTurn[] = [];
  let index = 0;

  if (index < nodes.length && nodes[index]?.message.role !== 'user') {
    const betweenNodes: MessageNode[] = [];
    while (index < nodes.length && nodes[index]?.message.role !== 'user') {
      betweenNodes.push(nodes[index] as MessageNode);
      index += 1;
    }

    const cotMessages = betweenNodes.map((node) => node.message);
    const assistantNode =
      betweenNodes.length > 0 && betweenNodes[betweenNodes.length - 1]?.message.role === 'assistant'
        ? (betweenNodes[betweenNodes.length - 1] as MessageNode)
        : null;

    turns.push({ userMessageId: null, userNode: null, cotMessages, assistantNode });
  }

  while (index < nodes.length) {
    const userNode = nodes[index] as MessageNode;
    index += 1;

    const betweenNodes: MessageNode[] = [];
    while (index < nodes.length && nodes[index]?.message.role !== 'user') {
      betweenNodes.push(nodes[index] as MessageNode);
      index += 1;
    }

    const cotMessages = betweenNodes.map((node) => node.message);
    const assistantNode =
      betweenNodes.length > 0 && betweenNodes[betweenNodes.length - 1]?.message.role === 'assistant'
        ? (betweenNodes[betweenNodes.length - 1] as MessageNode)
        : null;

    turns.push({ userMessageId: userNode.message.id, userNode, cotMessages, assistantNode });
  }

  return turns;
}

const MessageTurnRow = memo(function MessageTurnRow({
  turn,
  turns,
  turnIndex,
  sessionKey,
  isStreamingTurn,
  streamingAssistant,
  branchState,
  systemPrompt,
}: {
  turn: MessageTurn;
  turns: MessageTurn[];
  turnIndex: number;
  sessionKey: string | null;
  isStreamingTurn: boolean;
  streamingAssistant: Omit<BaseAssistantMessage<Api>, 'message'> | null;
  branchState: BranchNavigatorState | null;
  systemPrompt: string | null;
}) {
  const handleExportChat = () => {
    if (!turn.assistantNode || turn.assistantNode.message.role !== 'assistant') {
      return null;
    }

    return formatThreadMarkdownExport({
      turns: turns.map((currentTurn) => ({
        userNode: currentTurn.userNode,
        cotMessages: currentTurn.cotMessages,
        assistantNode: currentTurn.assistantNode,
        api:
          currentTurn.assistantNode?.message.role === 'assistant'
            ? ((currentTurn.assistantNode.message.api as Api | undefined) ?? null)
            : null,
      })),
      endTurnIndex: turnIndex,
      systemPrompt,
    });
  };

  return (
    <Fragment>
      {turn.userNode ? (
        <UserMessageComponent userNode={turn.userNode} branchState={branchState} />
      ) : null}
      <AssistantMessages
        cotMessages={turn.cotMessages}
        assistantNode={turn.assistantNode}
        isStreamingTurn={isStreamingTurn}
        streamingAssistant={isStreamingTurn ? streamingAssistant : null}
        api={
          (turn.assistantNode?.message.role === 'assistant'
            ? (turn.assistantNode.message.api as Api | undefined)
            : undefined) ??
          (streamingAssistant?.api as Api | undefined) ??
          null
        }
        userTimestamp={
          typeof turn.userNode?.message.timestamp === 'number'
            ? turn.userNode.message.timestamp
            : null
        }
        sessionKey={sessionKey}
        onExportChat={handleExportChat}
      />
    </Fragment>
  );
});

export function ChatMessages({
  sessionId,
  systemPrompt,
}: {
  sessionId: string;
  systemPrompt: string | null;
}) {
  const messages = useChatStore((state) => state.messagesBySession[sessionId] ?? EMPTY_MESSAGES);
  const messageTree = useChatStore(
    (state) => state.messageTreesBySession[sessionId] ?? EMPTY_MESSAGES
  );
  const streamingAssistant = useChatStore(
    (state) => state.streamingAssistantBySession[sessionId] ?? EMPTY_STREAMING_ASSISTANT
  );
  const isSessionStreaming = useChatStore(
    (state) => state.isStreamingBySession[sessionId] ?? false
  );

  const turns = useMemo(() => groupIntoTurns(messages), [messages]);
  const branchStateByNodeId = useMemo<UserBranchStateByNodeId>(() => {
    if (messageTree.length === 0) {
      return {};
    }

    return turns.reduce<UserBranchStateByNodeId>((acc, turn) => {
      if (!turn.userNode) {
        return acc;
      }

      const branchState = getBranchNavigatorState(messageTree, turn.userNode);
      if (branchState) {
        acc[turn.userNode.id] = branchState;
      }

      return acc;
    }, {});
  }, [messageTree, turns]);

  if (turns.length === 0 && !streamingAssistant) {
    return null;
  }

  return (
    <div className="mt-8 flex w-full flex-col items-start gap-4">
      {turns.map((turn, index) => (
        <MessageTurnRow
          key={turn.userNode?.id ?? `turn-${index}`}
          turn={turn}
          turns={turns}
          turnIndex={index}
          sessionKey={sessionId}
          isStreamingTurn={isSessionStreaming && index === turns.length - 1}
          streamingAssistant={streamingAssistant}
          branchState={turn.userNode ? (branchStateByNodeId[turn.userNode.id] ?? null) : null}
          systemPrompt={systemPrompt}
        />
      ))}
    </div>
  );
}
