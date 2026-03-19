import { describe, expect, it } from 'vitest';

import type { Api, BaseAssistantMessage, MessageNode } from '@ank1015/llm-sdk';

import { resolveAssistantTraceApi } from '@/lib/messages/chat-turns';


function createAssistantNode(api: Api): MessageNode {
  return {
    type: 'message',
    id: `node-${api}`,
    parentId: 'user-node',
    branch: 'main',
    timestamp: new Date(1000).toISOString(),
    message: {
      role: 'assistant',
      id: `assistant-${api}`,
      api,
      model: {
        id: `${api}-model`,
        name: `${api} model`,
        api,
        baseUrl: 'https://example.com',
        reasoning: true,
        input: ['text'],
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
        contextWindow: 200000,
        maxTokens: 8192,
        tools: ['bash'],
      },
      timestamp: 1000,
      duration: 10,
      stopReason: 'stop',
      content: [],
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
      message: {} as never,
    },
    api,
    modelId: `${api}-model`,
    providerOptions: {},
  };
}

function createStreamingAssistant(api: Api): Omit<BaseAssistantMessage<Api>, 'message'> {
  return {
    role: 'assistant',
    id: `assistant-${api}`,
    api,
    model: {
      id: `${api}-model`,
      name: `${api} model`,
      api,
      baseUrl: 'https://example.com',
      reasoning: true,
      input: ['text'],
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      contextWindow: 200000,
      maxTokens: 8192,
      tools: ['bash'],
    },
    timestamp: 1000,
    duration: 10,
    stopReason: 'stop',
    content: [],
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

describe('lib/messages/chat-turns', () => {
  it('prefers the persisted assistant node api when present', () => {
    expect(
      resolveAssistantTraceApi({
        assistantNode: createAssistantNode('openai'),
        streamingAssistant: createStreamingAssistant('anthropic'),
      })
    ).toBe('openai');
  });

  it('falls back to the streaming assistant api when no persisted assistant exists', () => {
    expect(
      resolveAssistantTraceApi({
        assistantNode: null,
        streamingAssistant: createStreamingAssistant('anthropic'),
      })
    ).toBe('anthropic');
  });

  it('defaults to openai when neither source is available', () => {
    expect(
      resolveAssistantTraceApi({
        assistantNode: null,
        streamingAssistant: null,
      })
    ).toBe('openai');
  });
});
