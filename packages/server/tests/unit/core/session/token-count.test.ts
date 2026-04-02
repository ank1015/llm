import { getModel } from '@ank1015/llm-core';
import { describe, expect, it } from 'vitest';

import type { Api, BaseAssistantMessage, Message } from '@ank1015/llm-sdk';

const { estimateMessagesTokenCount, estimateTextTokenCount } =
  await import('../../../../src/core/session/token-count.js');

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
  modelId: string;
  responseText?: string;
  thinkingText?: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown>; toolCallId: string }>;
}): BaseAssistantMessage<Api> {
  const { api, providerModelId } = splitCuratedModelId(input.modelId);
  const model = getModel(api, providerModelId as never);
  if (!model) {
    throw new Error(`Model not found for ${input.modelId}`);
  }

  const content: BaseAssistantMessage<Api>['content'] = [];
  if (input.thinkingText) {
    content.push({
      type: 'thinking',
      thinkingText: input.thinkingText,
    });
  }
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
    id: `assistant-${Math.random().toString(36).slice(2)}`,
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

describe('estimateMessagesTokenCount', () => {
  it('counts user text, assistant response text, assistant tool calls, and tool result text', () => {
    const messages: Message[] = [
      {
        role: 'user',
        id: 'user-1',
        content: [
          { type: 'text', content: 'abcd' },
          {
            type: 'file',
            data: 'ignored-file-bytes',
            mimeType: 'text/plain',
            filename: 'note.txt',
          },
        ],
      },
      buildAssistantMessage({
        modelId: 'codex/gpt-5.4',
        responseText: 'abcde',
        thinkingText: 'this should not be counted',
        toolCalls: [{ name: 'read', arguments: {}, toolCallId: 'call-1' }],
      }),
      {
        role: 'toolResult',
        id: 'tool-1',
        toolName: 'read',
        toolCallId: 'call-1',
        content: [
          { type: 'text', content: 'abcdefgh' },
          {
            type: 'image',
            data: 'ignored-image-bytes',
            mimeType: 'image/png',
          },
        ],
        isError: false,
        timestamp: Date.now(),
      },
    ];

    expect(estimateMessagesTokenCount(messages)).toBe(6);
  });

  it('includes tool result error text and ignores custom messages', () => {
    const messages: Message[] = [
      {
        role: 'custom',
        id: 'custom-1',
        content: { debug: 'do not count this' },
      },
      {
        role: 'toolResult',
        id: 'tool-1',
        toolName: 'bash',
        toolCallId: 'call-1',
        content: [{ type: 'text', content: 'oops' }],
        isError: true,
        error: { message: 'badpath' },
        timestamp: Date.now(),
      },
    ];

    expect(estimateMessagesTokenCount(messages)).toBe(3);
  });
});

describe('estimateTextTokenCount', () => {
  it('uses a simple four-characters-per-token approximation', () => {
    expect(estimateTextTokenCount('')).toBe(0);
    expect(estimateTextTokenCount('abcd')).toBe(1);
    expect(estimateTextTokenCount('abcde')).toBe(2);
    expect(estimateTextTokenCount(8)).toBe(2);
  });
});
