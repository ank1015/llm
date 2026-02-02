/**
 * Integration tests for SDK stream function
 *
 * These tests make real API calls. Run with API keys set in environment:
 * - ANTHROPIC_API_KEY
 * - OPENAI_API_KEY
 */

import { describe, it, expect } from 'vitest';

import { stream, getModel } from '../../src/index.js';

import type { Context, BaseAssistantEvent } from '@ank1015/llm-types';

describe('stream integration', () => {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  const openaiApiKey = process.env['OPENAI_API_KEY'];

  describe('with apiKey in providerOptions', () => {
    it.skipIf(!anthropicApiKey)(
      'should stream with Anthropic',
      async () => {
        const model = getModel('anthropic', 'claude-haiku-4-5');
        expect(model).toBeDefined();

        const context: Context = {
          messages: [
            {
              role: 'user',
              id: 'test-msg-1',
              content: [{ type: 'text', content: 'Count from 1 to 3.' }],
            },
          ],
        };

        const eventStream = await stream(model!, context, {
          providerOptions: {
            apiKey: anthropicApiKey,
            max_tokens: 100,
          },
        });

        const events: BaseAssistantEvent<'anthropic'>[] = [];
        for await (const event of eventStream) {
          events.push(event);
        }

        const response = await eventStream.result();

        expect(events.length).toBeGreaterThan(0);
        expect(events.some((e) => e.type === 'text_delta')).toBe(true);
        expect(response.api).toBe('anthropic');
        expect(response.stopReason).toBe('stop');
        expect(response.usage.input).toBeGreaterThan(0);
        expect(response.usage.output).toBeGreaterThan(0);
      },
      30000
    );

    it.skipIf(!openaiApiKey)(
      'should stream with OpenAI',
      async () => {
        const model = getModel('openai', 'gpt-5.2');
        expect(model).toBeDefined();

        const context: Context = {
          messages: [
            {
              role: 'user',
              id: 'test-msg-1',
              content: [{ type: 'text', content: 'Count from 1 to 3.' }],
            },
          ],
        };

        const eventStream = await stream(model!, context, {
          providerOptions: { apiKey: openaiApiKey },
        });

        const events: BaseAssistantEvent<'openai'>[] = [];
        for await (const event of eventStream) {
          events.push(event);
        }

        const response = await eventStream.result();

        expect(events.length).toBeGreaterThan(0);
        expect(events.some((e) => e.type === 'text_delta')).toBe(true);
        expect(response.api).toBe('openai');
        expect(response.stopReason).toBe('stop');
      },
      30000
    );
  });

  describe('text accumulation', () => {
    it.skipIf(!anthropicApiKey)(
      'should accumulate text deltas correctly',
      async () => {
        const model = getModel('anthropic', 'claude-haiku-4-5');
        expect(model).toBeDefined();

        const context: Context = {
          messages: [
            {
              role: 'user',
              id: 'test-msg-1',
              content: [{ type: 'text', content: "Say 'hello world' and nothing else." }],
            },
          ],
        };

        const eventStream = await stream(model!, context, {
          providerOptions: {
            apiKey: anthropicApiKey,
            max_tokens: 50,
          },
        });

        let accumulatedText = '';
        for await (const event of eventStream) {
          if (event.type === 'text_delta') {
            accumulatedText += event.delta;
          }
        }

        const response = await eventStream.result();

        expect(accumulatedText.toLowerCase()).toContain('hello');
        expect(response.content.length).toBeGreaterThan(0);
      },
      30000
    );
  });

  describe('with system prompt', () => {
    it.skipIf(!anthropicApiKey)(
      'should include system prompt in streaming',
      async () => {
        const model = getModel('anthropic', 'claude-haiku-4-5');
        expect(model).toBeDefined();

        const context: Context = {
          messages: [
            {
              role: 'user',
              id: 'test-msg-1',
              content: [{ type: 'text', content: 'What is your name?' }],
            },
          ],
          systemPrompt: 'Your name is StreamBot. Always introduce yourself by name.',
        };

        const eventStream = await stream(model!, context, {
          providerOptions: {
            apiKey: anthropicApiKey,
            max_tokens: 100,
          },
        });

        let accumulatedText = '';
        for await (const event of eventStream) {
          if (event.type === 'text_delta') {
            accumulatedText += event.delta;
          }
        }

        await eventStream.result();

        expect(accumulatedText.toLowerCase()).toContain('streambot');
      },
      30000
    );
  });

  describe('error handling', () => {
    it('should throw ApiKeyNotFoundError when no key provided', async () => {
      const model = getModel('anthropic', 'claude-haiku-4-5');
      expect(model).toBeDefined();

      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'test-msg-1',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
      };

      await expect(stream(model!, context)).rejects.toThrow(/API key not found/);
    });
  });
});
