import Anthropic from '@anthropic-ai/sdk';
import { Type } from '@sinclair/typebox';
import { describe, expect, it } from 'vitest';

import {
  buildClaudeCodeMessages,
  buildParams,
  createClient,
} from '../../../src/providers/claude-code/utils.js';

import type {
  ClaudeCodeProviderOptions,
  Context,
  Model,
  Tool,
  UserMessage,
} from '@ank1015/llm-types';

describe('Claude Code Utils', () => {
  const mockModel: Model<'claude-code'> = {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    api: 'claude-code',
    baseUrl: 'https://api.anthropic.com',
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    contextWindow: 200000,
    maxTokens: 64000,
    tools: ['function_calling'],
  };

  const defaultOptions: ClaudeCodeProviderOptions = {
    oauthToken: 'oauth-token',
    betaFlag: 'oauth-2025-04-20',
    billingHeader: 'x-billing-account: acc-123',
  };

  describe('createClient', () => {
    it('should create an Anthropic client with custom headers', () => {
      const client = createClient(mockModel, defaultOptions);
      expect(client).toBeInstanceOf(Anthropic);
      expect(client.baseURL).toBe('https://api.anthropic.com');
    });

    it('should throw when oauthToken is missing', () => {
      expect(() =>
        createClient(mockModel, {
          ...defaultOptions,
          oauthToken: '',
        })
      ).toThrow('Claude Code oauthToken is required.');
    });

    it('should throw when betaFlag is missing', () => {
      expect(() =>
        createClient(mockModel, {
          ...defaultOptions,
          betaFlag: '',
        })
      ).toThrow('Claude Code betaFlag is required.');
    });
  });

  describe('buildClaudeCodeMessages', () => {
    it('should convert user text to Anthropic-compatible message format', () => {
      const userMessage: UserMessage = {
        role: 'user',
        id: 'msg-1',
        content: [{ type: 'text', content: 'Hello Claude Code' }],
      };
      const context: Context = { messages: [userMessage] };

      const messages = buildClaudeCodeMessages(mockModel, context);

      expect(messages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello Claude Code' }],
        },
      ]);
    });
  });

  describe('buildParams', () => {
    it('should set model and max_tokens', () => {
      const context: Context = { messages: [] };
      const result = buildParams(mockModel, context, defaultOptions);

      expect(result.model).toBe('claude-sonnet-4-5');
      expect(result.max_tokens).toBe(64000);
      expect(result.stream).toBe(false);
    });

    it('should always include billing header in system prompt', () => {
      const context: Context = { messages: [] };
      const result = buildParams(mockModel, context, defaultOptions);

      expect(result.system).toEqual([{ type: 'text', text: 'x-billing-account: acc-123' }]);
    });

    it('should append user system prompt after billing header', () => {
      const context: Context = {
        messages: [],
        systemPrompt: 'Follow these rules',
      };
      const result = buildParams(mockModel, context, defaultOptions);

      expect(result.system).toEqual([
        { type: 'text', text: 'x-billing-account: acc-123' },
        { type: 'text', text: 'Follow these rules' },
      ]);
    });

    it('should sanitize unicode in billing and user system prompts', () => {
      const unpaired = String.fromCharCode(0xd83d);
      const context: Context = {
        messages: [],
        systemPrompt: `Prompt ${unpaired} text`,
      };
      const result = buildParams(mockModel, context, {
        ...defaultOptions,
        billingHeader: `Header ${unpaired} text`,
      });

      expect(result.system).toEqual([
        { type: 'text', text: 'Header  text' },
        { type: 'text', text: 'Prompt  text' },
      ]);
    });

    it('should include tools when function_calling is supported', () => {
      const tool: Tool = {
        name: 'search',
        description: 'Search the web',
        parameters: Type.Object({ query: Type.String() }),
      };
      const context: Context = { messages: [], tools: [tool] };
      const result = buildParams(mockModel, context, defaultOptions);

      expect(result.tools).toBeDefined();
      expect(result.tools?.[0]?.name).toBe('search');
    });

    it('should omit credential and signal fields from params', () => {
      const context: Context = { messages: [] };
      const result = buildParams(mockModel, context, {
        ...defaultOptions,
        signal: new AbortController().signal,
        temperature: 0.7,
      });

      expect(result).not.toHaveProperty('oauthToken');
      expect(result).not.toHaveProperty('betaFlag');
      expect(result).not.toHaveProperty('billingHeader');
      expect(result).not.toHaveProperty('signal');
      expect(result.temperature).toBe(0.7);
    });

    it('should throw when billingHeader is missing', () => {
      const context: Context = { messages: [] };
      expect(() =>
        buildParams(mockModel, context, {
          ...defaultOptions,
          billingHeader: '',
        })
      ).toThrow('Claude Code billingHeader is required.');
    });
  });
});
