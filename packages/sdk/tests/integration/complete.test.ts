/**
 * Integration tests for SDK complete function
 *
 * These tests make real API calls. Run with:
 * - ANTHROPIC_API_KEY set for direct API tests
 * - Server running on localhost:3001 with API keys configured for server tests
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { complete, getModel, setServerUrl } from '../../src/index.js';

import type { AnthropicProviderOptions, Context } from '@ank1015/llm-types';

describe('complete integration', () => {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  const openaiApiKey = process.env['OPENAI_API_KEY'];

  beforeAll(() => {
    setServerUrl('http://localhost:3001');
  });

  describe('direct API calls (with apiKey)', () => {
    it.skipIf(!anthropicApiKey)('should complete with Anthropic directly', async () => {
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
        apiKey: anthropicApiKey,
        max_tokens: 1000,
      });

      expect(response.api).toBe('anthropic');
      expect(response.stopReason).toBe('stop');
      expect(response.content.length).toBeGreaterThan(0);
      expect(response.usage.input).toBeGreaterThan(0);
      expect(response.usage.output).toBeGreaterThan(0);
    });

    it.skipIf(!openaiApiKey)('should complete with OpenAI directly', async () => {
      const model = getModel('openai', 'gpt-5-nano');
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

      const response = await complete(model!, context, { apiKey: openaiApiKey });

      expect(response.api).toBe('openai');
      expect(response.stopReason).toBe('stop');
      expect(response.content.length).toBeGreaterThan(0);
      expect(response.usage.input).toBeGreaterThan(0);
      expect(response.usage.output).toBeGreaterThan(0);
    });
  });

  describe('server routing (without apiKey)', () => {
    it('should complete via server with Anthropic', async () => {
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

      // No apiKey - should route through server
      const response = await complete(model!, context, {
        max_tokens: 1000,
      } as AnthropicProviderOptions);

      expect(response.api).toBe('anthropic');
      expect(response.stopReason).toBe('stop');
      expect(response.content.length).toBeGreaterThan(0);
      expect(response.usage.input).toBeGreaterThan(0);
      expect(response.usage.output).toBeGreaterThan(0);
    });

    it('should complete via server with OpenAI', async () => {
      const model = getModel('openai', 'gpt-5-nano');
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

      // No apiKey - should route through server
      const response = await complete(model!, context);
      console.log(response);

      expect(response.api).toBe('openai');
      expect(response.stopReason).toBe('stop');
      expect(response.content.length).toBeGreaterThan(0);
      expect(response.usage.input).toBeGreaterThan(0);
      expect(response.usage.output).toBeGreaterThan(0);
    });

    it('should include system prompt', async () => {
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
        max_tokens: 1000,
      } as AnthropicProviderOptions);

      expect(response.stopReason).toBe('stop');
      // The response should mention TestBot
      const responseText = response.content
        .filter((c) => c.type === 'response')
        .map((c) => {
          if (c.type === 'response') {
            return c.content
              .filter((t) => t.type === 'text')
              .map((t) => (t as { type: 'text'; content: string }).content)
              .join('');
          }
          return '';
        })
        .join('');
      expect(responseText.toLowerCase()).toContain('testbot');
    });
  });
});
