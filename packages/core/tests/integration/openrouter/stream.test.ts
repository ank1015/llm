import { Type } from '@sinclair/typebox';
import { beforeAll, describe, expect, it } from 'vitest';

import { getModel } from '../../../src/models.js';
import { streamOpenRouter } from '../../../src/providers/openrouter/stream.js';

import type { BaseAssistantEvent, Context, Model } from '@ank1015/llm-types';

describe('OpenRouter Stream Integration', () => {
  let model: Model<'openrouter'>;
  const apiKey = process.env.OPENROUTER_API_KEY;

  beforeAll(() => {
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required for integration tests');
    }

    const testModel = getModel('openrouter', 'openai/gpt-4o');
    if (!testModel) {
      throw new Error('Test model openai/gpt-4o not found');
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

      const stream = streamOpenRouter(model, context, { apiKey }, 'test-msg-1');

      const events: BaseAssistantEvent<'openrouter'>[] = [];
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

      const stream = streamOpenRouter(model, context, { apiKey }, 'test-msg-2');

      const events: BaseAssistantEvent<'openrouter'>[] = [];
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

      const stream = streamOpenRouter(model, context, { apiKey }, 'test-msg-3');

      const deltas: string[] = [];
      for await (const event of stream) {
        if (event.type === 'text_delta') {
          deltas.push(event.delta);
        }
      }

      expect(deltas.length).toBeGreaterThan(0);
      expect(deltas.every((d) => typeof d === 'string')).toBe(true);
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

      const stream = streamOpenRouter(model, context, { apiKey }, 'test-msg-5');

      const events: BaseAssistantEvent<'openrouter'>[] = [];
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

      const stream = streamOpenRouter(model, context, { apiKey }, 'test-msg-6');

      for await (const _ of stream) {
        // Just consume
      }

      const result = await stream.result();

      expect(result.role).toBe('assistant');
      expect(result.id).toBe('test-msg-6');
      expect(result.api).toBe('openrouter');
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

      const stream = streamOpenRouter(model, context, { apiKey }, 'test-msg-7');

      for await (const _ of stream) {
        // Just consume
      }

      const result = await stream.result();

      expect(result.usage.input).toBeGreaterThanOrEqual(0);
      expect(result.usage.output).toBeGreaterThan(0);
      expect(result.usage.totalTokens).toBeGreaterThan(0);
      expect(result.usage.cost.total).toBeGreaterThanOrEqual(0);
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

      const stream = streamOpenRouter(model, context, { apiKey }, 'test-msg-9');

      const events: BaseAssistantEvent<'openrouter'>[] = [];
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

      const stream = streamOpenRouter(
        model,
        context,
        { apiKey: 'invalid-key-12345' },
        'test-msg-16'
      );

      const events: BaseAssistantEvent<'openrouter'>[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
    }, 30000);
  });

  describe('system prompt handling', () => {
    it('should handle system prompt in streaming', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'What is your role?' }],
          },
        ],
        systemPrompt: 'You are a helpful assistant.',
      };

      const stream = streamOpenRouter(model, context, { apiKey }, 'test-msg-20');

      for await (const _ of stream) {
        // Consume
      }

      const result = await stream.result();
      expect(result.stopReason).toBe('stop');
    }, 30000);
  });

  describe('native message format', () => {
    it('should include ChatCompletion in final result message', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Say "test"' }],
          },
        ],
      };

      const stream = streamOpenRouter(model, context, { apiKey }, 'test-msg-21');

      for await (const _ of stream) {
        // Consume
      }

      const result = await stream.result();

      expect(result.message).toBeDefined();
      expect(result.message).toHaveProperty('id');
      expect(result.message).toHaveProperty('choices');
      expect(result.message).toHaveProperty('model');
      expect(result.message).toHaveProperty('usage');
    }, 30000);
  });
});
