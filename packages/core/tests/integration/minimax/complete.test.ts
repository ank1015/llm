import { Type } from '@sinclair/typebox';
import { beforeAll, describe, expect, it } from 'vitest';

import { complete } from '../../../src/llm/complete.js';
import { getModel } from '../../../src/models/index.js';

import type { Context, Model } from '@ank1015/llm-types';

describe('MiniMax Complete Integration', () => {
  let model: Model<'minimax'>;
  const apiKey = process.env.MINIMAX_API_KEY;
  const testModelId = 'MiniMax-M2.7' as const;

  beforeAll(() => {
    if (!apiKey) {
      throw new Error('MINIMAX_API_KEY environment variable is required for integration tests');
    }
    const testModel = getModel('minimax', testModelId);
    if (!testModel) {
      throw new Error(`Test model ${testModelId} not found`);
    }
    model = testModel;
  });

  describe('basic completion', () => {
    it('should return valid BaseAssistantMessage', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Say "hello" and nothing else.' }],
          },
        ],
      };

      const result = await complete(model, context, { apiKey, max_tokens: 2000 }, 'test-msg-1');
      expect(result.role).toBe('assistant');
      expect(result.id).toBe('test-msg-1');
      expect(result.api).toBe('minimax');
      expect(result.model).toBe(model);
      expect(result.stopReason).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.message).toBeDefined();
    }, 30000);

    it('should include native Message in message field', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Reply with just "test"' }],
          },
        ],
      };

      const result = await complete(model, context, { apiKey, max_tokens: 2000 }, 'test-msg-2');

      expect(result.message).toBeDefined();
      expect(result.message).toHaveProperty('id');
      expect(result.message).toHaveProperty('content');
      expect(result.message).toHaveProperty('role');
      expect(result.message.role).toBe('assistant');
      expect(result.message).toHaveProperty('stop_reason');
      expect(result.message).toHaveProperty('usage');
    }, 30000);

    it('should calculate duration correctly', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Hi' }],
          },
        ],
      };

      const result = await complete(model, context, { apiKey, max_tokens: 2000 }, 'test-msg-3');

      expect(result.duration).toBeGreaterThan(0);
      expect(typeof result.duration).toBe('number');
    }, 30000);

    it('should return text content', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Say "integration test passed"' }],
          },
        ],
      };

      const result = await complete(model, context, { apiKey, max_tokens: 2000 }, 'test-msg-4');

      expect(result.content.length).toBeGreaterThan(0);
      const textContent = result.content.find((c) => c.type === 'response');
      expect(textContent).toBeDefined();
    }, 30000);

    it('should handle system prompt', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'What is your role?' }],
          },
        ],
        systemPrompt: 'You are a helpful math tutor.',
      };

      const result = await complete(model, context, { apiKey, max_tokens: 2000 }, 'test-msg-5');

      expect(result.stopReason).toBe('stop');
      expect(result.content.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('usage tracking', () => {
    it('should track token usage', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Count from 1 to 5' }],
          },
        ],
      };

      const result = await complete(model, context, { apiKey, max_tokens: 2000 }, 'test-msg-6');

      expect(result.usage).toBeDefined();
      expect(result.usage.input).toBeGreaterThan(0);
      expect(result.usage.output).toBeGreaterThan(0);
      expect(result.usage.totalTokens).toBeGreaterThan(0);
      expect(result.usage.totalTokens).toBe(
        result.usage.input + result.usage.output + result.usage.cacheRead + result.usage.cacheWrite
      );
    }, 30000);

    it('should calculate cost', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
      };

      const result = await complete(model, context, { apiKey, max_tokens: 2000 }, 'test-msg-7');

      expect(result.usage.cost).toBeDefined();
      expect(result.usage.cost.total).toBeGreaterThan(0);
      expect(result.usage.cost.input).toBeGreaterThanOrEqual(0);
      expect(result.usage.cost.output).toBeGreaterThanOrEqual(0);
    }, 30000);
  });

  describe('tool calling', () => {
    it('should execute and return tool calls', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'What is the weather in San Francisco?' }],
          },
        ],
        tools: [
          {
            name: 'get_weather',
            description: 'Get the current weather for a location',
            parameters: Type.Object({
              location: Type.String({ description: 'City name' }),
              unit: Type.Optional(
                Type.Union([Type.Literal('celsius'), Type.Literal('fahrenheit')])
              ),
            }),
          },
        ],
      };

      const result = await complete(model, context, { apiKey, max_tokens: 2000 }, 'test-msg-9');

      expect(result.stopReason).toBe('toolUse');
      const toolCall = result.content.find((c) => c.type === 'toolCall');
      expect(toolCall).toBeDefined();
      if (toolCall && toolCall.type === 'toolCall') {
        expect(toolCall.name).toBe('get_weather');
        expect(toolCall.arguments).toBeDefined();
        expect(toolCall.toolCallId).toBeDefined();
      }
    }, 30000);

    it('should handle tool results in conversation', async () => {
      const context1: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'What is the weather in London right now?' }],
          },
        ],
        tools: [
          {
            name: 'get_weather',
            description: 'Get the current weather for a location',
            parameters: Type.Object({
              location: Type.String({ description: 'City name' }),
            }),
          },
        ],
      };

      const result1 = await complete(model, context1, { apiKey, max_tokens: 2000 }, 'test-msg-11a');

      const toolCall = result1.content.find((c) => c.type === 'toolCall');
      expect(toolCall).toBeDefined();

      if (toolCall && toolCall.type === 'toolCall') {
        const context2: Context = {
          messages: [
            {
              role: 'user',
              id: 'test-1',
              content: [{ type: 'text', content: 'What is the weather in London right now?' }],
            },
            result1,
            {
              role: 'toolResult',
              id: 'result-1',
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.name,
              content: [{ type: 'text', content: '12°C, cloudy with light rain' }],
              isError: false,
              timestamp: Date.now(),
            },
          ],
          tools: [
            {
              name: 'get_weather',
              description: 'Get the current weather for a location',
              parameters: Type.Object({
                location: Type.String({ description: 'City name' }),
              }),
            },
          ],
        };

        const result2 = await complete(
          model,
          context2,
          { apiKey, max_tokens: 2000 },
          'test-msg-11b'
        );

        expect(result2.stopReason).toBe('stop');
        expect(result2.content.length).toBeGreaterThan(0);
      }
    }, 60000);
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
      };

      await expect(
        complete(model, context, { apiKey: 'invalid-key-12345', max_tokens: 2000 }, 'test-msg-12')
      ).rejects.toThrow();
    }, 30000);

    it('should handle abort signal', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-1',
            content: [{ type: 'text', content: 'Tell me a very long story about dragons' }],
          },
        ],
      };

      const controller = new AbortController();

      setTimeout(() => controller.abort(), 10);

      await expect(
        complete(
          model,
          context,
          { apiKey, signal: controller.signal, max_tokens: 2000 },
          'test-msg-13'
        )
      ).rejects.toThrow();
    }, 30000);
  });

  describe('cross-provider handoff', () => {
    it('should handle conversation with OpenAI assistant message in history', async () => {
      const openaiAssistantMessage = {
        role: 'assistant' as const,
        id: 'msg-openai-1',
        api: 'openai' as const,
        model: { id: 'gpt-4', api: 'openai' } as any,
        timestamp: Date.now(),
        duration: 100,
        stopReason: 'stop' as const,
        content: [
          {
            type: 'response' as const,
            content: [{ type: 'text' as const, content: 'I am GPT-4. The answer is 42.' }],
          },
        ],
        usage: {
          input: 10,
          output: 20,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 30,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        message: {} as any,
      };

      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'msg-1',
            content: [{ type: 'text', content: 'What is the meaning of life?' }],
          },
          openaiAssistantMessage,
          {
            role: 'user',
            id: 'msg-2',
            content: [{ type: 'text', content: 'What number did you just mention?' }],
          },
        ],
      };

      const result = await complete(model, context, { apiKey, max_tokens: 2000 }, 'test-handoff-1');

      expect(result.stopReason).toBe('stop');
      expect(result.content.length).toBeGreaterThan(0);
      const textContent = result.content.find((c) => c.type === 'response');
      expect(textContent).toBeDefined();
    }, 30000);
  });
});
