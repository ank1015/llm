import type { Message, MessageNode } from '@ank1015/llm-sdk';

export type MessageTurn = {
  userMessageId: string | null;
  userNode: MessageNode | null;
  cotMessages: Message[];
  assistantNode: MessageNode | null;
};

// eslint-disable-next-line sonarjs/cognitive-complexity
export function groupMessageNodesIntoTurns(nodes: MessageNode[]): MessageTurn[] {
  const turns: MessageTurn[] = [];
  let index = 0;

  if (index < nodes.length && nodes[index]?.message.role !== 'user') {
    const leadingNodes: MessageNode[] = [];

    while (index < nodes.length && nodes[index]?.message.role !== 'user') {
      const node = nodes[index];
      if (node) {
        leadingNodes.push(node);
      }
      index += 1;
    }

    const cotMessages = leadingNodes.map((node) => node.message);
    const lastNode = leadingNodes.at(-1) ?? null;
    const assistantNode = lastNode?.message.role === 'assistant' ? lastNode : null;

    turns.push({
      userMessageId: null,
      userNode: null,
      cotMessages,
      assistantNode,
    });
  }

  while (index < nodes.length) {
    const userNode = nodes[index] ?? null;
    index += 1;

    if (!userNode) {
      continue;
    }

    const betweenNodes: MessageNode[] = [];

    while (index < nodes.length && nodes[index]?.message.role !== 'user') {
      const node = nodes[index];
      if (node) {
        betweenNodes.push(node);
      }
      index += 1;
    }

    const cotMessages = betweenNodes.map((node) => node.message);
    const lastNode = betweenNodes.at(-1) ?? null;
    const assistantNode = lastNode?.message.role === 'assistant' ? lastNode : null;

    turns.push({
      userMessageId: userNode.message.id,
      userNode,
      cotMessages,
      assistantNode,
    });
  }

  return turns;
}
