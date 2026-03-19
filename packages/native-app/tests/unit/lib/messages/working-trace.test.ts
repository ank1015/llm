import { describe, expect, it } from 'vitest';

import type { Api, BaseAssistantMessage, MessageNode, ToolResultMessage } from '@ank1015/llm-sdk';

import { buildWorkingTraceModel } from '@/lib/messages/working-trace';


function createAssistantMessage(input: {
  id: string;
  api?: Api;
  content: BaseAssistantMessage<Api>['content'];
  timestamp?: number;
}): BaseAssistantMessage<Api> {
  const api = input.api ?? 'openai';
  const timestamp = input.timestamp ?? 1000;

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
    errorMessage: undefined,
    timestamp,
    duration: 10,
    stopReason: 'stop',
    content: input.content,
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
  };
}

function createAssistantNode(message: BaseAssistantMessage<Api>): MessageNode {
  return {
    type: 'message',
    id: `node-${message.id}`,
    parentId: 'user-node',
    branch: 'main',
    timestamp: new Date(message.timestamp).toISOString(),
    message,
    api: message.api,
    modelId: message.model.id,
    providerOptions: {},
  };
}

function createToolResultMessage(input: {
  id: string;
  toolCallId: string;
  toolName: string;
  text: string;
  isError?: boolean;
}): ToolResultMessage {
  return {
    role: 'toolResult',
    id: input.id,
    toolName: input.toolName,
    toolCallId: input.toolCallId,
    content: [{ type: 'text', content: input.text }],
    isError: input.isError ?? false,
    timestamp: 1010,
  };
}

describe('lib/messages/working-trace', () => {
  it('keeps streaming response-only text inline and does not promote it to finalResponseText', () => {
    const assistant = createAssistantMessage({
      id: 'assistant-live',
      content: [
        {
          type: 'response',
          content: [{ type: 'text', content: 'Live answer' }],
        },
      ],
    });
    const { message: _nativeMessage, ...streamingAssistant } = assistant;

    const model = buildWorkingTraceModel({
      cotMessages: [],
      assistantNode: null,
      isStreamingTurn: true,
      streamingAssistant,
      agentEvents: [],
      api: 'openai',
    });

    expect(model.finalResponseText).toBeNull();
    expect(model.items).toEqual([
      {
        id: 'assistant-live-assistant-note-0',
        type: 'assistant_note',
        body: 'Live answer',
      },
    ]);
  });

  it('keeps streaming response blocks inline around tool calls', () => {
    const assistant = createAssistantMessage({
      id: 'assistant-live',
      content: [
        {
          type: 'response',
          content: [{ type: 'text', content: 'Before tool' }],
        },
        {
          type: 'toolCall',
          name: 'bash',
          toolCallId: 'tool-1',
          arguments: { command: 'echo hello' },
        },
        {
          type: 'response',
          content: [{ type: 'text', content: 'After tool' }],
        },
      ],
    });
    const { message: _nativeMessage, ...streamingAssistant } = assistant;

    const model = buildWorkingTraceModel({
      cotMessages: [],
      assistantNode: null,
      isStreamingTurn: true,
      streamingAssistant,
      agentEvents: [],
      api: 'openai',
    });

    expect(model.finalResponseText).toBeNull();
    expect(model.items).toHaveLength(3);
    expect(model.items[0]).toMatchObject({
      type: 'assistant_note',
      body: 'Before tool',
    });
    expect(model.items[1]).toMatchObject({
      type: 'tool',
      toolName: 'bash',
      title: 'bash echo hello',
      status: 'running',
    });
    expect(model.items[2]).toMatchObject({
      type: 'assistant_note',
      body: 'After tool',
    });
  });

  it('only promotes trailing response blocks to the completed final response', () => {
    const assistant = createAssistantMessage({
      id: 'assistant-complete',
      content: [
        {
          type: 'response',
          content: [{ type: 'text', content: 'Before tool' }],
        },
        {
          type: 'toolCall',
          name: 'bash',
          toolCallId: 'tool-1',
          arguments: { command: 'echo hello' },
        },
        {
          type: 'response',
          content: [{ type: 'text', content: 'Final answer' }],
        },
      ],
    });
    const toolResult = createToolResultMessage({
      id: 'tool-result-1',
      toolCallId: 'tool-1',
      toolName: 'bash',
      text: 'hello',
    });

    const model = buildWorkingTraceModel({
      cotMessages: [assistant, toolResult],
      assistantNode: createAssistantNode(assistant),
      isStreamingTurn: false,
      streamingAssistant: null,
      agentEvents: [],
      api: 'openai',
    });

    expect(model.finalResponseText).toBe('Final answer');
    expect(model.items).toHaveLength(2);
    expect(model.items[0]).toMatchObject({
      type: 'assistant_note',
      body: 'Before tool',
    });
    expect(model.items[1]).toMatchObject({
      type: 'tool',
      toolName: 'bash',
      status: 'done',
    });
  });
});
