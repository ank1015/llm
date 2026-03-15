/**
 * Integration tests for SDK complete function
 *
 * These tests make real API calls. Run with API keys set in environment:
 * - ANTHROPIC_API_KEY
 * - OPENAI_API_KEY
 */

import { describe, it, expect } from 'vitest';

import { complete, getModel } from '../../src/index.js';

import type { Context } from '@ank1015/llm-types';

describe('complete integration', () => {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  const openaiApiKey = process.env['OPENAI_API_KEY'];
  const openaiModel = getModel('openai', 'gpt-5-nano');

  describe('with apiKey in providerOptions', () => {
    it.skipIf(!anthropicApiKey)(
      'should complete with Anthropic',
      async () => {
        const model = getModel('anthropic', 'claude-haiku-4-5');
        expect(model).toBeDefined();

        const context: Context = {
          messages: [
            {
              role: 'user',
              id: 'test-msg-1',
              content: [{ type: 'text', content: "Say 'hello' and nothing else." }],
            },
          ],
        };

        const response = await complete(model!, context, {
          providerOptions: {
            apiKey: anthropicApiKey,
            max_tokens: 100,
          },
        });

        expect(response.api).toBe('anthropic');
        expect(response.stopReason).toBe('stop');
        expect(response.content.length).toBeGreaterThan(0);
        expect(response.usage.input).toBeGreaterThan(0);
        expect(response.usage.output).toBeGreaterThan(0);
      },
      30000
    );

    it.skipIf(!openaiApiKey || !openaiModel)(
      'should complete with OpenAI',
      async () => {
        const context: Context = {
          messages: [
            {
              role: 'user',
              id: 'test-msg-1',
              content: [{ type: 'text', content: "Say 'hello' and nothing else." }],
            },
          ],
        };

        const response = await complete(openaiModel!, context, {
          providerOptions: { apiKey: openaiApiKey },
        });

        expect(response.api).toBe('openai');
        expect(response.stopReason).toBe('stop');
        expect(response.content.length).toBeGreaterThan(0);
        expect(response.usage.input).toBeGreaterThan(0);
        expect(response.usage.output).toBeGreaterThan(0);
      },
      30000
    );
  });

  describe('with system prompt', () => {
    it.skipIf(!anthropicApiKey)(
      'should include system prompt',
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
          systemPrompt: 'Your name is TestBot. Always introduce yourself by name.',
        };

        const response = await complete(model!, context, {
          providerOptions: {
            apiKey: anthropicApiKey,
            max_tokens: 200,
          },
        });

        expect(response.stopReason).toBe('stop');

        // The response should mention TestBot
        const responseText = response.content
          .filter((c) => c.type === 'response')
          .flatMap((c) => (c.type === 'response' ? c.content : []))
          .filter((t) => t.type === 'text')
          .map((t) => (t as { type: 'text'; content: string }).content)
          .join('');

        expect(responseText.toLowerCase()).toContain('testbot');
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

      await expect(complete(model!, context)).rejects.toThrow(/API key not found/);
    });
  });
});
