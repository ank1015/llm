import { beforeAll, expect, it } from 'vitest';

import '../../../src/providers/google/index.js';

import { stream } from '../../../src/llm/stream.js';
import { getModel } from '../../../src/models/index.js';
import { collectStreamEvents, describeIfAvailable, getIntegrationEnv } from '../helpers/live.js';

import type { BaseAssistantEvent, Context, Model } from '../../../src/types/index.js';

const apiKey = getIntegrationEnv('GEMINI_API_KEY')!;
const describeIfGoogle = describeIfAvailable(Boolean(apiKey));
let model: Model<'google'>;

describeIfGoogle('LLM Google Stream Integration', () => {
  beforeAll(() => {
    const testModel = getModel('google', 'gemini-3-flash-preview');
    if (!testModel) {
      throw new Error('Test model gemini-3-flash-preview not found');
    }

    model = testModel;
  });

  it('streams through the generic dispatcher with a registered real provider', async () => {
    const context: Context = {
      messages: [
        {
          role: 'user',
          id: 'llm-google-stream-1',
          content: [{ type: 'text', content: 'Reply with exactly: GENERIC_STREAM_OK' }],
        },
      ],
    };

    const assistantStream = stream(
      model,
      context,
      {
        apiKey,
        temperature: 0,
        maxOutputTokens: 64,
      },
      'llm-google-stream-msg-1'
    );

    const events = await collectStreamEvents<BaseAssistantEvent<'google'>>(assistantStream);
    const result = await assistantStream.result();

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.type).toBe('start');
    expect(events.at(-1)?.type).toBe('done');
    expect(result.role).toBe('assistant');
    expect(result.api).toBe('google');
    expect(result.id).toBe('llm-google-stream-msg-1');
    expect(['stop', 'length']).toContain(result.stopReason);
    expect(result.message).toHaveProperty('candidates');
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  }, 45000);
});
