import { describe, expect, it } from 'vitest';

import {
  MODELS,
  calculateCost,
  getModel,
  getModels,
  getProviders,
} from '../../src/models/index.js';

import type { Api, Model, Usage } from '@ank1015/llm-types';

describe('getProviders', () => {
  it('should return all known providers', () => {
    const providers = getProviders();

    expect(providers).toContain('anthropic');
    expect(providers).toContain('claude-code');
    expect(providers).toContain('codex');
    expect(providers).toContain('openai');
    expect(providers).toContain('google');
    expect(providers).toContain('deepseek');
    expect(providers).toContain('zai');
    expect(providers).toContain('kimi');
  });

  it('should return an array', () => {
    const providers = getProviders();

    expect(Array.isArray(providers)).toBe(true);
  });

  it('should return all providers from KnownApis', () => {
    const providers = getProviders();

    expect(providers.length).toBeGreaterThanOrEqual(11);
  });
});

describe('getModel', () => {
  describe('valid lookups', () => {
    it('should return Anthropic model', () => {
      const model = getModel('anthropic', 'claude-haiku-4-5');

      expect(model).toBeDefined();
      expect(model?.api).toBe('anthropic');
      expect(model?.id).toBe('claude-haiku-4-5');
    });

    it('should return OpenAI model', () => {
      const model = getModel('openai', 'gpt-5.4');

      expect(model).toBeDefined();
      expect(model?.api).toBe('openai');
      expect(model?.id).toBe('gpt-5.4');
    });

    it('should return Codex model', () => {
      const model = getModel('codex', 'gpt-5.3-codex');

      expect(model).toBeDefined();
      expect(model?.api).toBe('codex');
      expect(model?.id).toBe('gpt-5.3-codex');
    });

    it('should return Claude Code model', () => {
      const model = getModel('claude-code', 'claude-haiku-4-5');

      expect(model).toBeDefined();
      expect(model?.api).toBe('claude-code');
      expect(model?.id).toBe('claude-haiku-4-5');
    });

    it('should return Google model', () => {
      const model = getModel('google', 'gemini-3-flash-preview');

      expect(model).toBeDefined();
      expect(model?.api).toBe('google');
      expect(model?.id).toBe('gemini-3-flash-preview');
    });

    it('should return DeepSeek model', () => {
      const model = getModel('deepseek', 'deepseek');

      expect(model).toBeDefined();
      expect(model?.api).toBe('deepseek');
    });

    it('should return Z.AI model', () => {
      const model = getModel('zai', 'glm-5');

      expect(model).toBeDefined();
      expect(model?.api).toBe('zai');
      expect(model?.id).toBe('glm-5');
    });

    it('should return Kimi model', () => {
      const model = getModel('kimi', 'kimi-k2.5');

      expect(model).toBeDefined();
      expect(model?.api).toBe('kimi');
      expect(model?.id).toBe('kimi-k2.5');
    });
  });

  describe('model properties', () => {
    it('should have required properties', () => {
      const model = getModel('anthropic', 'claude-haiku-4-5');

      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('name');
      expect(model).toHaveProperty('api');
      expect(model).toHaveProperty('baseUrl');
      expect(model).toHaveProperty('cost');
      expect(model).toHaveProperty('contextWindow');
      expect(model).toHaveProperty('maxTokens');
    });

    it('should have cost properties', () => {
      const model = getModel('anthropic', 'claude-haiku-4-5');

      expect(model?.cost).toHaveProperty('input');
      expect(model?.cost).toHaveProperty('output');
      expect(model?.cost).toHaveProperty('cacheRead');
      expect(model?.cost).toHaveProperty('cacheWrite');
    });

    it('should have positive context window', () => {
      const model = getModel('openai', 'gpt-5.4');

      expect(model?.contextWindow).toBeGreaterThan(0);
    });

    it('should have positive max tokens', () => {
      const model = getModel('openai', 'gpt-5.4');

      expect(model?.maxTokens).toBeGreaterThan(0);
    });
  });

  describe('invalid lookups', () => {
    it('should return undefined for non-existent model', () => {
      const model = getModel('anthropic', 'non-existent-model' as never);

      expect(model).toBeUndefined();
    });

    it('should return undefined for non-existent api', () => {
      const model = getModel('non-existent-api' as Api, 'some-model' as never);

      expect(model).toBeUndefined();
    });
  });
});

