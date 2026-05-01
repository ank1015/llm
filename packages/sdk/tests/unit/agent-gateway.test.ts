import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createEventAdapter } from '@ank1015/llm-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetSdkConfig, setSdkConfig } from '../../src/config.js';
import { agent, userMessage } from '../../src/index.js';

import type { AgentEngineConfig, AgentRunState, BaseAssistantMessage } from '@ank1015/llm-core';

vi.mock('@ank1015/llm-core', () => ({
  agentEngine: { run: vi.fn(), step: vi.fn() },
  createEventAdapter: vi.fn(),
  defaultModelInvoker: vi.fn(),
  getModel: vi.fn(),
}));

const { getModel } = await import('@ank1015/llm-core');
const mockedGetModel = vi.mocked(getModel);
const mockedCreateEventAdapter = vi.mocked(createEventAdapter);

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

describe('agent gateway transport', () => {
  it('keeps the local agent/session flow while invoking the model through the gateway', async () => {
    const gatewayCredentialsPath = await createGatewayCredentialsFile();
    setSdkConfig({ gatewayCredentialsPath });

    const finalMessage = createAssistantMessage();
    mockedGetModel.mockReturnValue(finalMessage.model as never);
    mockedCreateEventAdapter.mockImplementation(
      () =>
        ({
          run: async (
            config: AgentEngineConfig,
            state: AgentRunState,
            options?: { onMessage?: (message: BaseAssistantMessage<'openai'>) => void }
          ) => {
            const assistantMessage = await config.modelInvoker({
              model: config.provider.model,
              context: {
                messages: state.messages,
              },
              options: config.provider.providerOptions ?? {},
              messageId: finalMessage.id,
            });
            await options?.onMessage?.(assistantMessage as BaseAssistantMessage<'openai'>);

            return {
              state: {
                messages: state.messages,
                turns: 1,
                totalTokens: assistantMessage.usage.totalTokens,
                totalCost: assistantMessage.usage.cost.total,
              },
              newMessages: [assistantMessage],
              aborted: false,
            };
          },
          step: vi.fn(),
          getPendingToolCalls: () => new Set(),
        }) as never
    );

    const fetchMock = vi.fn(async () =>
      sseResponse([{ type: 'done', reason: 'stop', message: finalMessage }])
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await agent({
      modelId: 'openai/gpt-5.4-mini',
      inputMessages: [userMessage('hello')],
      reasoningEffort: 'high',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    expect(body).toEqual(
      expect.objectContaining({
        api: 'openai',
        modelId: 'gpt-5.4-mini',
        providerOptions: {
          reasoning: {
            effort: 'high',
            summary: 'auto',
          },
        },
        requestId: finalMessage.id,
      })
    );
  });
});

async function createGatewayCredentialsFile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'llm-sdk-agent-gateway-'));
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

function sseResponse(events: Array<{ type: string; reason?: string; message: BaseAssistantMessage<'openai'> }>): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}

function createAssistantMessage(): BaseAssistantMessage<'openai'> {
  return {
    role: 'assistant',
    api: 'openai',
    id: 'assistant-final',
    model: {
      api: 'openai',
      id: 'gpt-5.4-mini',
    } as never,
    message: {} as never,
    timestamp: Date.now(),
    duration: 1,
    stopReason: 'stop',
    content: [{ type: 'text', content: 'done' }],
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
