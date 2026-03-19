import { describe, expect, it } from 'vitest';

import type { Api, BaseAssistantMessage, MessageNode, UserMessage } from '@ank1015/llm-types';

import { resolveComposerContextUsageTotalTokens } from '@/lib/messages/composer-context-usage';

function createUserNode(input: { id: string; timestamp?: number }): MessageNode {
  const message: UserMessage = {
    role: 'user',
    id: input.id,
    timestamp: input.timestamp ?? 1000,
    content: [{ type: 'text', content: 'Hello' }],
  };

  return {
    type: 'message',
    id: `node-${input.id}`,
    parentId: null,
    branch: 'main',
    timestamp: new Date(message.timestamp ?? 1000).toISOString(),
    message,
    api: 'openai',
    modelId: 'openai-model',
    providerOptions: {},
  };
}

function createAssistantMessage(input: {
  id: string;
  usageTotalTokens: number;
  api?: Api;
  timestamp?: number;
}): BaseAssistantMessage<Api> {
  const api = input.api ?? 'openai';
  const timestamp = input.timestamp ?? 2000;

  return {
    role: 'assistant',
    id: input.id,
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
    timestamp,
    duration: 10,
    stopReason: 'stop',
    content: [
      {
        type: 'response',
        content: [{ type: 'text', content: 'Assistant reply' }],
      },
    ],
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: input.usageTotalTokens,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    message: {} as never,
  };
}

function createAssistantNode(input: {
  id: string;
  usageTotalTokens: number;
  parentId: string;
  api?: Api;
  timestamp?: number;
}): MessageNode {
  const message = createAssistantMessage({
    id: input.id,
    usageTotalTokens: input.usageTotalTokens,
    api: input.api,
    timestamp: input.timestamp,
  });

  return {
    type: 'message',
    id: `node-${input.id}`,
    parentId: input.parentId,
    branch: 'main',
    timestamp: new Date(message.timestamp).toISOString(),
    message,
    api: message.api,
    modelId: message.model.id,
    providerOptions: {},
  };
}

function createStreamingAssistant(input: {
  id: string;
  usageTotalTokens: number;
  api?: Api;
}): Omit<BaseAssistantMessage<Api>, 'message'> {
  const assistant = createAssistantMessage({
    id: input.id,
    usageTotalTokens: input.usageTotalTokens,
    api: input.api,
  });

  return {
    role: assistant.role,
    id: assistant.id,
    api: assistant.api,
    model: assistant.model,
    errorMessage: assistant.errorMessage,
    timestamp: assistant.timestamp,
    duration: assistant.duration,
    stopReason: assistant.stopReason,
    content: assistant.content,
    usage: assistant.usage,
  };
}

describe('resolveComposerContextUsageTotalTokens', () => {
  it('returns the latest persisted assistant usage for completed threads', () => {
    const userNode = createUserNode({ id: 'user-1' });
    const assistantNode = createAssistantNode({
      id: 'assistant-1',
      usageTotalTokens: 321,
      parentId: userNode.id,
    });

    expect(
      resolveComposerContextUsageTotalTokens({
        nodes: [userNode, assistantNode],
        isSessionStreaming: false,
        streamingAssistant: null,
      })
    ).toBe(321);
  });

  it('uses the live streaming assistant usage when it becomes positive', () => {
    const userNode = createUserNode({ id: 'user-1' });

    expect(
      resolveComposerContextUsageTotalTokens({
        nodes: [userNode],
        isSessionStreaming: true,
        streamingAssistant: createStreamingAssistant({
          id: 'assistant-live',
          usageTotalTokens: 777,
        }),
      })
    ).toBe(777);
  });

  it('keeps showing the latest persisted usage while streaming until live usage becomes positive', () => {
    const previousUserNode = createUserNode({ id: 'user-1', timestamp: 1000 });
    const previousAssistantNode = createAssistantNode({
      id: 'assistant-1',
      usageTotalTokens: 222,
      parentId: previousUserNode.id,
      timestamp: 1100,
    });
    const currentUserNode = createUserNode({ id: 'user-2', timestamp: 2000 });

    expect(
      resolveComposerContextUsageTotalTokens({
        nodes: [previousUserNode, previousAssistantNode, currentUserNode],
        isSessionStreaming: true,
        streamingAssistant: createStreamingAssistant({
          id: 'assistant-live',
          usageTotalTokens: 0,
        }),
      })
    ).toBe(222);
  });

  it('returns 0 while streaming when there is no live or persisted usage yet', () => {
    const currentUserNode = createUserNode({ id: 'user-1', timestamp: 2000 });

    expect(
      resolveComposerContextUsageTotalTokens({
        nodes: [currentUserNode],
        isSessionStreaming: true,
        streamingAssistant: createStreamingAssistant({
          id: 'assistant-live',
          usageTotalTokens: 0,
        }),
      })
    ).toBe(0);
  });

  it('falls back to the current streaming turn persisted assistant usage during reconnects', () => {
    const userNode = createUserNode({ id: 'user-1' });
    const assistantNode = createAssistantNode({
      id: 'assistant-1',
      usageTotalTokens: 456,
      parentId: userNode.id,
    });

    expect(
      resolveComposerContextUsageTotalTokens({
        nodes: [userNode, assistantNode],
        isSessionStreaming: true,
        streamingAssistant: createStreamingAssistant({
          id: 'assistant-live',
          usageTotalTokens: 0,
        }),
      })
    ).toBe(456);
  });

  it('ignores a latest zero-usage persisted assistant and keeps the latest positive usage', () => {
    const previousUserNode = createUserNode({ id: 'user-1', timestamp: 1000 });
    const previousAssistantNode = createAssistantNode({
      id: 'assistant-1',
      usageTotalTokens: 333,
      parentId: previousUserNode.id,
      timestamp: 1100,
    });
    const currentUserNode = createUserNode({ id: 'user-2', timestamp: 2000 });
    const currentAssistantNode = createAssistantNode({
      id: 'assistant-2',
      usageTotalTokens: 0,
      parentId: currentUserNode.id,
      timestamp: 2100,
    });

    expect(
      resolveComposerContextUsageTotalTokens({
        nodes: [previousUserNode, previousAssistantNode, currentUserNode, currentAssistantNode],
        isSessionStreaming: false,
        streamingAssistant: null,
      })
    ).toBe(333);
  });
});
