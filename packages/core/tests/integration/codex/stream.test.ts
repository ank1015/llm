import fs from 'node:fs';
import path from 'node:path';

import { Type } from '@sinclair/typebox';
import { beforeAll, describe, expect, it } from 'vitest';

import { getModel } from '../../../src/models/index.js';
import { streamCodex } from '../../../src/providers/codex/stream.js';
import { describeIfAvailable } from '../helpers/live.js';

import type { BaseAssistantEvent, CodexProviderOptions, Context, Model } from '../../../src/types/index.js';

const CODEX_HOME = path.join(process.env.HOME || '', '.codex');
const CODEX_AUTH_PATH = path.join(CODEX_HOME, 'auth.json');
const auth = fs.existsSync(CODEX_AUTH_PATH)
  ? JSON.parse(fs.readFileSync(CODEX_AUTH_PATH, 'utf-8'))
  : null;

const accessToken = auth?.tokens?.access_token as string | undefined;
const accountId = auth?.tokens?.account_id as string | undefined;
const describeIfCodex = describeIfAvailable(Boolean(accessToken && accountId));

describeIfCodex('Codex Stream Integration', () => {
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
    const testModel = getModel('codex', 'gpt-5.3-codex');
    if (!testModel) {
      throw new Error('Test model gpt-5.3-codex not found');
    }
    model = testModel;
  });

  describe('basic streaming', () => {
    it('should emit start then done events', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'codex-stream-1',
            content: [{ type: 'text', content: 'Say hello in one sentence.' }],
          },
        ],
      };

      const stream = streamCodex(model, context, getOptions(), 'codex-stream-msg-1');

      const events: BaseAssistantEvent<'codex'>[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events[0]?.type).toBe('start');
      expect(events[events.length - 1]?.type).toBe('done');
    }, 45000);

    it('should return a complete result payload', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'codex-stream-2',
            content: [{ type: 'text', content: 'Reply with the word test.' }],
          },
        ],
      };

      const stream = streamCodex(model, context, getOptions(), 'codex-stream-msg-2');
      for await (const _ of stream) {
        // consume
      }

      const result = await stream.result();

      expect(result.role).toBe('assistant');
      expect(result.api).toBe('codex');
      expect(result.model.id).toBe('gpt-5.3-codex');
      expect(result.id).toBe('codex-stream-msg-2');
      expect(result.message).toBeDefined();
      expect(result.stopReason).toBeDefined();
      expect(result.usage.totalTokens).toBeGreaterThan(0);
    }, 45000);

    it('should handle system prompts', async () => {
      const context: Context = {
        systemPrompt: 'You are a concise assistant.',
        messages: [
          {
            role: 'user',
            id: 'codex-stream-3',
            content: [{ type: 'text', content: 'What is your role?' }],
          },
        ],
      };

      const stream = streamCodex(model, context, getOptions(), 'codex-stream-msg-3');
      for await (const _ of stream) {
        // consume
      }

      const result = await stream.result();
      expect(['stop', 'toolUse']).toContain(result.stopReason);
    }, 45000);
  });

  describe('codex constraints', () => {
    it('should enforce stream/store requirements even if overridden in options', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'codex-stream-4',
            content: [{ type: 'text', content: 'Say ok.' }],
          },
        ],
      };

      const forcedInvalid = {
        ...getOptions(),
        stream: false,
        store: true,
      } as unknown as CodexProviderOptions;

      const stream = streamCodex(model, context, forcedInvalid, 'codex-stream-msg-4');
      for await (const _ of stream) {
        // consume
      }

      const result = await stream.result();
      expect(['stop', 'toolUse']).toContain(result.stopReason);
      expect(result.stopReason).not.toBe('error');
    }, 45000);

    it('should return error when chatgpt-account-id is missing', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'codex-stream-5',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
      };

      const stream = streamCodex(
        model,
        context,
        {
          apiKey: apiKey!,
          'chatgpt-account-id': '',
          instructions: 'You are a helpful coding assistant. Be concise.',
        },
        'codex-stream-msg-5'
      );

      const events: BaseAssistantEvent<'codex'>[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();

      const result = await stream.result();
      expect(result.stopReason).toBe('error');
      expect(result.errorMessage).toContain('chatgpt-account-id');
    }, 10000);
  });

  describe('tool calling', () => {
    it('should emit tool call events for function calls', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'codex-stream-6',
            content: [
              {
                type: 'text',
                content: 'Call get_weather for Tokyo using the tool, do not answer directly.',
              },
            ],
          },
        ],
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather for a location',
            parameters: Type.Object({
              location: Type.String(),
            }),
          },
        ],
      };

      const stream = streamCodex(model, context, getOptions(), 'codex-stream-msg-6');

      const events: BaseAssistantEvent<'codex'>[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      const toolcallStart = events.find((e) => e.type === 'toolcall_start');
      const toolcallEnd = events.find((e) => e.type === 'toolcall_end');

      expect(toolcallStart).toBeDefined();
      expect(toolcallEnd).toBeDefined();

      if (toolcallEnd && toolcallEnd.type === 'toolcall_end') {
        expect(toolcallEnd.toolCall.name).toBe('get_weather');
        expect(toolcallEnd.toolCall.arguments).toBeDefined();
      }
    }, 60000);
  });

  describe('model coverage', () => {
    it('should support gpt-5.4-mini', async () => {
      const miniModel = getModel('codex', 'gpt-5.4-mini');
      if (!miniModel) {
        throw new Error('Test model gpt-5.4-mini not found');
      }

      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'codex-stream-mini-1',
            content: [{ type: 'text', content: 'Reply with mini ok.' }],
          },
        ],
      };

      const stream = streamCodex(miniModel, context, getOptions(), 'codex-stream-msg-mini-1');
      for await (const _ of stream) {
        // consume
      }

      const result = await stream.result();

      expect(result.model.id).toBe('gpt-5.4-mini');
      expect(result.stopReason).not.toBe('error');
      expect(result.usage.totalTokens).toBeGreaterThan(0);
    }, 45000);
  });

  describe('error handling', () => {
    it('should emit error for invalid api key', async () => {
      const context: Context = {
        messages: [
          {
            role: 'user',
            id: 'codex-stream-7',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
      };

      const stream = streamCodex(
        model,
        context,
        {
          apiKey: 'invalid-key-12345',
          'chatgpt-account-id': chatgptAccountId!,
          instructions: 'You are a helpful coding assistant. Be concise.',
        },
        'codex-stream-msg-7'
      );

      const events: BaseAssistantEvent<'codex'>[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();

      const result = await stream.result();
      expect(result.stopReason).toBe('error');
      expect(result.errorMessage).toBeDefined();
    }, 45000);
  });
});
