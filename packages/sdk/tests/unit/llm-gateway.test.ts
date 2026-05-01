import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetSdkConfig, setSdkConfig } from '../../src/config.js';
import { llm } from '../../src/llm.js';

import type { BaseAssistantEvent, BaseAssistantMessage } from '@ank1015/llm-core';

const tempDirectories: string[] = [];
const originalFetch = globalThis.fetch;

afterEach(async () => {
  globalThis.fetch = originalFetch;
  resetSdkConfig();
  vi.clearAllMocks();
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('llm gateway transport', () => {
  it('posts resolved gateway requests, parses SSE events, and returns the final message', async () => {
    const gatewayCredentialsPath = await createGatewayCredentialsFile();
    setSdkConfig({ gatewayCredentialsPath });

    const finalMessage = createAssistantMessage();
    const events: BaseAssistantEvent<'openai'>[] = [
      { type: 'start', message: finalMessage },
      { type: 'done', reason: 'stop', message: finalMessage },
    ];
    const fetchMock = vi.fn(async () => sseResponse(events));
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await llm({
      modelId: 'openai/gpt-5.4-mini',
      messages: [
        {
          role: 'user',
          id: 'user-1',
          content: [{ type: 'text', content: 'Hello' }],
        },
      ],
      system: 'You are helpful.',
      reasoningEffort: 'high',
      overrideProviderSetting: {
        apiKey: 'must-not-be-sent',
        max_output_tokens: 128,
      },
      requestId: 'request-123',
    });

    expect(result).toEqual(finalMessage);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer gateway-access-token',
          'Content-Type': 'application/json',
        },
      })
    );

    const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    expect(body).toEqual({
      api: 'openai',
      modelId: 'gpt-5.4-mini',
      messages: [
        {
          role: 'user',
          id: 'user-1',
          content: [{ type: 'text', content: 'Hello' }],
        },
      ],
      systemPrompt: 'You are helpful.',
      providerOptions: {
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
        max_output_tokens: 128,
      },
      requestId: 'request-123',
    });
  });

  it('routes azure-openai-prefixed models to the Azure OpenAI gateway provider', async () => {
    const gatewayCredentialsPath = await createGatewayCredentialsFile();
    setSdkConfig({ gatewayCredentialsPath });

    const finalMessage = createAssistantMessage({
      api: 'azure-openai',
      id: 'assistant-azure-1',
    });
    const fetchMock = vi.fn(async () =>
      sseResponse([{ type: 'done', reason: 'stop', message: finalMessage }])
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await llm({
      modelId: 'azure-openai/gpt-5.4-mini',
      messages: [
        {
          role: 'user',
          id: 'user-1',
          content: [{ type: 'text', content: 'Hello' }],
        },
      ],
      requestId: 'request-azure-123',
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    expect(body).toEqual(
      expect.objectContaining({
        api: 'azure-openai',
        modelId: 'gpt-5.4-mini',
        requestId: 'request-azure-123',
      })
    );
  });
});

async function createGatewayCredentialsFile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'llm-sdk-llm-gateway-'));
  tempDirectories.push(directory);
  const filePath = join(directory, 'gateway.json');
  await writeFile(
    filePath,
    JSON.stringify({
      gatewayBaseUrl: 'https://gateway.example',
      accessToken: 'gateway-access-token',
      refreshToken: 'gateway-refresh-token',
      accessTokenExpiresAt: Date.now() + 900_000,
      refreshTokenExpiresAt: Date.now() + 30_000_000,
    }),
    'utf8'
  );
  return filePath;
}

function sseResponse(events: BaseAssistantEvent[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}

function createAssistantMessage<TApi extends 'openai' | 'azure-openai' = 'openai'>(
  input: { api?: TApi; id?: string } = {}
): BaseAssistantMessage<TApi> {
  const api = input.api ?? ('openai' as TApi);
  return {
    role: 'assistant',
    api,
    id: input.id ?? 'assistant-1',
    model: {
      api,
      id: 'gpt-5.4-mini',
      name: 'GPT 5.4 Mini',
      family: 'gpt-5',
      baseUrl: '',
      input: ['text'],
      output: ['text'],
      cost: {
        input: 0,
        output: 0,
      },
    } as never,
    message: {} as never,
    timestamp: Date.now(),
    duration: 1,
    stopReason: 'stop',
    content: [{ type: 'text', content: 'Hello back' }],
    usage: {
      input: 1,
      output: 2,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 3,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
  };
}
