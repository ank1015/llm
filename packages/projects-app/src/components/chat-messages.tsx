'use client';

import { Fragment, memo, useMemo } from 'react';

import { AssistantMessages } from './assistant-messages';
import { UserMessageComponent } from './user-message';

import type { Api, BaseAssistantMessage, Message, MessageNode } from '@ank1015/llm-sdk';

import { useChatStore } from '@/stores/chat-store';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const EMPTY_MESSAGES: MessageNode[] = [];
const EMPTY_STREAMING_ASSISTANT: Omit<BaseAssistantMessage<Api>, 'message'> | null = null;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getSessionKey(session: { sessionId: string }): string {
  return session.sessionId;
}

type MessageTurn = {
  userMessageId: string | null;
  userNode: MessageNode | null;
  cotMessages: Message[];
  assistantNode: MessageNode | null;
};

function groupIntoTurns(nodes: MessageNode[]): MessageTurn[] {
  const turns: MessageTurn[] = [];
  let i = 0;

  // Handle leading non-user messages
  if (i < nodes.length && nodes[i].message.role !== 'user') {
    const betweenNodes: MessageNode[] = [];
    while (i < nodes.length && nodes[i].message.role !== 'user') {
      betweenNodes.push(nodes[i]);
      i++;
    }

    const cotMessages = betweenNodes.map((n) => n.message);
    let assistantNode: MessageNode | null = null;
    if (
      betweenNodes.length > 0 &&
      betweenNodes[betweenNodes.length - 1].message.role === 'assistant'
    ) {
      assistantNode = betweenNodes[betweenNodes.length - 1];
    }

    turns.push({ userMessageId: null, userNode: null, cotMessages, assistantNode });
  }

  while (i < nodes.length) {
    const userNode = nodes[i];
    i++;

    const betweenNodes: MessageNode[] = [];
    while (i < nodes.length && nodes[i].message.role !== 'user') {
      betweenNodes.push(nodes[i]);
      i++;
    }

    const cotMessages = betweenNodes.map((n) => n.message);
    let assistantNode: MessageNode | null = null;
    if (
      betweenNodes.length > 0 &&
      betweenNodes[betweenNodes.length - 1].message.role === 'assistant'
    ) {
      assistantNode = betweenNodes[betweenNodes.length - 1];
    }

    turns.push({ userMessageId: userNode.message.id, userNode, cotMessages, assistantNode });
  }

  return turns;
}

/* ------------------------------------------------------------------ */
/*  MessageTurnRow                                                    */
/* ------------------------------------------------------------------ */

const MessageTurnRow = memo(function MessageTurnRow({
  turn,
  sessionKey,
  isStreamingTurn,
  streamingAssistant,
}: {
  turn: MessageTurn;
  sessionKey: string | null;
  isStreamingTurn: boolean;
  streamingAssistant: Omit<BaseAssistantMessage<Api>, 'message'> | null;
}) {
  return (
    <Fragment>
      {turn.userNode && <UserMessageComponent userNode={turn.userNode} />}
      <AssistantMessages
        cotMessages={turn.cotMessages}
        assistantNode={turn.assistantNode}
        isStreamingTurn={isStreamingTurn}
        streamingAssistant={isStreamingTurn ? streamingAssistant : null}
        api={(turn.assistantNode?.api as Api | undefined) ?? 'openai'}
        userTimestamp={
          typeof turn.userNode?.message.timestamp === 'number'
            ? turn.userNode.message.timestamp
            : null
        }
        sessionKey={sessionKey}
        turnUserMessageId={turn.userMessageId}
      />
    </Fragment>
  );
});

/* ------------------------------------------------------------------ */
/*  ChatMessages                                                      */
/* ------------------------------------------------------------------ */

export function ChatMessages() {
  const activeSessionKey = useChatStore((state) => {
    if (!state.activeSession) return null;
    return getSessionKey(state.activeSession);
  });

  const messages = useChatStore((state) => {
    if (!activeSessionKey) return EMPTY_MESSAGES;
    return state.messagesBySession[activeSessionKey] ?? EMPTY_MESSAGES;
  });

  const streamingAssistant = useChatStore((state) => {
    if (!activeSessionKey) return EMPTY_STREAMING_ASSISTANT;
    return state.streamingAssistantBySession[activeSessionKey] ?? EMPTY_STREAMING_ASSISTANT;
  });
  const isSessionStreaming = useChatStore((state) => {
    if (!activeSessionKey) return false;
    return state.isStreamingBySession[activeSessionKey] ?? false;
  });

  const turns = useMemo(() => groupIntoTurns(messages), [messages]);

  if (turns.length === 0 && !streamingAssistant) {
    return null;
  }

  return (
    <div className="mt-8 flex w-full flex-col items-start gap-4">
      {turns.map((turn, idx) => (
        <MessageTurnRow
          key={turn.userNode?.id ?? `turn-${idx}`}
          turn={turn}
          sessionKey={activeSessionKey}
          isStreamingTurn={isSessionStreaming && idx === turns.length - 1}
          streamingAssistant={streamingAssistant}
        />
      ))}
    </div>
  );
}
