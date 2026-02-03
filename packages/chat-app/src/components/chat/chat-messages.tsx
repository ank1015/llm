import { Fragment, useMemo } from 'react';

import { AssistantMessageComponent } from './assistant-message';
import { COTMessageComponent } from './cot-message';
import { UserMessageComponent } from './user-message';

import type {
  Api,
  BaseAssistantMessage,
  Message,
  MessageNode,
  UserMessage,
} from '@ank1015/llm-sdk';

import { useChatStore } from '@/stores/chat-store';

const EMPTY_MESSAGES: MessageNode[] = [];

function getSessionKey(session: {
  sessionId: string;
  projectName?: string;
  path?: string;
}): string {
  const projectName = session.projectName?.trim() ?? '';
  const path = session.path?.trim() ?? '';
  return `${projectName}::${path}::${session.sessionId}`;
}

type MessageTurn = {
  userNode: MessageNode | null;
  cotMessages: Message[];
  assistantNode: MessageNode | null;
};

function groupIntoTurns(nodes: MessageNode[]): MessageTurn[] {
  const turns: MessageTurn[] = [];
  let i = 0;

  // Handle leading non-user messages (e.g. assistant responses loaded without their user prompt)
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

    turns.push({ userNode: null, cotMessages, assistantNode });
  }

  while (i < nodes.length) {
    const userNode = nodes[i];
    i++;

    const betweenNodes: MessageNode[] = [];
    while (i < nodes.length && nodes[i].message.role !== 'user') {
      betweenNodes.push(nodes[i]);
      i++;
    }

    // COT gets all messages between user messages (positions 1 to n-1)
    const cotMessages = betweenNodes.map((n) => n.message);

    // Assistant is the last one if it has role 'assistant'
    let assistantNode: MessageNode | null = null;
    if (
      betweenNodes.length > 0 &&
      betweenNodes[betweenNodes.length - 1].message.role === 'assistant'
    ) {
      assistantNode = betweenNodes[betweenNodes.length - 1];
    }

    turns.push({ userNode, cotMessages, assistantNode });
  }

  return turns;
}

export function ChatMessages() {
  const activeSession = useChatStore((state) => state.activeSession);
  const messages = useChatStore((state) => {
    if (!activeSession) return EMPTY_MESSAGES;
    const key = getSessionKey(activeSession);
    return state.messagesBySession[key] ?? EMPTY_MESSAGES;
  });
  const turns = useMemo(() => groupIntoTurns(messages), [messages]);

  if (turns.length === 0) {
    return null;
  }

  return (
    <div className="flex w-full flex-col items-start gap-4 mt-8">
      {turns.map((turn, idx) => (
        <Fragment key={turn.userNode?.id ?? `turn-${idx}`}>
          {turn.userNode && (
            <UserMessageComponent userMessage={turn.userNode.message as UserMessage} />
          )}
          {turn.cotMessages.length > 1 && <COTMessageComponent messages={turn.cotMessages} />}
          {turn.assistantNode && (
            <AssistantMessageComponent
              assistantMessage={turn.assistantNode.message as BaseAssistantMessage<Api>}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}
