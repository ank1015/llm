import { getModel } from '@ank1015/llm-core';
import { describe, expect, it } from 'vitest';

import type { SessionCompactionNode } from '../../../../src/types/index.js';
import type { Api, BaseAssistantMessage, Message } from '@ank1015/llm-sdk';

const { reframeSessionHistoryForContext } =
  await import('../../../../src/core/session/context-reframing.js');

function splitCuratedModelId(modelId: string): { api: Api; providerModelId: string } {
  const separator = modelId.indexOf('/');
  if (separator <= 0) {
    throw new Error(`Invalid curated modelId: ${modelId}`);
  }

  return {
    api: modelId.slice(0, separator) as Api,
    providerModelId: modelId.slice(separator + 1),
  };
}

function buildAssistantMessage(input: {
  id: string;
  modelId?: string;
  responseText?: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown>; toolCallId: string }>;
}): BaseAssistantMessage<Api> {
  const modelId = input.modelId ?? 'codex/gpt-5.4';
  const { api, providerModelId } = splitCuratedModelId(modelId);
  const model = getModel(api, providerModelId as never);
  if (!model) {
    throw new Error(`Model not found for ${modelId}`);
  }

  const content: BaseAssistantMessage<Api>['content'] = [];
  if (input.responseText) {
    content.push({
      type: 'response',
      response: [{ type: 'text', content: input.responseText }],
    });
  }
  for (const toolCall of input.toolCalls ?? []) {
    content.push({
      type: 'toolCall',
      name: toolCall.name,
      arguments: toolCall.arguments,
      toolCallId: toolCall.toolCallId,
    });
  }

  return {
    role: 'assistant',
    id: input.id,
    api,
    model,
    message: {} as never,
    timestamp: Date.now(),
    duration: 1,
    stopReason: input.toolCalls?.length ? 'toolUse' : 'stop',
    content,
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
  };
}

function buildTurnCompactionNode(input: {
  id: string;
  branchName?: string;
  firstNodeId: string;
  lastNodeId: string;
  compactionSummary: string;
}): SessionCompactionNode {
  return {
    id: input.id,
    type: 'turn_compact',
    createdAt: '2026-01-01T00:00:00.000Z',
    branchName: input.branchName ?? 'main',
    firstNodeId: input.firstNodeId,
    lastNodeId: input.lastNodeId,
    compactionSummary: input.compactionSummary,
  };
}

