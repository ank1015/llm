/**
 * Integration tests for SDK stream function
 *
 * These tests make real API calls. Run with:
 * - ANTHROPIC_API_KEY set for direct API tests
 * - Server running on localhost:3001 with API keys configured for server tests
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { stream, getModel, setServerUrl } from '../../src/index.js';

import type { Context, BaseAssistantEvent } from '@ank1015/llm-types';

describe('stream integration', () => {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  const openaiApiKey = process.env['OPENAI_API_KEY'];

  beforeAll(() => {
    setServerUrl('http://localhost:3001');
  });

  describe('direct API calls (with apiKey)', () => {
    it.skipIf(!anthropicApiKey)('should stream with Anthropic directly', async () => {
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

      const eventStream = stream(model!, context, { apiKey: anthropicApiKey, max_tokens: 1000 });

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
    });

    it.skipIf(!openaiApiKey)('should stream with OpenAI directly', async () => {
      const model = getModel('openai', 'gpt-5-nano');
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

      const eventStream = stream(model!, context, { apiKey: openaiApiKey });

      const events: BaseAssistantEvent<'openai'>[] = [];
      for await (const event of eventStream) {
        events.push(event);
      }

      const response = await eventStream.result();

      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === 'text_delta')).toBe(true);
      expect(response.api).toBe('openai');
      expect(response.stopReason).toBe('stop');
    });
  });

  describe('server routing (without apiKey)', () => {
    it('should stream via server with Anthropic', async () => {
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

      // No apiKey - should route through server
      const eventStream = stream(model!, context, { max_tokens: 1000 });

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
    });

    it('should stream via server with OpenAI', async () => {
      const model = getModel('openai', 'gpt-5-nano');
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

      // No apiKey - should route through server
      const eventStream = stream(model!, context);

      const events: BaseAssistantEvent<'openai'>[] = [];
      for await (const event of eventStream) {
        events.push(event);
      }

      const response = await eventStream.result();

      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === 'text_delta')).toBe(true);
      expect(response.api).toBe('openai');
      expect(response.stopReason).toBe('stop');
    });

    it('should accumulate text deltas correctly', async () => {
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

      const eventStream = stream(model!, context, { max_tokens: 1000 });

      let accumulatedText = '';
      for await (const event of eventStream) {
        if (event.type === 'text_delta') {
          accumulatedText += event.delta;
        }
      }

      const response = await eventStream.result();

      expect(accumulatedText.toLowerCase()).toContain('hello');
      expect(response.content.length).toBeGreaterThan(0);
    });

    it('should include system prompt in streaming', async () => {
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

      const eventStream = stream(model!, context, { max_tokens: 1000 });

      let accumulatedText = '';
      for await (const event of eventStream) {
        if (event.type === 'text_delta') {
          accumulatedText += event.delta;
        }
      }

      await eventStream.result();

      expect(accumulatedText.toLowerCase()).toContain('streambot');
    });
  });
});
