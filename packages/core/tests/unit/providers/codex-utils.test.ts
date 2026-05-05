import { Type } from '@sinclair/typebox';
import OpenAI from 'openai';
import { describe, expect, it } from 'vitest';

import {
  buildCodexMessages,
  buildParams,
  createClient,
  getCodexUserAgent,
  rewriteCodexErrorBody,
} from '../../../src/providers/codex/utils.js';

import type {
  CodexProviderOptions,
  Context,
  Model,
  Tool,
  UserMessage,
} from '../../../src/types/index.js';

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

    it('should attach the codex user-agent header', () => {
      const client = createClient(mockModel, defaultOptions) as unknown as {
        _options: { defaultHeaders: Record<string, string> };
      };

      expect(client._options.defaultHeaders['user-agent']).toBe(getCodexUserAgent());
      expect(client._options.defaultHeaders.originator).toBe('codex_cli_rs');
    });

    it('should attach conversation headers when conversationId is provided', () => {
      const client = createClient(mockModel, {
        ...defaultOptions,
        conversationId: 'conversation-123',
      }) as unknown as {
        _options: { defaultHeaders: Record<string, string> };
      };

      expect(client._options.defaultHeaders['x-client-request-id']).toBe('conversation-123');
      expect(client._options.defaultHeaders.session_id).toBe('conversation-123');
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

  describe('getCodexUserAgent', () => {
    it('should format macOS user-agent metadata from Darwin release', () => {
      expect(
        getCodexUserAgent({
          architecture: 'arm64',
          platform: 'darwin',
          release: '25.3.0',
        })
      ).toBe('codex_cli_rs/0.98.0 (Mac OS 26.3.0; arm64)');
    });

    it('should format Windows user-agent metadata without Mac-specific values', () => {
      expect(
        getCodexUserAgent({
          architecture: 'x64',
          platform: 'win32',
          release: '10.0.22631',
        })
      ).toBe('codex_cli_rs/0.98.0 (Windows 10.0.22631; x86_64)');
    });

    it('should format Linux user-agent metadata', () => {
      expect(
        getCodexUserAgent({
          architecture: 'arm64',
          platform: 'linux',
          release: '6.8.0',
        })
      ).toBe('codex_cli_rs/0.98.0 (Linux 6.8.0; arm64)');
    });

    it('should sanitize invalid header characters', () => {
      expect(
        getCodexUserAgent({
          architecture: 'arm64',
          originator: 'codex\ncli',
          platform: 'darwin',
          release: '25.3.0',
        })
      ).toBe('codex_cli/0.98.0 (Mac OS 26.3.0; arm64)');
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

    it('should preserve strict false when converting function tools', () => {
      const tool: Tool = {
        name: 'exec_command',
        description: 'Run command',
        parameters: Type.Object({ cmd: Type.String() }, { additionalProperties: false }),
        strict: false,
      };
      const context: Context = { messages: [], tools: [tool] };
      const result = buildParams(mockModel, context, defaultOptions);

      expect(result.tools?.[0]).toMatchObject({
        type: 'function',
        name: 'exec_command',
        strict: false,
      });
    });

    it('should include custom grammar tools when function_calling is supported', () => {
      const tool: Tool = {
        name: 'apply_patch',
        description: 'Apply patch',
        parameters: Type.Object({ input: Type.String() }),
        type: 'custom',
        format: { type: 'grammar', syntax: 'lark', definition: 'start: "x"' },
      };
      const context: Context = { messages: [], tools: [tool] };
      const result = buildParams(mockModel, context, defaultOptions);

      expect(result.tools?.[0]).toEqual({
        type: 'custom',
        name: 'apply_patch',
        description: 'Apply patch',
        format: { type: 'grammar', syntax: 'lark', definition: 'start: "x"' },
      });
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

    it('should map conversationId to prompt_cache_key', () => {
      const context: Context = { messages: [] };
      const result = buildParams(mockModel, context, {
        ...defaultOptions,
        conversationId: 'conversation-456',
      });

      expect(result.prompt_cache_key).toBe('conversation-456');
      expect(result).not.toHaveProperty('conversationId');
    });

    it('should let conversationId override prompt_cache_key', () => {
      const context: Context = { messages: [] };
      const result = buildParams(mockModel, context, {
        ...defaultOptions,
        conversationId: 'conversation-789',
        prompt_cache_key: 'manual-cache-key',
      });

      expect(result.prompt_cache_key).toBe('conversation-789');
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