describe('reframeSessionHistoryForContext', () => {
  it('keeps newest turns raw and replaces older internal traces with a compacted summary', () => {
    const oldestFinalAssistant = buildAssistantMessage({
      id: 'assistant-final-1',
      responseText: 'a'.repeat(120),
    });
    const newestAssistant = buildAssistantMessage({
      id: 'assistant-final-3',
      responseText: 'b'.repeat(120),
    });
    const middleAssistant = buildAssistantMessage({
      id: 'assistant-final-2',
      responseText: 'c'.repeat(120),
    });

    const messages: Message[] = [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'u'.repeat(120) }],
      },
      buildAssistantMessage({
        id: 'assistant-trace-1',
        toolCalls: [
          {
            name: 'read',
            arguments: { path: '/tmp/project/src/app.ts' },
            toolCallId: 'call-1',
          },
        ],
      }),
      {
        role: 'toolResult',
        id: 'tool-1',
        toolName: 'read',
        toolCallId: 'call-1',
        content: [{ type: 'text', content: 'r'.repeat(120) }],
        isError: false,
        timestamp: Date.now(),
      },
      oldestFinalAssistant,
      {
        role: 'user',
        id: 'user-2',
        content: [{ type: 'text', content: 'm'.repeat(120) }],
      },
      middleAssistant,
      {
        role: 'user',
        id: 'user-3',
        content: [{ type: 'text', content: 'n'.repeat(120) }],
      },
      newestAssistant,
    ];

    const reframed = reframeSessionHistoryForContext({
      messages,
      branchName: 'main',
      rawTurnsBudget: 140,
      compactionNodes: [
        buildTurnCompactionNode({
          id: 'compact-1',
          firstNodeId: 'assistant-trace-1',
          lastNodeId: 'tool-1',
          compactionSummary: 'Read /tmp/project/src/app.ts and updated the earlier logic.',
        }),
      ],
    });

    expect(reframed.rawTurnCount).toBe(2);
    expect(reframed.compactedTurnCount).toBe(1);
    expect(reframed.fallbackRawTurnCount).toBe(0);
    expect(reframed.messages.map((message) => message.role)).toEqual([
      'user',
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
    ]);

    const compactedSummaryMessage = reframed.messages[1];
    expect(compactedSummaryMessage?.role).toBe('user');
    expect(
      compactedSummaryMessage?.role === 'user' ? compactedSummaryMessage.content[0]?.type : null
    ).toBe('text');
    expect(
      compactedSummaryMessage?.role === 'user'
        ? compactedSummaryMessage.content[0]?.content
        : undefined
    ).toBe(
      '<max_system_generated_message><compacted_turn_summary>Read /tmp/project/src/app.ts and updated the earlier logic.</compacted_turn_summary></max_system_generated_message>'
    );
    expect(reframed.messages[2]).toBe(oldestFinalAssistant);
    expect(reframed.messages[3]).toBe(messages[4]);
    expect(reframed.messages[4]).toBe(middleAssistant);
    expect(reframed.messages[5]).toBe(messages[6]);
    expect(reframed.messages[6]).toBe(newestAssistant);
  });

  it('compacts aborted turns into the original user messages plus one synthetic summary message', () => {
    const newestAssistant = buildAssistantMessage({
      id: 'assistant-final-2',
      responseText: 'z'.repeat(120),
    });

    const messages: Message[] = [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'u'.repeat(120) }],
      },
      buildAssistantMessage({
        id: 'assistant-trace-1',
        toolCalls: [
          {
            name: 'bash',
            arguments: { command: 'pnpm build' },
            toolCallId: 'call-1',
          },
        ],
      }),
      {
        role: 'toolResult',
        id: 'tool-1',
        toolName: 'bash',
        toolCallId: 'call-1',
        content: [{ type: 'text', content: 'Build failed' }],
        isError: true,
        error: { message: 'Type error' },
        timestamp: Date.now(),
      },
      {
        role: 'user',
        id: 'user-2',
        content: [{ type: 'text', content: 'n'.repeat(120) }],
      },
      newestAssistant,
    ];

    const reframed = reframeSessionHistoryForContext({
      messages,
      branchName: 'main',
      rawTurnsBudget: 80,
      compactionNodes: [
        buildTurnCompactionNode({
          id: 'compact-1',
          firstNodeId: 'assistant-trace-1',
          lastNodeId: 'tool-1',
          compactionSummary:
            'Ran pnpm build, hit a type error, and the turn ended before a final reply.',
        }),
      ],
    });

    expect(reframed.messages.map((message) => message.role)).toEqual([
      'user',
      'user',
      'user',
      'assistant',
    ]);
    expect(reframed.messages[0]).toBe(messages[0]);
    expect(
      reframed.messages[1]?.role === 'user' ? reframed.messages[1].content[0]?.content : ''
    ).toContain('Ran pnpm build, hit a type error');
    expect(reframed.messages[2]).toBe(messages[3]);
    expect(reframed.messages[3]).toBe(newestAssistant);
  });

  it('ignores mismatched legacy spans and falls back to raw turns', () => {
    const finalAssistant = buildAssistantMessage({
      id: 'assistant-final-1',
      responseText: 'a'.repeat(120),
    });
    const newestAssistant = buildAssistantMessage({
      id: 'assistant-final-2',
      responseText: 'b'.repeat(120),
    });

    const messages: Message[] = [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'u'.repeat(120) }],
      },
      buildAssistantMessage({
        id: 'assistant-trace-1',
        toolCalls: [
          {
            name: 'read',
            arguments: { path: '/tmp/project/src/app.ts' },
            toolCallId: 'call-1',
          },
        ],
      }),
      {
        role: 'toolResult',
        id: 'tool-1',
        toolName: 'read',
        toolCallId: 'call-1',
        content: [{ type: 'text', content: 'r'.repeat(120) }],
        isError: false,
        timestamp: Date.now(),
      },
      finalAssistant,
      {
        role: 'user',
        id: 'user-2',
        content: [{ type: 'text', content: 'n'.repeat(120) }],
      },
      newestAssistant,
    ];

    const reframed = reframeSessionHistoryForContext({
      messages,
      branchName: 'main',
      rawTurnsBudget: 80,
      compactionNodes: [
        buildTurnCompactionNode({
          id: 'legacy-like-node',
          firstNodeId: 'assistant-trace-1',
          lastNodeId: 'assistant-final-1',
          compactionSummary: 'This should not match the corrected span.',
        }),
      ],
    });

    expect(reframed.compactedTurnCount).toBe(0);
    expect(reframed.fallbackRawTurnCount).toBe(1);
    expect(reframed.messages).toEqual(messages);
  });

  it('filters compaction nodes by branch name', () => {
    const finalAssistant = buildAssistantMessage({
      id: 'assistant-final-1',
      responseText: 'a'.repeat(120),
    });
    const newestAssistant = buildAssistantMessage({
      id: 'assistant-final-2',
      responseText: 'b'.repeat(120),
    });

    const messages: Message[] = [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'u'.repeat(120) }],
      },
      buildAssistantMessage({
        id: 'assistant-trace-1',
        toolCalls: [
          {
            name: 'read',
            arguments: { path: '/tmp/project/src/app.ts' },
            toolCallId: 'call-1',
          },
        ],
      }),
      {
        role: 'toolResult',
        id: 'tool-1',
        toolName: 'read',
        toolCallId: 'call-1',
        content: [{ type: 'text', content: 'r'.repeat(120) }],
        isError: false,
        timestamp: Date.now(),
      },
      finalAssistant,
      {
        role: 'user',
        id: 'user-2',
        content: [{ type: 'text', content: 'n'.repeat(120) }],
      },
      newestAssistant,
    ];

    const reframed = reframeSessionHistoryForContext({
      messages,
      branchName: 'retry-branch',
      rawTurnsBudget: 80,
      compactionNodes: [
        buildTurnCompactionNode({
          id: 'compact-main',
          branchName: 'main',
          firstNodeId: 'assistant-trace-1',
          lastNodeId: 'tool-1',
          compactionSummary: 'This compaction is for another branch.',
        }),
      ],
    });

    expect(reframed.compactedTurnCount).toBe(0);
    expect(reframed.fallbackRawTurnCount).toBe(1);
    expect(reframed.messages).toEqual(messages);
  });
});
