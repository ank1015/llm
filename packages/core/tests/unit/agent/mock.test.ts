import { describe, expect, it } from 'vitest';

import { getMockMessage } from '../../../src/agent/mock.js';
import { getModel } from '../../../src/models.js';

import type { Api, Model } from '@ank1015/llm-types';

describe('getMockMessage', () => {
  describe('common properties', () => {
    const testCases: Array<{ api: Api; modelId: string }> = [
      { api: 'anthropic', modelId: 'claude-haiku-4-5' },
      { api: 'openai', modelId: 'gpt-5.2' },
      { api: 'google', modelId: 'gemini-3-flash-preview' },
      { api: 'deepseek', modelId: 'deepseek' },
      { api: 'zai', modelId: 'glm-4.7' },
      { api: 'kimi', modelId: 'kimi-k2.5' },
    ];

    it.each(testCases)('should create mock message for $api', ({ api, modelId }) => {
      const model = getModel(api, modelId as never);
      expect(model).toBeDefined();

      const message = getMockMessage(model!);

      expect(message.role).toBe('assistant');
      expect(message.api).toBe(api);
      expect(message.id).toBeDefined();
      expect(message.model).toBe(model);
      expect(message.timestamp).toBeDefined();
      expect(message.duration).toBe(0);
      expect(message.stopReason).toBe('stop');
      expect(message.content).toEqual([]);
      expect(message.usage).toEqual({
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      });
    });

    it('should generate unique IDs for each mock message', () => {
      const model = getModel('anthropic', 'claude-haiku-4-5')!;

      const message1 = getMockMessage(model);
      const message2 = getMockMessage(model);

      expect(message1.id).not.toBe(message2.id);
    });

    it('should set timestamp to current time', () => {
      const model = getModel('openai', 'gpt-5.2')!;
      const before = Date.now();
      const message = getMockMessage(model);
      const after = Date.now();

      expect(message.timestamp).toBeGreaterThanOrEqual(before);
      expect(message.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('provider-specific native messages', () => {
    it('should include Anthropic native message structure', () => {
      const model = getModel('anthropic', 'claude-haiku-4-5')!;
      const message = getMockMessage(model);

      expect(message.message).toBeDefined();
      expect(message.message).toHaveProperty('id');
      expect(message.message).toHaveProperty('type', 'message');
      expect(message.message).toHaveProperty('role', 'assistant');
      expect(message.message).toHaveProperty('content');
      expect(message.message).toHaveProperty('model');
      expect(message.message).toHaveProperty('stop_reason');
      expect(message.message).toHaveProperty('stop_sequence');
      expect(message.message).toHaveProperty('usage');
    });

    it('should include OpenAI native message structure', () => {
      const model = getModel('openai', 'gpt-5.2')!;
      const message = getMockMessage(model);

      expect(message.message).toBeDefined();
      expect(message.message).toHaveProperty('id');
      expect(message.message).toHaveProperty('object', 'response');
      expect(message.message).toHaveProperty('created_at');
      expect(message.message).toHaveProperty('model');
      expect(message.message).toHaveProperty('output');
      expect(message.message).toHaveProperty('status');
    });

    it('should include Google native message structure', () => {
      const model = getModel('google', 'gemini-3-flash-preview')!;
      const message = getMockMessage(model);

      expect(message.message).toBeDefined();
      expect(message.message).toHaveProperty('text');
      expect(message.message).toHaveProperty('data');
      expect(message.message).toHaveProperty('functionCalls');
    });

    it('should include DeepSeek native message structure', () => {
      const model = getModel('deepseek', 'deepseek')!;
      const message = getMockMessage(model);

      expect(message.message).toBeDefined();
      expect(message.message).toHaveProperty('id');
      expect(message.message).toHaveProperty('object', 'chat.completion');
      expect(message.message).toHaveProperty('model');
      expect(message.message).toHaveProperty('choices');
      expect(message.message).toHaveProperty('usage');
    });

    it('should include Z.AI native message structure', () => {
      const model = getModel('zai', 'glm-4.7')!;
      const message = getMockMessage(model);

      expect(message.message).toBeDefined();
      expect(message.message).toHaveProperty('id');
      expect(message.message).toHaveProperty('object', 'chat.completion');
      expect(message.message).toHaveProperty('model');
      expect(message.message).toHaveProperty('choices');
      expect(message.message).toHaveProperty('usage');
    });

    it('should include Kimi native message structure', () => {
      const model = getModel('kimi', 'kimi-k2.5')!;
      const message = getMockMessage(model);

      expect(message.message).toBeDefined();
      expect(message.message).toHaveProperty('id');
      expect(message.message).toHaveProperty('object', 'chat.completion');
      expect(message.message).toHaveProperty('model');
      expect(message.message).toHaveProperty('choices');
      expect(message.message).toHaveProperty('usage');
    });
  });

  describe('error handling', () => {
    it('should throw for unsupported API', () => {
      const invalidModel = {
        api: 'unsupported' as Api,
        id: 'some-model',
        name: 'Some Model',
        contextWindow: 4096,
        outputLimit: 4096,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      } as Model<Api>;

      expect(() => getMockMessage(invalidModel)).toThrow(/Unsupported API/);
    });
  });
});
