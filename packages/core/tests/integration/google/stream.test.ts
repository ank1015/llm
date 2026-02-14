import { Type } from '@sinclair/typebox';
import { beforeAll, describe, expect, it } from 'vitest';

import { getModel } from '../../../src/models/index.js';
import { streamGoogle } from '../../../src/providers/google/stream.js';

import type { BaseAssistantEvent, Context, Model } from '@ank1015/llm-types';

describe('Google Stream Integration', () => {
  let model: Model<'google'>;
  const apiKey = process.env.GEMINI_API_KEY;

  beforeAll(() => {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required for integration tests');
    }

    // Use a fast, cheap model for testing
    const testModel = getModel('google', 'gemini-3-flash-preview');
    if (!testModel) {
      throw new Error('Test model gemini-3-flash-preview not found');
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

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-1');

      const events: BaseAssistantEvent<'google'>[] = [];
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

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-2');

      const events: BaseAssistantEvent<'google'>[] = [];
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
            content: [{ type: 'text', content: 'Count from 1 to 5' }],
          },
        ],
      };

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-3');

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

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-4');

      let textEndEvent: BaseAssistantEvent<'google'> | undefined;
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

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-5');

      const events: BaseAssistantEvent<'google'>[] = [];
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

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-6');

      // Consume stream
      for await (const _ of stream) {
        // Just consume
      }

      const result = await stream.result();

      expect(result.role).toBe('assistant');
      expect(result.id).toBe('test-msg-6');
      expect(result.api).toBe('google');
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

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-7');

      // Consume stream
      for await (const _ of stream) {
        // Just consume
      }

      const result = await stream.result();

      expect(result.usage.input).toBeGreaterThan(0);
      expect(result.usage.output).toBeGreaterThan(0);
      expect(result.usage.totalTokens).toBeGreaterThan(0);
      expect(result.usage.cost.total).toBeGreaterThan(0);
    }, 30000);

    it('should be awaitable without consuming stream', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
      };

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-8');

      // Don't consume stream, just await result
      const result = await stream.result();

      expect(result.role).toBe('assistant');
      expect(result.content).toBeDefined();
    }, 30000);

    it('should include native Google response in message field', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Say "native test"' }],
          },
        ],
      };

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-native');

      for await (const _ of stream) {
        // Consume
      }

      const result = await stream.result();

      expect(result.message).toBeDefined();
      // Google response has candidates
      expect(result.message).toHaveProperty('candidates');
    }, 30000);
  });

  describe('tool call streaming', () => {
    it('should emit toolcall_start/end for function calls', async () => {
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

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-9');

      const events: BaseAssistantEvent<'google'>[] = [];
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

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-10');

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

    it('should include tool call in result content', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Calculate 5 + 3' }],
          },
        ],
        tools: [
          {
            name: 'calculate',
            description: 'Perform calculations',
            parameters: Type.Object({
              expression: Type.String(),
            }),
          },
        ],
      };

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-tool-content');

      for await (const _ of stream) {
        // Consume
      }

      const result = await stream.result();

      const toolCall = result.content.find((c) => c.type === 'toolCall');
      expect(toolCall).toBeDefined();
      if (toolCall && toolCall.type === 'toolCall') {
        expect(toolCall.name).toBe('calculate');
        expect(toolCall.arguments).toBeDefined();
      }
    }, 30000);
  });

  describe('abort handling', () => {
    it('should handle abort signal', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [
              { type: 'text', content: 'Tell me a very long story about space exploration' },
            ],
          },
        ],
      };

      const controller = new AbortController();
      const stream = streamGoogle(
        model,
        context,
        { apiKey, signal: controller.signal },
        'test-msg-11'
      );

      // Consume a few events then abort
      let eventCount = 0;
      try {
        for await (const event of stream) {
          eventCount++;
          if (eventCount > 2) {
            controller.abort();
          }
        }
      } catch (e) {
        // Expected to throw or stop
      }

      const result = await stream.result();
      expect(result.stopReason).toBe('aborted');
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

      const stream = streamGoogle(model, context, { apiKey: 'invalid-key-12345' }, 'test-msg-12');

      const events: BaseAssistantEvent<'google'>[] = [];
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

      const stream = streamGoogle(model, context, { apiKey: 'invalid-key-12345' }, 'test-msg-13');

      // Consume stream
      for await (const _ of stream) {
        // Just consume
      }

      const result = await stream.result();

      expect(result.stopReason).toBe('error');
      expect(result.errorMessage).toBeDefined();
      expect(result.usage.totalTokens).toBe(0);
    }, 30000);
  });

  describe('message updates', () => {
    it('should update message timestamp in events', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
      };

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-14');

      const events: BaseAssistantEvent<'google'>[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      // All events should have message with timestamp
      events.forEach((event) => {
        expect(event.message.timestamp).toBeDefined();
        expect(typeof event.message.timestamp).toBe('number');
      });
    }, 30000);

    it('should include contentIndex in delta events', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Say hello' }],
          },
        ],
      };

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-15');

      const events: BaseAssistantEvent<'google'>[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      const deltaEvents = events.filter(
        (e) => e.type === 'text_delta' || e.type === 'thinking_delta' || e.type === 'toolcall_delta'
      );

      if (deltaEvents.length > 0) {
        deltaEvents.forEach((event) => {
          if ('contentIndex' in event) {
            expect(typeof event.contentIndex).toBe('number');
            expect(event.contentIndex).toBeGreaterThanOrEqual(0);
          }
        });
      }
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

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-16');

      for await (const _ of stream) {
        // Consume
      }

      const result = await stream.result();
      expect(result.stopReason).toBe('stop');
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

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-usage');

      let doneEvent: BaseAssistantEvent<'google'> | undefined;
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

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-duration');

      for await (const _ of stream) {
        // Consume
      }

      const result = await stream.result();

      expect(result.duration).toBeDefined();
      expect(result.duration).toBeGreaterThan(0);
      expect(typeof result.duration).toBe('number');
    }, 30000);
  });

  describe('multi-turn conversation', () => {
    it('should handle multi-turn conversations', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'My name is Alice' }],
          },
          {
            role: 'assistant',
            id: 'test-2',
            api: 'google',
            content: [{ type: 'response', content: 'Hello Alice!' }],
            model: model,
            timestamp: Date.now(),
            duration: 100,
            stopReason: 'stop',
            usage: {
              input: 10,
              output: 5,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 15,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            message: {} as any,
          },
          {
            role: 'user',
            id: 'test-3',
            content: [{ type: 'text', content: 'What is my name?' }],
          },
        ],
      };

      const stream = streamGoogle(model, context, { apiKey }, 'test-msg-multi');

      for await (const _ of stream) {
        // Consume
      }

      const result = await stream.result();

      expect(result.stopReason).toBe('stop');
      // Response should mention Alice
      const textContent = result.content.find((c) => c.type === 'response');
      expect(textContent).toBeDefined();
    }, 30000);
  });
});
