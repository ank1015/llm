import fs from 'node:fs';
import path from 'node:path';

import { Type } from '@sinclair/typebox';
import { beforeAll, describe, expect, it } from 'vitest';

import { complete } from '../../../src/llm/complete.js';
import { getModel } from '../../../src/models/index.js';

import type { CodexProviderOptions, Context, Model } from '@ank1015/llm-types';

const CODEX_HOME = path.join(process.env.HOME || '', '.codex');
const auth = JSON.parse(fs.readFileSync(path.join(CODEX_HOME, 'auth.json'), 'utf-8'));

const accessToken = auth.tokens.access_token;
const accountId = auth.tokens.account_id;

describe('Codex Complete Integration', () => {
  let model: Model<'codex'>;
  const apiKey = accessToken;
  const chatgptAccountId = accountId;

  function getOptions(
    extra?: Omit<Partial<CodexProviderOptions>, 'apiKey' | 'chatgpt-account-id'>
  ): CodexProviderOptions {
    return {
      apiKey: apiKey!,
      'chatgpt-account-id': chatgptAccountId!,
      instructions: 'You are a helpful coding assistant. Be concise.',
      ...extra,
    };
  }

  beforeAll(() => {
    if (!apiKey || !chatgptAccountId) {
      throw new Error(
        'CODEX_API_KEY and CODEX_CHATGPT_ACCOUNT_ID environment variables are required for integration tests'
      );
    }

    const testModel = getModel('codex', 'gpt-5.3-codex');
    if (!testModel) {
      throw new Error('Test model gpt-5.3-codex not found');
    }
    model = testModel;
  });

  describe('basic completion', () => {
    it('should return valid BaseAssistantMessage', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'codex-complete-1',
            content: [{ type: 'text', content: 'Reply with hello.' }],
          },
        ],
      };

      const result = await complete(model, context, getOptions(), 'codex-complete-msg-1');

      expect(result.role).toBe('assistant');
      expect(result.id).toBe('codex-complete-msg-1');
      expect(result.api).toBe('codex');
      expect(result.model.id).toBe('gpt-5.3-codex');
      expect(result.message).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.stopReason).toBeDefined();
    }, 45000);

    it('should include usage and cost', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'codex-complete-2',
            content: [{ type: 'text', content: 'Count from 1 to 3.' }],
          },
        ],
      };

      const result = await complete(model, context, getOptions(), 'codex-complete-msg-2');

      expect(result.usage.input).toBeGreaterThan(0);
      expect(result.usage.output).toBeGreaterThan(0);
      expect(result.usage.totalTokens).toBeGreaterThan(0);
      expect(result.usage.cost.total).toBeGreaterThan(0);
    }, 45000);

    it('should handle system prompts', async () => {
      const context: Context = {
        systemPrompt: 'You are a terse assistant.',
        messages: [
          {
            role: 'user',
            id: 'codex-complete-3',
            content: [{ type: 'text', content: 'What is your role?' }],
          },
        ],
      };

      const result = await complete(model, context, getOptions(), 'codex-complete-msg-3');
      expect(['stop', 'toolUse']).toContain(result.stopReason);
    }, 45000);
  });

  describe('codex constraints', () => {
    it('should succeed even when caller passes invalid stream/store values', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'codex-complete-4',
            content: [{ type: 'text', content: 'Say ok.' }],
          },
        ],
      };

      const forcedInvalid = {
        ...getOptions(),
        stream: false,
        store: true,
      } as unknown as CodexProviderOptions;

      const result = await complete(model, context, forcedInvalid, 'codex-complete-msg-4');
      expect(result.stopReason).not.toBe('error');
      expect(result.content.length).toBeGreaterThan(0);
    }, 45000);

    it('should reject when chatgpt-account-id is missing', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'codex-complete-5',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
      };

      await expect(
        complete(
          model,
          context,
          {
            apiKey: apiKey!,
            'chatgpt-account-id': '',
            instructions: 'You are a helpful coding assistant. Be concise.',
          },
          'codex-complete-msg-5'
        )
      ).rejects.toThrow('chatgpt-account-id');
    }, 10000);
  });

  describe('tool calling', () => {
    it('should produce tool calls with provided tool schema', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'codex-complete-6',
            content: [
              {
                type: 'text',
                content: 'Use get_weather tool for Paris. Do not answer without tool use.',
              },
            ],
          },
        ],
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather for a location',
            parameters: Type.Object({
              location: Type.String({ minLength: 1 }),
            }),
          },
        ],
      };

      const result = await complete(model, context, getOptions(), 'codex-complete-msg-6');
      const toolCall = result.content.find((c) => c.type === 'toolCall');

      expect(result.stopReason).toBe('toolUse');
      expect(toolCall).toBeDefined();
      if (toolCall && toolCall.type === 'toolCall') {
        expect(toolCall.name).toBe('get_weather');
        expect(toolCall.arguments.location).toBeDefined();
      }
    }, 60000);
  });

  describe('error handling', () => {
    it('should reject on invalid API key', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'codex-complete-7',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
      };

      await expect(
        complete(
          model,
          context,
          {
            apiKey: 'invalid-key-12345',
            'chatgpt-account-id': chatgptAccountId!,
            instructions: 'You are a helpful coding assistant. Be concise.',
          },
          'codex-complete-msg-7'
        )
      ).rejects.toThrow();
    }, 45000);

    it('should reject on abort signal', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'codex-complete-8',
            content: [{ type: 'text', content: 'Write a long essay about space exploration.' }],
          },
        ],
      };

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10);

      await expect(
        complete(
          model,
          context,
          {
            ...getOptions(),
            signal: controller.signal,
          },
          'codex-complete-msg-8'
        )
      ).rejects.toThrow();
    }, 45000);
  });
});
