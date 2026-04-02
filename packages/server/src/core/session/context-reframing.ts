import { getModel } from '@ank1015/llm-core';

import { getSessionCompactionNodes } from './compaction-storage.js';
import {
  getFinalAssistantReply,
  getTurnCompactionReplacementSpan,
  splitLeadingUserMessages,
} from './compaction.js';
import { estimateMessagesTokenCount } from './token-count.js';

import type { SessionCompactionNode } from '../../types/index.js';
import type { Api } from '@ank1015/llm-core';
import type { CuratedModelId, Message, SessionMessagesLoader, UserMessage } from '@ank1015/llm-sdk';

const NON_HISTORY_RESERVE_TOKENS = 3000;
const RAW_TURNS_BUDGET_RATIO = 0.5;
const SESSION_COMPACTION_LOG_PREFIX = '[session-compaction]';
const SYSTEM_GENERATED_MESSAGE_START_TAG = '<max_system_generated_message>';
const SYSTEM_GENERATED_MESSAGE_END_TAG = '</max_system_generated_message>';
const COMPACTED_TURN_SUMMARY_START_TAG = '<compacted_turn_summary>';
const COMPACTED_TURN_SUMMARY_END_TAG = '</compacted_turn_summary>';

type ParsedCompletedTurn = {
  messages: Message[];
  leadingUserMessages: Extract<Message, { role: 'user' }>[];
  finalAssistantReply: Extract<Message, { role: 'assistant' }> | null;
  replacementSpan: {
    firstNodeId: string;
    lastNodeId: string;
  } | null;
  rawTokenCount: number;
};

export interface CreateSessionContextReframingLoaderInput {
  projectId: string;
  artifactDirId: string;
  sessionId: string;
  modelId: CuratedModelId;
}

export interface ReframeSessionHistoryInput {
  messages: Message[];
  branchName: string;
  rawTurnsBudget: number;
  compactionNodes: SessionCompactionNode[];
}

export interface ReframeSessionHistoryResult {
  messages: Message[];
  totalTurns: number;
  rawTurnCount: number;
  compactedTurnCount: number;
  fallbackRawTurnCount: number;
  rawTurnsBudget: number;
  rawTurnsTokenCount: number;
}

export function createSessionContextReframingLoader(
  input: CreateSessionContextReframingLoaderInput
): SessionMessagesLoader {
  return async (context) => {
    const historyMessages = context.lineage.nodes
      .filter(
        (node): node is Extract<(typeof context.lineage.nodes)[number], { type: 'message' }> => {
          return node.type === 'message';
        }
      )
      .map((node) => node.message);

    const rawTurnsBudget = resolveRawTurnsBudget(input.modelId);
    if (rawTurnsBudget === null) {
      logCompactionInfo(
        'Skipping context reframing because the model context window could not be resolved',
        {
          sessionId: input.sessionId,
          branchName: context.branch,
          modelId: input.modelId,
        }
      );
      return historyMessages;
    }

    let compactionNodes: SessionCompactionNode[];
    try {
      compactionNodes = await getSessionCompactionNodes(
        input.projectId,
        input.artifactDirId,
        input.sessionId
      );
    } catch (error) {
      logCompactionInfo(
        'Skipping context reframing because compaction sidecar could not be loaded',
        {
          sessionId: input.sessionId,
          branchName: context.branch,
          modelId: input.modelId,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return historyMessages;
    }

    const reframed = reframeSessionHistoryForContext({
      messages: historyMessages,
      branchName: context.branch,
      rawTurnsBudget,
      compactionNodes,
    });

    logCompactionInfo('Reframed session history for agent context', {
      sessionId: input.sessionId,
      branchName: context.branch,
      modelId: input.modelId,
      totalTurns: reframed.totalTurns,
      rawTurnCount: reframed.rawTurnCount,
      compactedTurnCount: reframed.compactedTurnCount,
      fallbackRawTurnCount: reframed.fallbackRawTurnCount,
      rawTurnsBudget: reframed.rawTurnsBudget,
      rawTurnsTokenCount: reframed.rawTurnsTokenCount,
      returnedMessageCount: reframed.messages.length,
    });

    return reframed.messages;
  };
}

export function reframeSessionHistoryForContext(
  input: ReframeSessionHistoryInput
): ReframeSessionHistoryResult {
  const turns = parseCompletedTurns(input.messages);
  if (turns.length === 0) {
    return {
      messages: [],
      totalTurns: 0,
      rawTurnCount: 0,
      compactedTurnCount: 0,
      fallbackRawTurnCount: 0,
      rawTurnsBudget: input.rawTurnsBudget,
      rawTurnsTokenCount: 0,
    };
  }

  const reframedTurns = new Array<Message[]>(turns.length);
  let rawTurnsTokenCount = 0;
  let rawTurnCount = 0;
  let compactedTurnCount = 0;
  let fallbackRawTurnCount = 0;

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]!;
    const isNewestTurn = index === turns.length - 1;
    const shouldKeepRaw =
      isNewestTurn || rawTurnsTokenCount + turn.rawTokenCount <= input.rawTurnsBudget;

    if (shouldKeepRaw) {
      reframedTurns[index] = turn.messages;
      rawTurnsTokenCount += turn.rawTokenCount;
      rawTurnCount += 1;
      continue;
    }

    const matchingCompactionNode = findMatchingTurnCompactionNode(
      turn,
      input.compactionNodes,
      input.branchName
    );
    if (matchingCompactionNode) {
      reframedTurns[index] = buildCompactedTurnMessages(turn, matchingCompactionNode);
      compactedTurnCount += 1;
      continue;
    }

    reframedTurns[index] = turn.messages;
    fallbackRawTurnCount += 1;
  }

  return {
    messages: reframedTurns.flat(),
    totalTurns: turns.length,
    rawTurnCount,
    compactedTurnCount,
    fallbackRawTurnCount,
    rawTurnsBudget: input.rawTurnsBudget,
    rawTurnsTokenCount,
  };
}

