import type { Api, BaseAssistantMessage, MessageNode } from '@ank1015/llm-types';

type AssistantStreamingMessage = Omit<BaseAssistantMessage<Api>, 'message'>;

type MessageTurn = {
  assistantNode: MessageNode | null;
};

function groupIntoTurns(nodes: MessageNode[]): MessageTurn[] {
  const turns: MessageTurn[] = [];
  let index = 0;

  if (index < nodes.length && nodes[index]?.message.role !== 'user') {
    const betweenNodes: MessageNode[] = [];
    while (index < nodes.length && nodes[index]?.message.role !== 'user') {
      const node = nodes[index];
      if (node) {
        betweenNodes.push(node);
      }
      index += 1;
    }

    turns.push({
      assistantNode:
        betweenNodes.length > 0 &&
        betweenNodes[betweenNodes.length - 1]?.message.role === 'assistant'
          ? (betweenNodes[betweenNodes.length - 1] ?? null)
          : null,
    });
  }

  while (index < nodes.length) {
    index += 1;

    const betweenNodes: MessageNode[] = [];
    while (index < nodes.length && nodes[index]?.message.role !== 'user') {
      const node = nodes[index];
      if (node) {
        betweenNodes.push(node);
      }
      index += 1;
    }

    turns.push({
      assistantNode:
        betweenNodes.length > 0 &&
        betweenNodes[betweenNodes.length - 1]?.message.role === 'assistant'
          ? (betweenNodes[betweenNodes.length - 1] ?? null)
          : null,
    });
  }

  return turns;
}

function getAssistantUsageTotalTokens(node: MessageNode | null): number {
  if (node?.message.role !== 'assistant') {
    return 0;
  }

  return Math.max(0, node.message.usage.totalTokens);
}

function getLatestPersistedAssistantUsageTotalTokens(nodes: MessageNode[]): number {
  const turns = groupIntoTurns(nodes);
  const latestAssistantTurnIndex = turns.reduce(
    (latestIndex, turn, index) => (turn.assistantNode ? index : latestIndex),
    -1
  );

  if (latestAssistantTurnIndex < 0) {
    return 0;
  }

  return getAssistantUsageTotalTokens(turns[latestAssistantTurnIndex]?.assistantNode ?? null);
}

function getLatestPositivePersistedAssistantUsageTotalTokens(nodes: MessageNode[]): number {
  const turns = groupIntoTurns(nodes);
  const latestPositiveAssistantTurnIndex = turns.reduce((latestIndex, turn, index) => {
    const totalTokens = getAssistantUsageTotalTokens(turn.assistantNode);
    return totalTokens > 0 ? index : latestIndex;
  }, -1);

  if (latestPositiveAssistantTurnIndex < 0) {
    return 0;
  }

  return getAssistantUsageTotalTokens(
    turns[latestPositiveAssistantTurnIndex]?.assistantNode ?? null
  );
}

export function resolveComposerContextUsageTotalTokens(input: {
  nodes: MessageNode[];
  isSessionStreaming: boolean;
  streamingAssistant: AssistantStreamingMessage | null;
}): number {
  if (input.isSessionStreaming) {
    const liveUsageTotalTokens = Math.max(0, input.streamingAssistant?.usage.totalTokens ?? 0);
    if (liveUsageTotalTokens > 0) {
      return liveUsageTotalTokens;
    }

    return getLatestPositivePersistedAssistantUsageTotalTokens(input.nodes);
  }

  const latestPersistedUsageTotalTokens = getLatestPersistedAssistantUsageTotalTokens(input.nodes);
  if (latestPersistedUsageTotalTokens > 0) {
    return latestPersistedUsageTotalTokens;
  }

  return getLatestPositivePersistedAssistantUsageTotalTokens(input.nodes);
}
