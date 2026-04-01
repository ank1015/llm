import { Type } from '@sinclair/typebox';
import OpenAI from 'openai';
import { describe, expect, it } from 'vitest';

import {
  buildCodexMessages,
  buildParams,
  createClient,
  rewriteCodexErrorBody,
} from '../../../src/providers/codex/utils.js';

import type { CodexProviderOptions, Context, Model, Tool, UserMessage } from '../../../src/types/index.js';

describe('Codex Utils', () => {
  const mockModel: Model<'codex'> = {
    id: 'gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    api: 'codex',
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    reasoning: true,
    input: ['text', 'image', 'file'],
    cost: { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
    contextWindow: 400000,
    maxTokens: 128000,
    tools: ['function_calling'],
  };

  const defaultOptions: CodexProviderOptions = {
    apiKey: 'access-token',
    'chatgpt-account-id': 'acc-123',
    instructions: 'You are a helpful coding assistant.',
  };

  describe('createClient', () => {
    it('should create an OpenAI client with codex baseURL', () => {
      const client = createClient(mockModel, defaultOptions);
      expect(client).toBeInstanceOf(OpenAI);
      expect(client.baseURL).toBe('https://chatgpt.com/backend-api/codex');
    });

    it('should throw when apiKey is missing', () => {
      expect(() =>
        createClient(mockModel, {
          ...defaultOptions,
          apiKey: '',
        })
      ).toThrow('Codex API key is required.');
    });

    it('should throw when chatgpt-account-id is missing', () => {
      expect(() =>
        createClient(mockModel, {
          ...defaultOptions,
          'chatgpt-account-id': '',
        })
      ).toThrow('Codex chatgpt-account-id is required.');
    });
  });

  describe('buildCodexMessages', () => {
    it('should convert user text to OpenAI responses input format', () => {
      const userMessage: UserMessage = {
        role: 'user',
        id: 'msg-1',
        content: [{ type: 'text', content: 'hello codex' }],
      };
      const context: Context = { messages: [userMessage] };

      const messages = buildCodexMessages(mockModel, context);

      expect(messages).toEqual([
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'hello codex' }],
        },
      ]);
    });

    it('should not include system prompt in input messages', () => {
      const context: Context = {
        systemPrompt: 'You are a strict formatter.',
        messages: [
          {
            role: 'user',
            id: 'msg-2',
            content: [{ type: 'text', content: 'format this' }],
          },
        ],
      };

      const messages = buildCodexMessages(mockModel, context);

      expect(messages).toEqual([
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'format this' }],
        },
      ]);
    });
  });

  describe('buildParams', () => {
    it('should set model and force stream/store requirements', () => {
      const context: Context = { messages: [] };
      const result = buildParams(mockModel, context, defaultOptions);

      expect(result.model).toBe('gpt-5.3-codex');
      expect(result.store).toBe(false);
      expect(result.stream).toBe(false);
    });

    it('should include converted tools when function_calling is supported', () => {
      const tool: Tool = {
        name: 'search',
        description: 'Search docs',
        parameters: Type.Object({ query: Type.String() }),
      };
      const context: Context = { messages: [], tools: [tool] };
      const result = buildParams(mockModel, context, defaultOptions);

      expect(result.tools).toBeDefined();
      expect((result.tools?.[0] as any).name).toBe('search');
    });

    it('should map context systemPrompt to instructions', () => {
      const context: Context = {
        systemPrompt: 'Follow only Python style guidelines.',
        messages: [
          {
            role: 'user',
            id: 'msg-3',
            content: [{ type: 'text', content: 'hello' }],
          },
        ],
      };
      const result = buildParams(mockModel, context, defaultOptions);

      expect(result.instructions).toBe('Follow only Python style guidelines.');
      expect(result.input).toEqual([
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'hello' }],
        },
      ]);
    });

    it('should remove credential and unsupported fields from params', () => {
      const context: Context = { messages: [] };
      const result = buildParams(mockModel, context, {
        ...defaultOptions,
        temperature: 0.4,
        top_p: 0.8,
        truncation: 'disabled',
        max_output_tokens: 1000,
        stream: true,
        store: true,
      } as unknown as CodexProviderOptions);

      expect(result).not.toHaveProperty('apiKey');
      expect(result).not.toHaveProperty('chatgpt-account-id');
      expect(result).not.toHaveProperty('temperature');
      expect(result).not.toHaveProperty('top_p');
      expect(result).not.toHaveProperty('truncation');
      expect(result).not.toHaveProperty('max_output_tokens');
      expect(result.stream).toBe(false);
      expect(result.store).toBe(false);
    });

    it('should use default instructions when system prompt and instructions are missing', () => {
      const context: Context = { messages: [] };
      const result = buildParams(mockModel, context, {
        apiKey: defaultOptions.apiKey,
        'chatgpt-account-id': defaultOptions['chatgpt-account-id'],
      });

      expect(result.instructions).toBe('You are a helpful assistant');
    });
  });

  describe('rewriteCodexErrorBody', () => {
    it('should rewrite backend detail JSON to OpenAI error shape', () => {
      const rewritten = rewriteCodexErrorBody(
        JSON.stringify({ detail: 'temperature is not supported' }),
        400
      );
      const parsed = JSON.parse(rewritten);

      expect(parsed).toEqual({
        error: {
          message: 'temperature is not supported',
          type: 'codex_backend_error',
          code: '400',
        },
      });
    });

    it('should preserve structured backend error codes and types', () => {
      const rewritten = rewriteCodexErrorBody(
        JSON.stringify({
          error: {
            type: 'usage_limit_reached',
            message: 'The usage limit has been reached',
            plan_type: 'pro',
          },
        }),
        429
      );
      const parsed = JSON.parse(rewritten);

      expect(parsed).toEqual({
        error: {
          type: 'usage_limit_reached',
          code: '429',
          message: 'The usage limit has been reached',
          plan_type: 'pro',
        },
      });
    });

    it('should fallback to raw body for non-json error payloads', () => {
      const rewritten = rewriteCodexErrorBody('Bad Gateway', 502);
      const parsed = JSON.parse(rewritten);

      expect(parsed).toEqual({
        error: {
          message: 'Bad Gateway',
          type: 'codex_backend_error',
          code: '502',
        },
      });
    });
  });
});
