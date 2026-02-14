import { Type } from '@sinclair/typebox';
import { beforeAll, describe, expect, it } from 'vitest';

import { getModel } from '../../../src/models/index.js';
import { streamMinimax } from '../../../src/providers/minimax/stream.js';

import type { BaseAssistantEvent, Context, Model } from '@ank1015/llm-types';

describe('MiniMax Stream Integration', () => {
  let model: Model<'minimax'>;
  const apiKey = process.env.MINIMAX_API_KEY;

  beforeAll(() => {
    if (!apiKey) {
      throw new Error('MINIMAX_API_KEY environment variable is required for integration tests');
    }

    const testModel = getModel('minimax', 'MiniMax-M2.5-highspeed');
    if (!testModel) {
      throw new Error('Test model MiniMax-M2.5-highspeed not found');
    }
    model = testModel;
  });

  describe('basic streaming', () => {
    it('should emit start event first', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Say "hello"' }],
          },
        ],
      };

      const stream = streamMinimax(model, context, { apiKey, max_tokens: 100 }, 'test-msg-1');

      const events: BaseAssistantEvent<'minimax'>[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('start');
    }, 30000);

    it('should emit text_start before text deltas', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Say "streaming test"' }],
          },
        ],
      };

      const stream = streamMinimax(model, context, { apiKey, max_tokens: 100 }, 'test-msg-2');

      const events: BaseAssistantEvent<'minimax'>[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      const textStartIndex = events.findIndex((e) => e.type === 'text_start');
      const firstTextDeltaIndex = events.findIndex((e) => e.type === 'text_delta');

      expect(textStartIndex).toBeGreaterThan(-1);
      if (firstTextDeltaIndex > -1) {
        expect(textStartIndex).toBeLessThan(firstTextDeltaIndex);
      }
    }, 30000);

    it('should emit text_delta with incremental text', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Count from 1 to 3' }],
          },
        ],
      };

      const stream = streamMinimax(model, context, { apiKey, max_tokens: 100 }, 'test-msg-3');

      const deltas: string[] = [];
      for await (const event of stream) {
        if (event.type === 'text_delta') {
          deltas.push(event.delta);
        }
      }

      expect(deltas.length).toBeGreaterThan(0);
      expect(deltas.every((d) => typeof d === 'string')).toBe(true);
    }, 30000);

    it('should emit text_end with complete content', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Say "complete"' }],
          },
        ],
      };

      const stream = streamMinimax(model, context, { apiKey, max_tokens: 100 }, 'test-msg-4');

      let textEndEvent: BaseAssistantEvent<'minimax'> | undefined;
      for await (const event of stream) {
        if (event.type === 'text_end') {
          textEndEvent = event;
        }
      }

      expect(textEndEvent).toBeDefined();
      if (textEndEvent && textEndEvent.type === 'text_end') {
        expect(textEndEvent.content).toBeDefined();
        expect(Array.isArray(textEndEvent.content)).toBe(true);
      }
    }, 30000);

    it('should emit done event at the end', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Hi' }],
          },
        ],
      };

      const stream = streamMinimax(model, context, { apiKey, max_tokens: 100 }, 'test-msg-5');

      const events: BaseAssistantEvent<'minimax'>[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      const lastEvent = events[events.length - 1];
      expect(lastEvent.type).toBe('done');
      if (lastEvent.type === 'done') {
        expect(lastEvent.reason).toBeDefined();
      }
    }, 30000);
  });

  describe('result() promise', () => {
    it('should return complete BaseAssistantMessage', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Say "result test"' }],
          },
        ],
      };

      const stream = streamMinimax(model, context, { apiKey, max_tokens: 100 }, 'test-msg-6');

      for await (const _ of stream) {
        // Just consume
      }

      const result = await stream.result();

      expect(result.role).toBe('assistant');
      expect(result.id).toBe('test-msg-6');
      expect(result.api).toBe('minimax');
      expect(result.model).toBe(model);
      expect(result.stopReason).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.message).toBeDefined();
      expect(result.usage).toBeDefined();
    }, 30000);

    it('should calculate usage in final result', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Count from 1 to 5' }],
          },
        ],
      };

      const stream = streamMinimax(model, context, { apiKey, max_tokens: 100 }, 'test-msg-7');

      for await (const _ of stream) {
        // Just consume
      }

      const result = await stream.result();

      expect(result.usage.input).toBeGreaterThan(0);
      expect(result.usage.output).toBeGreaterThan(0);
      expect(result.usage.totalTokens).toBeGreaterThan(0);
      expect(result.usage.cost.total).toBeGreaterThan(0);
    }, 30000);

    it('should populate message.content with native content blocks', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Say "native content test"' }],
          },
        ],
      };

      const stream = streamMinimax(model, context, { apiKey, max_tokens: 100 }, 'test-msg-native');

      for await (const _ of stream) {
        // Consume
      }

      const result = await stream.result();

      expect(result.message).toBeDefined();
      expect(result.message.content).toBeDefined();
      expect(Array.isArray(result.message.content)).toBe(true);
      expect(result.message.content.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('tool call streaming', () => {
    it('should emit toolcall_start/delta/end for function calls', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'What is the weather in Tokyo?' }],
          },
        ],
        tools: [
          {
            name: 'get_weather',
            description: 'Get the current weather',
            parameters: Type.Object({
              location: Type.String(),
              unit: Type.Optional(
                Type.Union([Type.Literal('celsius'), Type.Literal('fahrenheit')])
              ),
            }),
          },
        ],
      };

      const stream = streamMinimax(model, context, { apiKey, max_tokens: 500 }, 'test-msg-9');

      const events: BaseAssistantEvent<'minimax'>[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      const toolcallStart = events.find((e) => e.type === 'toolcall_start');
      const toolcallEnd = events.find((e) => e.type === 'toolcall_end');

      expect(toolcallStart).toBeDefined();
      expect(toolcallEnd).toBeDefined();

      if (toolcallEnd && toolcallEnd.type === 'toolcall_end') {
        expect(toolcallEnd.toolCall).toBeDefined();
        expect(toolcallEnd.toolCall.name).toBe('get_weather');
        expect(toolcallEnd.toolCall.arguments).toBeDefined();
        expect(toolcallEnd.toolCall.toolCallId).toBeDefined();
      }
    }, 30000);

    it('should return toolUse stop reason when tool is called', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Get weather for Paris' }],
          },
        ],
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather',
            parameters: Type.Object({
              location: Type.String({ minLength: 1 }),
            }),
          },
        ],
      };

      const stream = streamMinimax(model, context, { apiKey, max_tokens: 500 }, 'test-msg-11');

      for await (const _ of stream) {
        // Consume
      }

      const result = await stream.result();

      expect(result.stopReason).toBe('toolUse');
      const toolCall = result.content.find((c) => c.type === 'toolCall');
      expect(toolCall).toBeDefined();
      if (toolCall && toolCall.type === 'toolCall') {
        expect(toolCall.arguments.location).toBeDefined();
        expect(typeof toolCall.arguments.location).toBe('string');
      }
    }, 30000);
  });

  describe('error handling', () => {
    it('should emit error event on API error', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
      };

      const stream = streamMinimax(
        model,
        context,
        { apiKey: 'invalid-key-12345', max_tokens: 100 },
        'test-msg-14'
      );

      const events: BaseAssistantEvent<'minimax'>[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
    }, 30000);

    it('should return error result on API error', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
      };

      const stream = streamMinimax(
        model,
        context,
        { apiKey: 'invalid-key-12345', max_tokens: 100 },
        'test-msg-15'
      );

      for await (const _ of stream) {
        // Just consume
      }

      const result = await stream.result();

      expect(result.stopReason).toBe('error');
      expect(result.errorMessage).toBeDefined();
      expect(result.usage.totalTokens).toBe(0);
    }, 30000);
  });

  describe('usage tracking during stream', () => {
    it('should have usage data in done event', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
      };

      const stream = streamMinimax(model, context, { apiKey, max_tokens: 100 }, 'test-msg-usage');

      let doneEvent: BaseAssistantEvent<'minimax'> | undefined;
      for await (const event of stream) {
        if (event.type === 'done') {
          doneEvent = event;
        }
      }

      expect(doneEvent).toBeDefined();
      if (doneEvent && doneEvent.type === 'done') {
        expect(doneEvent.message.usage.input).toBeGreaterThan(0);
        expect(doneEvent.message.usage.output).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe('duration tracking', () => {
    it('should calculate duration in final result', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
      };

      const stream = streamMinimax(
        model,
        context,
        { apiKey, max_tokens: 100 },
        'test-msg-duration'
      );

      for await (const _ of stream) {
        // Consume
      }

      const result = await stream.result();

      expect(result.duration).toBeDefined();
      expect(result.duration).toBeGreaterThan(0);
      expect(typeof result.duration).toBe('number');
    }, 30000);
  });
});
