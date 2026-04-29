import { Type } from '@sinclair/typebox';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamAwsBedrock } from '../../../src/providers/aws-bedrock/stream.js';
import * as awsBedrockUtils from '../../../src/providers/aws-bedrock/utils.js';
import { AssistantStreamError } from '../../../src/utils/event-stream.js';

import type { AwsBedrockProviderOptions, Context, Model } from '../../../src/types/index.js';

describe('AWS Bedrock stream', () => {
  const model: Model<'aws-bedrock'> = {
    id: 'anthropic.claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    api: 'aws-bedrock',
    baseUrl: '',
    reasoning: true,
    input: ['text'],
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    contextWindow: 200000,
    maxTokens: 64000,
    tools: ['function_calling'],
  };

  const options: AwsBedrockProviderOptions = {
    region: 'us-east-1',
  };

  const context: Context = {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Hello' }],
      },
    ],
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockBedrockClient(events: unknown[], sendError?: Error) {
    vi.spyOn(awsBedrockUtils, 'createClient').mockReturnValue({
      send: vi.fn(async () => {
        if (sendError) throw sendError;

        return {
          $metadata: { requestId: 'aws-request-1', httpStatusCode: 200 },
          stream: {
            async *[Symbol.asyncIterator]() {
              for (const event of events) {
                yield event;
              }
            },
          },
        };
      }),
    } as any);
  }

  it('returns a final aws-bedrock assistant message with normalized text and usage', async () => {
    mockBedrockClient([
      { messageStart: { role: 'assistant' } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Hel' } } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'lo' } } },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: 'end_turn' } },
      {
        metadata: {
          usage: {
            inputTokens: 10,
            outputTokens: 2,
            totalTokens: 12,
            cacheReadInputTokens: 3,
            cacheWriteInputTokens: 4,
          },
          metrics: { latencyMs: 123 },
        },
      },
    ]);

    const stream = streamAwsBedrock(model, context, options, 'bedrock-msg-1');
    const result = await stream.drain();

    expect(result.api).toBe('aws-bedrock');
    expect(result.message).toMatchObject({
      modelId: model.id,
      $metadata: { requestId: 'aws-request-1', httpStatusCode: 200 },
      content: [{ text: 'Hello' }],
      stopReason: 'end_turn',
      metrics: { latencyMs: 123 },
    });
    expect(result.content).toEqual([
      { type: 'response', response: [{ type: 'text', content: 'Hello' }] },
    ]);
    expect(result.usage).toMatchObject({
      input: 10,
      output: 2,
      cacheRead: 3,
      cacheWrite: 4,
      totalTokens: 12,
    });
  });

  it('normalizes thinking and tool calls', async () => {
    const toolContext: Context = {
      ...context,
      tools: [
        {
          name: 'search',
          description: 'Search',
          parameters: Type.Object({ query: Type.String() }),
        },
      ],
    };

    mockBedrockClient([
      { messageStart: { role: 'assistant' } },
      {
        contentBlockDelta: {
          contentBlockIndex: 0,
          delta: { reasoningContent: { text: 'thinking' } },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 0,
          delta: { reasoningContent: { signature: 'sig' } },
        },
      },
      { contentBlockStop: { contentBlockIndex: 0 } },
      {
        contentBlockStart: {
          contentBlockIndex: 1,
          start: { toolUse: { toolUseId: 'tool-1', name: 'search' } },
        },
      },
      { contentBlockDelta: { contentBlockIndex: 1, delta: { toolUse: { input: '{"query"' } } } },
      { contentBlockDelta: { contentBlockIndex: 1, delta: { toolUse: { input: ':"docs"}' } } } },
      { contentBlockStop: { contentBlockIndex: 1 } },
      { messageStop: { stopReason: 'tool_use' } },
    ]);

    const stream = streamAwsBedrock(model, toolContext, options, 'bedrock-msg-2');
    const result = await stream.drain();

    expect(result.stopReason).toBe('toolUse');
    expect(result.content).toEqual([
      { type: 'thinking', thinkingText: 'thinking' },
      {
        type: 'toolCall',
        toolCallId: 'tool-1',
        name: 'search',
        arguments: { query: 'docs' },
      },
    ]);
    expect(result.message.content).toEqual([
      { reasoningContent: { reasoningText: { text: 'thinking', signature: 'sig' } } },
      {
        toolUse: {
          toolUseId: 'tool-1',
          name: 'search',
          input: { query: 'docs' },
        },
      },
    ]);
  });

  it('surfaces retryable Bedrock stream exceptions', async () => {
    const error = new Error('Rate exceeded');
    error.name = 'ThrottlingException';
    mockBedrockClient([{ throttlingException: error }]);

    const stream = streamAwsBedrock(model, context, options, 'bedrock-msg-3');

    try {
      await stream.drain();
      expect.unreachable('Expected stream.drain() to throw');
    } catch (caught) {
      expect(caught).toBeInstanceOf(AssistantStreamError);
      expect(caught).toMatchObject({
        name: 'AssistantStreamError',
        message: 'Rate exceeded',
        canRetry: true,
      });
    }
  });

  it('surfaces thrown SDK errors', async () => {
    const error = new Error('Quota exceeded');
    error.name = 'ThrottlingException';
    mockBedrockClient([], error);

    const stream = streamAwsBedrock(model, context, options, 'bedrock-msg-4');

    try {
      await stream.drain();
      expect.unreachable('Expected stream.drain() to throw');
    } catch (caught) {
      expect(caught).toBeInstanceOf(AssistantStreamError);
      expect(caught).toMatchObject({
        message: 'Quota exceeded',
        canRetry: true,
      });
    }
  });

  it('marks aborted requests as aborted', async () => {
    mockBedrockClient([]);
    const controller = new AbortController();
    controller.abort();

    const stream = streamAwsBedrock(
      model,
      context,
      { ...options, signal: controller.signal },
      'bedrock-msg-5'
    );

    try {
      await stream.drain();
      expect.unreachable('Expected stream.drain() to throw');
    } catch (caught) {
      expect(caught).toBeInstanceOf(AssistantStreamError);
      expect(caught).toMatchObject({
        stopReason: 'aborted',
      });
    }
  });

  it('turns malformed model output stops into error responses', async () => {
    mockBedrockClient([
      { messageStart: { role: 'assistant' } },
      { messageStop: { stopReason: 'malformed_model_output' } },
    ]);

    const stream = streamAwsBedrock(model, context, options, 'bedrock-msg-6');

    try {
      await stream.drain();
      expect.unreachable('Expected stream.drain() to throw');
    } catch (caught) {
      expect(caught).toBeInstanceOf(AssistantStreamError);
      expect(caught).toMatchObject({
        stopReason: 'error',
      });
    }
  });
});