describe('getModels', () => {
  describe('valid lookups', () => {
    it('should return all Anthropic models', () => {
      const models = getModels('anthropic');

      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.api === 'anthropic')).toBe(true);
    });

    it('should return all OpenAI models', () => {
      const models = getModels('openai');

      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.api === 'openai')).toBe(true);
    });

    it('should return all Codex models', () => {
      const models = getModels('codex');

      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.api === 'codex')).toBe(true);
    });

    it('should return all Claude Code models', () => {
      const models = getModels('claude-code');

      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.api === 'claude-code')).toBe(true);
    });

    it('should return all Google models', () => {
      const models = getModels('google');

      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.api === 'google')).toBe(true);
    });

    it('should return all DeepSeek models', () => {
      const models = getModels('deepseek');

      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.api === 'deepseek')).toBe(true);
    });

    it('should return all Z.AI models', () => {
      const models = getModels('zai');

      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.api === 'zai')).toBe(true);
    });

    it('should return all Kimi models', () => {
      const models = getModels('kimi');

      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.api === 'kimi')).toBe(true);
    });
  });

  describe('model array properties', () => {
    it('should return an array', () => {
      const models = getModels('anthropic');

      expect(Array.isArray(models)).toBe(true);
    });

    it('should return models with unique ids', () => {
      const models = getModels('openai');
      const ids = models.map((m) => m.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should match the count in MODELS object', () => {
      const models = getModels('anthropic');
      const expectedCount = Object.keys(MODELS.anthropic).length;

      expect(models.length).toBe(expectedCount);
    });
  });

  describe('invalid lookups', () => {
    it('should return empty array for non-existent api', () => {
      const models = getModels('non-existent-api' as Api);

      expect(models).toEqual([]);
    });
  });
});

