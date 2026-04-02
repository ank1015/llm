import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, expect, it } from 'vitest';

import {
  collectStreamEvents,
  describeIfAvailable,
  getIntegrationEnv,
} from '../../../core/tests/integration/helpers/live.js';
import { getText, llm, userMessage } from '../../src/index.js';
import { setProviderCredentials } from '../../src/keys.js';

import type { BaseAssistantEvent } from '../../src/index.js';

const openAiApiKey = getIntegrationEnv('OPENAI_API_KEY');
const describeIfOpenAI = describeIfAvailable(Boolean(openAiApiKey));

describeIfOpenAI('SDK llm() OpenAI integration', () => {
  let tempDirectory = '';
  let keysFilePath = '';

  beforeAll(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'llm-sdk-openai-'));
    keysFilePath = join(tempDirectory, 'keys.env');

    await setProviderCredentials(keysFilePath, 'openai', {
      apiKey: openAiApiKey!,
    });
  });

  afterAll(async () => {
    if (tempDirectory) {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it('awaits the final assistant message through llm()', async () => {
    const result = await llm({
      modelId: 'openai/gpt-5.4-mini',
      keysFilePath,
      reasoningEffort: 'low',
      messages: [
        userMessage('Reply with exactly SDK_OPENAI_AWAIT_OK', { id: 'user-sdk-openai-await-ok' }),
      ],
      overrideProviderSetting: {
        max_output_tokens: 64,
      },
      requestId: 'sdk-openai-await-1',
    });

    expect(result.role).toBe('assistant');
    expect(result.api).toBe('openai');
    expect(result.id).toBe('sdk-openai-await-1');
    expect(['stop', 'length']).toContain(result.stopReason);
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(getText(result)).toContain('SDK_OPENAI_AWAIT_OK');
  }, 45000);

  it('streams events first and can still be awaited for the final message', async () => {
    const run = llm({
      modelId: 'openai/gpt-5.4-mini',
      keysFilePath,
      reasoningEffort: 'low',
      messages: [
        userMessage('Reply with exactly SDK_OPENAI_STREAM_OK', { id: 'user-sdk-openai-stream-ok' }),
      ],
      overrideProviderSetting: {
        max_output_tokens: 64,
      },
      requestId: 'sdk-openai-stream-1',
    });

    const events = await collectStreamEvents(run);
    const result = await run;

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.type).toBe('start');
    expect(events.some((event: BaseAssistantEvent<'openai'>) => event.type === 'text_delta')).toBe(
      true
    );
    expect(events.some((event: BaseAssistantEvent<'openai'>) => event.type === 'done')).toBe(true);
    expect(result.id).toBe('sdk-openai-stream-1');
    expect(getText(result)).toContain('SDK_OPENAI_STREAM_OK');
  }, 45000);
});