function parseCompletedTurns(messages: Message[]): ParsedCompletedTurn[] {
  const groupedTurns = groupMessagesIntoTurns(messages);

  return groupedTurns.map((turnMessages) => {
    const { leadingUserMessages, remainingMessages } = splitLeadingUserMessages(turnMessages);
    return {
      messages: turnMessages,
      leadingUserMessages,
      finalAssistantReply: getFinalAssistantReply(remainingMessages),
      replacementSpan: getTurnCompactionReplacementSpan(turnMessages),
      rawTokenCount: estimateMessagesTokenCount(turnMessages),
    };
  });
}

function groupMessagesIntoTurns(messages: Message[]): Message[][] {
  if (messages.length === 0) {
    return [];
  }

  const turns: Message[][] = [];
  let currentTurn: Message[] = [];
  let currentTurnHasNonUserMessage = false;

  for (const message of messages) {
    if (currentTurn.length === 0) {
      currentTurn.push(message);
      currentTurnHasNonUserMessage = message.role !== 'user';
      continue;
    }

    if (message.role === 'user' && currentTurnHasNonUserMessage) {
      turns.push(currentTurn);
      currentTurn = [message];
      currentTurnHasNonUserMessage = false;
      continue;
    }

    currentTurn.push(message);
    if (message.role !== 'user') {
      currentTurnHasNonUserMessage = true;
    }
  }

  if (currentTurn.length > 0) {
    turns.push(currentTurn);
  }

  return turns;
}

function findMatchingTurnCompactionNode(
  turn: ParsedCompletedTurn,
  compactionNodes: SessionCompactionNode[],
  branchName: string
): Extract<SessionCompactionNode, { type: 'turn_compact' }> | null {
  if (!turn.replacementSpan) {
    return null;
  }

  for (let index = compactionNodes.length - 1; index >= 0; index -= 1) {
    const node = compactionNodes[index];
    if (!node || node.type !== 'turn_compact') {
      continue;
    }
    if (node.branchName !== branchName) {
      continue;
    }
    if (node.firstNodeId !== turn.replacementSpan.firstNodeId) {
      continue;
    }
    if (node.lastNodeId !== turn.replacementSpan.lastNodeId) {
      continue;
    }

    return node;
  }

  return null;
}

function buildCompactedTurnMessages(
  turn: ParsedCompletedTurn,
  node: Extract<SessionCompactionNode, { type: 'turn_compact' }>
): Message[] {
  const messages: Message[] = [
    ...turn.leadingUserMessages,
    createCompactedTurnSummaryMessage(node),
  ];

  if (turn.finalAssistantReply) {
    messages.push(turn.finalAssistantReply);
  }

  return messages;
}

function createCompactedTurnSummaryMessage(
  node: Extract<SessionCompactionNode, { type: 'turn_compact' }>
): UserMessage {
  return {
    role: 'user',
    id: `system-generated-turn-compaction-${node.id}`,
    content: [
      {
        type: 'text',
        content:
          `${SYSTEM_GENERATED_MESSAGE_START_TAG}` +
          `${COMPACTED_TURN_SUMMARY_START_TAG}` +
          `${node.compactionSummary}` +
          `${COMPACTED_TURN_SUMMARY_END_TAG}` +
          `${SYSTEM_GENERATED_MESSAGE_END_TAG}`,
      },
    ],
  };
}

function resolveRawTurnsBudget(modelId: CuratedModelId): number | null {
  const resolvedModel = getResolvedModel(modelId);
  if (!resolvedModel) {
    return null;
  }

  const usableHistoryBudget = Math.max(0, resolvedModel.contextWindow - NON_HISTORY_RESERVE_TOKENS);
  return Math.floor(usableHistoryBudget * RAW_TURNS_BUDGET_RATIO);
}

function getResolvedModel(modelId: CuratedModelId) {
  const separator = modelId.indexOf('/');
  if (separator <= 0) {
    return null;
  }

  const api = modelId.slice(0, separator) as Api;
  const providerModelId = modelId.slice(separator + 1);
  return getModel(api, providerModelId as never) ?? null;
}

function logCompactionInfo(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.info(`${SESSION_COMPACTION_LOG_PREFIX} ${message}`, details);
    return;
  }

  console.info(`${SESSION_COMPACTION_LOG_PREFIX} ${message}`);
}