describe('calculateCost', () => {
  // Create a mock model for testing
  const mockModel: Model<'anthropic'> = {
    id: 'test-model',
    name: 'Test Model',
    api: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    contextWindow: 200000,
    maxTokens: 64000,
    cost: {
      input: 3.0, // $3 per million input tokens
      output: 15.0, // $15 per million output tokens
      cacheRead: 0.3, // $0.30 per million cache read tokens
      cacheWrite: 3.75, // $3.75 per million cache write tokens
    },
  };

  describe('basic calculations', () => {
    it('should calculate input cost correctly', () => {
      const usage: Usage = {
        input: 1000,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };

      const cost = calculateCost(mockModel, usage);

      // 1000 tokens * $3/1M = $0.003
      expect(cost.input).toBeCloseTo(0.003, 6);
      expect(cost.output).toBe(0);
      expect(cost.total).toBeCloseTo(0.003, 6);
    });

    it('should calculate output cost correctly', () => {
      const usage: Usage = {
        input: 0,
        output: 1000,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };

      const cost = calculateCost(mockModel, usage);

      // 1000 tokens * $15/1M = $0.015
      expect(cost.output).toBeCloseTo(0.015, 6);
      expect(cost.input).toBe(0);
      expect(cost.total).toBeCloseTo(0.015, 6);
    });

    it('should calculate cache read cost correctly', () => {
      const usage: Usage = {
        input: 0,
        output: 0,
        cacheRead: 1000,
        cacheWrite: 0,
        totalTokens: 1000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };

      const cost = calculateCost(mockModel, usage);

      // 1000 tokens * $0.30/1M = $0.0003
      expect(cost.cacheRead).toBeCloseTo(0.0003, 6);
      expect(cost.total).toBeCloseTo(0.0003, 6);
    });

    it('should calculate cache write cost correctly', () => {
      const usage: Usage = {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 1000,
        totalTokens: 1000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };

      const cost = calculateCost(mockModel, usage);

      // 1000 tokens * $3.75/1M = $0.00375
      expect(cost.cacheWrite).toBeCloseTo(0.00375, 6);
      expect(cost.total).toBeCloseTo(0.00375, 6);
    });
  });

  describe('combined calculations', () => {
    it('should calculate total cost with all components', () => {
      const usage: Usage = {
        input: 10000,
        output: 5000,
        cacheRead: 2000,
        cacheWrite: 1000,
        totalTokens: 18000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };

      const cost = calculateCost(mockModel, usage);

      // input: 10000 * $3/1M = $0.03
      // output: 5000 * $15/1M = $0.075
      // cacheRead: 2000 * $0.30/1M = $0.0006
      // cacheWrite: 1000 * $3.75/1M = $0.00375
      // total: $0.10935
      expect(cost.input).toBeCloseTo(0.03, 6);
      expect(cost.output).toBeCloseTo(0.075, 6);
      expect(cost.cacheRead).toBeCloseTo(0.0006, 6);
      expect(cost.cacheWrite).toBeCloseTo(0.00375, 6);
      expect(cost.total).toBeCloseTo(0.10935, 6);
    });

    it('should handle large token counts', () => {
      const usage: Usage = {
        input: 1000000, // 1M tokens
        output: 500000, // 500K tokens
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1500000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };

      const cost = calculateCost(mockModel, usage);

      // input: 1M * $3/1M = $3
      // output: 500K * $15/1M = $7.5
      expect(cost.input).toBeCloseTo(3.0, 6);
      expect(cost.output).toBeCloseTo(7.5, 6);
      expect(cost.total).toBeCloseTo(10.5, 6);
    });
  });

  describe('edge cases', () => {
    it('should handle zero usage', () => {
      const usage: Usage = {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };

      const cost = calculateCost(mockModel, usage);

      expect(cost.input).toBe(0);
      expect(cost.output).toBe(0);
      expect(cost.cacheRead).toBe(0);
      expect(cost.cacheWrite).toBe(0);
      expect(cost.total).toBe(0);
    });

    it('should not mutate the input usage object', () => {
      const usage: Usage = {
        input: 1000,
        output: 500,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1500,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };
      const originalCost = { ...usage.cost };

      calculateCost(mockModel, usage);

      expect(usage.cost).toEqual(originalCost);
    });

    it('should return a new cost object', () => {
      const usage: Usage = {
        input: 1000,
        output: 500,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1500,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };

      const cost = calculateCost(mockModel, usage);

      expect(cost).not.toBe(usage.cost);
    });
  });

  describe('with real models', () => {
    it('should calculate cost for real Anthropic model', () => {
      const model = getModel('anthropic', 'claude-haiku-4-5')!;
      const usage: Usage = {
        input: 10000,
        output: 1000,
        cacheRead: 5000,
        cacheWrite: 0,
        totalTokens: 16000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };

      const cost = calculateCost(model, usage);

      expect(cost.input).toBeGreaterThan(0);
      expect(cost.output).toBeGreaterThan(0);
      expect(cost.total).toBeGreaterThan(0);
      expect(cost.total).toBe(cost.input + cost.output + cost.cacheRead + cost.cacheWrite);
    });

    it('should calculate cost for real OpenAI model', () => {
      const model = getModel('openai', 'gpt-5.4')!;
      const usage: Usage = {
        input: 5000,
        output: 2000,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 7000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };

      const cost = calculateCost(model, usage);

      expect(cost.input).toBeGreaterThan(0);
      expect(cost.output).toBeGreaterThan(0);
      expect(cost.total).toBe(cost.input + cost.output + cost.cacheRead + cost.cacheWrite);
    });
  });
});
