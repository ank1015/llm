import type { MessageNode } from '@ank1015/llm-types';

export type BranchNavigatorState = {
  currentIndex: number;
  total: number;
  previousLeafNodeId: string | null;
  nextLeafNodeId: string | null;
};

function toTimestamp(node: MessageNode): number {
  const parsed = Date.parse(node.timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function compareMessageNodeChronology(a: MessageNode, b: MessageNode): number {
  const timestampDifference = toTimestamp(a) - toTimestamp(b);
  if (timestampDifference !== 0) {
    return timestampDifference;
  }

  return a.id.localeCompare(b.id);
}

export function sortMessageNodesChronologically(nodes: MessageNode[]): MessageNode[] {
  return [...nodes].sort(compareMessageNodeChronology);
}

export function getVisiblePathNodes(
  nodes: MessageNode[],
  leafNodeId: string | null
): MessageNode[] {
  if (!leafNodeId) {
    return [];
  }

  const nodeMap = new Map<string, MessageNode>(nodes.map((node) => [node.id, node]));
  const lineage: MessageNode[] = [];
  let current = nodeMap.get(leafNodeId) ?? null;

  while (current) {
    lineage.push(current);
    current = current.parentId ? (nodeMap.get(current.parentId) ?? null) : null;
  }

  return lineage.reverse();
}

function buildChildrenByParentId(nodes: MessageNode[]): Map<string, MessageNode[]> {
  const childrenByParentId = new Map<string, MessageNode[]>();

  for (const node of nodes) {
    if (!node.parentId) {
      continue;
    }

    const existing = childrenByParentId.get(node.parentId) ?? [];
    existing.push(node);
    childrenByParentId.set(node.parentId, existing);
  }

  for (const children of childrenByParentId.values()) {
    children.sort(compareMessageNodeChronology);
  }

  return childrenByParentId;
}

export function getLatestLeafNodeIdInSubtree(
  nodes: MessageNode[],
  rootNodeId: string
): string | null {
  const nodeMap = new Map<string, MessageNode>(nodes.map((node) => [node.id, node]));
  if (!nodeMap.has(rootNodeId)) {
    return null;
  }

  const childrenByParentId = buildChildrenByParentId(nodes);
  const stack = [rootNodeId];
  let latestLeafNode: MessageNode | null = null;

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) {
      continue;
    }

    const currentNode = nodeMap.get(currentId);
    if (!currentNode) {
      continue;
    }

    const children = childrenByParentId.get(currentId) ?? [];
    if (children.length === 0) {
      if (!latestLeafNode || compareMessageNodeChronology(latestLeafNode, currentNode) < 0) {
        latestLeafNode = currentNode;
      }
      continue;
    }

    for (const child of children) {
      stack.push(child.id);
    }
  }

  return latestLeafNode?.id ?? null;
}

export function getBranchNavigatorState(
  nodes: MessageNode[],
  userNode: MessageNode
): BranchNavigatorState | null {
  if (userNode.message.role !== 'user' || !userNode.parentId) {
    return null;
  }

  const siblings = nodes
    .filter((node) => node.parentId === userNode.parentId && node.message.role === 'user')
    .sort(compareMessageNodeChronology);

  if (siblings.length <= 1) {
    return null;
  }

  const currentIndex = siblings.findIndex((node) => node.id === userNode.id);
  if (currentIndex === -1) {
    return null;
  }

  const previousSibling = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const nextSibling = currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

  return {
    currentIndex: currentIndex + 1,
    total: siblings.length,
    previousLeafNodeId: previousSibling
      ? getLatestLeafNodeIdInSubtree(nodes, previousSibling.id)
      : null,
    nextLeafNodeId: nextSibling ? getLatestLeafNodeIdInSubtree(nodes, nextSibling.id) : null,
  };
}
