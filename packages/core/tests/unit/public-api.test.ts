import { describe, expect, it, vi } from 'vitest';

import { registerProvider, stream } from '../../src/index.js';
import { EventStream } from '../../src/utils/event-stream.js';

import type { Context, Model } from '../../src/types/index.js';

describe('core public api', () => {
  it('exports registerProvider so advanced callers can extend the registry', () => {
    const customStream = vi.fn(() => new EventStream() as any);

    registerProvider('custom-test-provider', {
      stream: customStream as any,
      getMockNativeMessage: () => ({}),
    });

    const model = {
      id: 'custom-model',
      name: 'Custom Model',
      api: 'custom-test-provider',
      baseUrl: 'https://custom.example.com',
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 8192,
      maxTokens: 2048,
      tools: [],
    } as Model<any>;

    const context: Context = {
      messages: [
        {
          role: 'user',
          id: 'custom-user-1',
          content: [{ type: 'text', content: 'Hello' }],
        },
      ],
    };

    stream(model, context, { apiKey: 'test-key' } as any, 'custom-request-1');

    expect(customStream).toHaveBeenCalledWith(
      model,
      context,
      { apiKey: 'test-key' },
      'custom-request-1'
    );
  });
});
