import { readFile } from 'node:fs/promises';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGatewayTestApp,
  issueSenderTokens,
  jsonRequest,
  readSseDataFrames,
} from '../helpers/app-fixture.js';

import type {
  BaseAssistantEvent,
  BaseAssistantMessage,
  BaseImageResult,
  ImageContent,
  Message,
  Model,
} from '@ank1015/llm-core';

const mockState = vi.hoisted(() => ({
  generateImage: vi.fn(),
  getImageModel: vi.fn(),
  getModel: vi.fn(),
  stream: vi.fn(),
}));

vi.mock('@ank1015/llm-core', async () => {
  return {
    generateImage: mockState.generateImage,
    getImageModel: mockState.getImageModel,
    getModel: mockState.getModel,
    stream: mockState.stream,
  };
});

describe('gateway app integration', () => {
  let fixture: Awaited<ReturnType<typeof createGatewayTestApp>>;

  beforeEach(async () => {
    fixture = await createGatewayTestApp();
    mockState.getModel.mockReset();
    mockState.getImageModel.mockReset();
    mockState.stream.mockReset();
    mockState.generateImage.mockReset();

    mockState.getModel.mockImplementation((api: string, modelId: string) =>
      api === 'openai' && modelId === 'gpt-5.4-mini'
        ? createModel('openai', 'gpt-5.4-mini')
        : api === 'azure-openai' && modelId === 'gpt-5.4-nano'
          ? createModel('azure-openai', 'gpt-5.4-nano')
          : undefined
    );
    mockState.getImageModel.mockImplementation((api: string, modelId: string) =>
      api === 'openai' && modelId === 'gpt-image-1.5'
        ? createImageModel('openai', 'gpt-image-1.5')
        : undefined
    );
  });

  afterEach(async () => {
    fixture.services.db.close();
    await fixture.cleanup();
  });

  it('returns health status', async () => {
    const response = await fixture.app.request('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('enforces admin auth and bearer auth', async () => {
    const adminResponse = await fixture.app.request('/admin/senders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No Admin' }),
    });

    expect(adminResponse.status).toBe(401);

    const authResponse = await fixture.app.request('/v1/image/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api: 'openai',
        modelId: 'gpt-image-1.5',
        prompt: 'Draw a kite',
      }),
    });

    expect(authResponse.status).toBe(401);
  });

  it('rate limits repeated bad user logins', async () => {
    let response: Response | undefined;
    for (let i = 0; i < 11; i += 1) {
      response = await jsonRequest(fixture.app, '/v1/auth/login', 'POST', {
        username: 'missing',
        password: 'wrong-password',
      });
    }

    expect(response?.status).toBe(429);
    expect(response?.headers.get('retry-after')).toBeTruthy();
  });

  it('rate limits repeated unauthenticated proxy requests without limiting valid users', async () => {
    let unauthenticatedResponse: Response | undefined;
    for (let i = 0; i < 61; i += 1) {
      unauthenticatedResponse = await jsonRequest(fixture.app, '/v1/llm/stream', 'POST', {
        api: 'openai',
        modelId: 'gpt-5.4-mini',
        messages: [],
      });
    }

    expect(unauthenticatedResponse?.status).toBe(429);

    const tokens = await issueSenderTokens(fixture.app, fixture.adminHeaders);
    await jsonRequest(
      fixture.app,
      '/admin/providers/openai/key',
      'PUT',
      { apiKey: 'server-openai-key' },
      fixture.adminHeaders
    );

    const imageResult = createImageResult();
    mockState.generateImage.mockResolvedValue(imageResult);

    const authenticatedResponse = await jsonRequest(
      fixture.app,
      '/v1/image/generate',
      'POST',
      {
        api: 'openai',
        modelId: 'gpt-image-1.5',
        prompt: 'Draw a kite',
      },
      {
        Authorization: `Bearer ${tokens.accessToken}`,
      }
    );

    expect(authenticatedResponse.status).toBe(200);
  });

  it('sets secure admin cookies only when configured or behind trusted https proxy', async () => {
    const defaultLogin = await formRequest(fixture.app, '/admin/login', {
      username: 'admin',
      password: 'admin-password',
    });
    expect(defaultLogin.headers.get('set-cookie')).not.toMatch(/;\s*Secure/iu);

    await fixture.cleanup();
    fixture = await createGatewayTestApp({ cookieSecure: true });

    const forcedSecureLogin = await formRequest(fixture.app, '/admin/login', {
      username: 'admin',
      password: 'admin-password',
    });
    expect(forcedSecureLogin.headers.get('set-cookie')).toMatch(/;\s*Secure/iu);

    await fixture.cleanup();
    fixture = await createGatewayTestApp({ cookieSecure: 'auto', trustProxy: true });

    const proxySecureLogin = await formRequest(
      fixture.app,
      '/admin/login',
      {
        username: 'admin',
        password: 'admin-password',
      },
      {
        'X-Forwarded-Proto': 'https',
      }
    );
    expect(proxySecureLogin.headers.get('set-cookie')).toMatch(/;\s*Secure/iu);
  });

  it('lets an admin log in, create a user, and lets that user log in for tokens', async () => {
    const loginResponse = await formRequest(fixture.app, '/admin/login', {
      username: 'admin',
      password: 'admin-password',
    });
    expect(loginResponse.status).toBe(303);

    const cookie = loginResponse.headers.get('set-cookie');
    expect(cookie).toBeTruthy();

    const dashboardResponse = await fixture.app.request('/admin/dashboard', {
      headers: {
        Cookie: cookie ?? '',
      },
    });
    expect(dashboardResponse.status).toBe(200);
    expect(await dashboardResponse.text()).toContain('Admin dashboard');

    const providersResponse = await fixture.app.request('/admin/dashboard/providers', {
      headers: {
        Cookie: cookie ?? '',
      },
    });
    const providersHtml = await providersResponse.text();
    expect(providersHtml).toContain('azure-openai');
    expect(providersHtml).toContain('azureDeploymentUrl');

    const createUserResponse = await formRequest(
      fixture.app,
      '/admin/dashboard/users',
      {
        name: 'Tester',
        username: 'tester',
        password: 'tester-password',
      },
      {
        Cookie: cookie ?? '',
      }
    );
    expect(createUserResponse.status).toBe(201);

    const userLoginResponse = await jsonRequest(fixture.app, '/v1/auth/login', 'POST', {
      username: 'tester',
      password: 'tester-password',
    });
    expect(userLoginResponse.status).toBe(200);
    const userLoginBody = (await userLoginResponse.json()) as {
      accessToken: string;
      refreshToken: string;
      senderId: string;
    };

    expect(userLoginBody.accessToken).toBeTruthy();
    expect(userLoginBody.refreshToken).toBeTruthy();
    expect(userLoginBody.senderId).toBeTruthy();
  });

  it('proxies llm streams, strips forbidden provider options, and persists sanitized logs', async () => {
    const tokens = await issueSenderTokens(fixture.app, fixture.adminHeaders);
    await jsonRequest(
      fixture.app,
      '/admin/providers/openai/key',
      'PUT',
      { apiKey: 'server-openai-key' },
      fixture.adminHeaders
    );

    const finalMessage = createAssistantMessage();
    const events: BaseAssistantEvent<'openai'>[] = [
      { type: 'start', message: finalMessage },
      {
        type: 'text_delta',
        contentIndex: 0,
        delta: 'Hello',
        message: finalMessage,
      },
      { type: 'done', reason: 'stop', message: finalMessage },
    ];

    mockState.stream.mockImplementation((_model, _context, options) => {
      expect(options).toMatchObject({
        apiKey: 'server-openai-key',
        reasoning: {
          effort: 'high',
        },
      });
      expect(options).not.toHaveProperty('headers');

      return createStream(events, finalMessage);
    });

    const response = await jsonRequest(
      fixture.app,
      '/v1/llm/stream',
      'POST',
      {
        api: 'openai',
        modelId: 'gpt-5.4-mini',
        requestId: 'client-run-1',
        messages: [
          {
            role: 'user',
            id: 'user-1',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
        providerOptions: {
          apiKey: 'malicious-client-key',
          headers: {
            Authorization: 'Bearer should-not-pass',
          },
          reasoning: {
            effort: 'high',
          },
        },
      },
      {
        Authorization: `Bearer ${tokens.accessToken}`,
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-gateway-request-id')).toBeTruthy();
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const frames = await readSseDataFrames(response);
    expect(frames).toEqual(events);

    const listResponse = await jsonRequest(
      fixture.app,
      '/admin/requests',
      'GET',
      undefined,
      fixture.adminHeaders
    );
    const listBody = (await listResponse.json()) as {
      requests: Array<{ id: string; status: string; clientRequestId: string | null }>;
    };
    expect(listBody.requests).toHaveLength(1);
    expect(listBody.requests[0]?.clientRequestId).toBe('client-run-1');

    const detailResponse = await jsonRequest(
      fixture.app,
      `/admin/requests/${listBody.requests[0]!.id}`,
      'GET',
      undefined,
      fixture.adminHeaders
    );
    const detailBody = (await detailResponse.json()) as {
      events: Array<{ event: unknown }>;
      request: {
        input: {
          providerOptions: {
            apiKey: string;
          };
        };
        output: BaseAssistantMessage<'openai'>;
        status: string;
      };
    };

    expect(detailBody.request.status).toBe('ok');
    expect(detailBody.events).toHaveLength(3);
    expect(detailBody.request.input.providerOptions.apiKey).toBe('[REDACTED]');
  });

  it('proxies Azure OpenAI with stored deployment URL settings', async () => {
    const tokens = await issueSenderTokens(fixture.app, fixture.adminHeaders);
    await jsonRequest(
      fixture.app,
      '/admin/providers/azure-openai/key',
      'PUT',
      {
        apiKey: 'server-azure-key',
        azureDeploymentUrl:
          'https://resource.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview',
        azureDeploymentName: 'prod-gpt-54-nano',
      },
      fixture.adminHeaders
    );

    const finalMessage = createAssistantMessage('azure-openai', 'gpt-5.4-nano');
    const events: BaseAssistantEvent<'azure-openai'>[] = [
      { type: 'start', message: finalMessage },
      { type: 'done', reason: 'stop', message: finalMessage },
    ];

    mockState.stream.mockImplementation((_model, _context, options) => {
      expect(options).toMatchObject({
        apiKey: 'server-azure-key',
        azureBaseURL: 'https://resource.cognitiveservices.azure.com/openai',
        azureApiVersion: '2025-04-01-preview',
        azureDeploymentName: 'prod-gpt-54-nano',
        reasoning: {
          effort: 'medium',
        },
      });
      expect(options).not.toHaveProperty('headers');

      return createStream(events, finalMessage);
    });

    const response = await jsonRequest(
      fixture.app,
      '/v1/llm/stream',
      'POST',
      {
        api: 'azure-openai',
        modelId: 'gpt-5.4-nano',
        messages: [],
        providerOptions: {
          apiKey: 'malicious-client-key',
          azureBaseURL: 'https://wrong.example.com/openai',
          azureApiVersion: 'wrong-version',
          headers: {
            Authorization: 'Bearer should-not-pass',
          },
          reasoning: {
            effort: 'medium',
          },
        },
      },
      {
        Authorization: `Bearer ${tokens.accessToken}`,
      }
    );

    expect(response.status).toBe(200);
    expect(await readSseDataFrames(response)).toEqual(events);
  });

  it('proxies image generation and stores sanitized payloads', async () => {
    const tokens = await issueSenderTokens(fixture.app, fixture.adminHeaders);
    await jsonRequest(
      fixture.app,
      '/admin/providers/openai/key',
      'PUT',
      { apiKey: 'server-openai-key' },
      fixture.adminHeaders
    );

    const imageResult = createImageResult();
    mockState.generateImage.mockImplementation((_model, _context, options) => {
      expect(options).toMatchObject({
        apiKey: 'server-openai-key',
        quality: 'high',
      });
      expect(options).not.toHaveProperty('headers');
      return imageResult;
    });

    const response = await jsonRequest(
      fixture.app,
      '/v1/image/generate',
      'POST',
      {
        api: 'openai',
        modelId: 'gpt-image-1.5',
        prompt: 'Draw a glossy sticker',
        images: [
          {
            type: 'image',
            data: Buffer.from('input-image').toString('base64'),
            mimeType: 'image/png',
          },
        ],
        providerOptions: {
          quality: 'high',
          headers: {
            Authorization: 'Bearer blocked',
          },
        },
      },
      {
        Authorization: `Bearer ${tokens.accessToken}`,
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { result: BaseImageResult<'openai'> };
    expect(body.result.id).toBe(imageResult.id);

    const listResponse = await jsonRequest(
      fixture.app,
      '/admin/requests',
      'GET',
      undefined,
      fixture.adminHeaders
    );
    const listBody = (await listResponse.json()) as {
      requests: Array<{ id: string }>;
    };

    const detailResponse = await jsonRequest(
      fixture.app,
      `/admin/requests/${listBody.requests[0]!.id}`,
      'GET',
      undefined,
      fixture.adminHeaders
    );
    const detailBody = (await detailResponse.json()) as {
      request: {
        input: {
          images: Array<{
            data: {
              redacted: boolean;
              byteLength: number;
            };
          }>;
        };
        output: {
          images: Array<{
            data: {
              redacted: boolean;
              byteLength: number;
            };
          }>;
        };
      };
    };

    expect(detailBody.request.input.images[0]?.data.redacted).toBe(true);
    expect(detailBody.request.output.images[0]?.data.byteLength).toBeGreaterThan(0);
  });

  it('returns 400 for unknown models before upstream calls', async () => {
    const tokens = await issueSenderTokens(fixture.app, fixture.adminHeaders);

    const response = await jsonRequest(
      fixture.app,
      '/v1/llm/stream',
      'POST',
      {
        api: 'openai',
        modelId: 'missing-model',
        messages: [],
      },
      {
        Authorization: `Bearer ${tokens.accessToken}`,
      }
    );

    expect(response.status).toBe(400);
    expect(mockState.stream).not.toHaveBeenCalled();
  });

  it('rotates refresh tokens and invalidates the old token', async () => {
    const tokens = await issueSenderTokens(fixture.app, fixture.adminHeaders);

    const refreshResponse = await jsonRequest(fixture.app, '/v1/auth/refresh', 'POST', {
      refreshToken: tokens.refreshToken,
    });
    expect(refreshResponse.status).toBe(200);
    const refreshed = (await refreshResponse.json()) as { refreshToken: string };
    expect(refreshed.refreshToken).not.toBe(tokens.refreshToken);

    const secondRefreshResponse = await jsonRequest(fixture.app, '/v1/auth/refresh', 'POST', {
      refreshToken: tokens.refreshToken,
    });
    expect(secondRefreshResponse.status).toBe(401);

    const revokeResponse = await jsonRequest(fixture.app, '/v1/auth/revoke', 'POST', {
      refreshToken: refreshed.refreshToken,
    });
    expect(revokeResponse.status).toBe(200);

    const revokedRefreshResponse = await jsonRequest(fixture.app, '/v1/auth/refresh', 'POST', {
      refreshToken: refreshed.refreshToken,
    });
    expect(revokedRefreshResponse.status).toBe(401);
  });

  it('blocks disabled senders', async () => {
    const tokens = await issueSenderTokens(fixture.app, fixture.adminHeaders);

    const rawDb = new Database(fixture.dbPath);
    rawDb.prepare('UPDATE senders SET disabled_at = ?').run(Date.now());
    rawDb.close();

    const response = await jsonRequest(
      fixture.app,
      '/v1/image/generate',
      'POST',
      {
        api: 'openai',
        modelId: 'gpt-image-1.5',
        prompt: 'Draw a kite',
      },
      {
        Authorization: `Bearer ${tokens.accessToken}`,
      }
    );

    expect(response.status).toBe(403);
  });

  it('marks aborted streams as aborted in request logs', async () => {
    const tokens = await issueSenderTokens(fixture.app, fixture.adminHeaders);
    await jsonRequest(
      fixture.app,
      '/admin/providers/openai/key',
      'PUT',
      { apiKey: 'server-openai-key' },
      fixture.adminHeaders
    );

    const firstMessage = createAssistantMessage();
    mockState.stream.mockImplementation((_model, _context, options) =>
      createAbortableStream(options.signal as AbortSignal, firstMessage)
    );

    const controller = new AbortController();
    const request = new Request('http://gateway/v1/llm/stream', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api: 'openai',
        modelId: 'gpt-5.4-mini',
        messages: [],
      }),
      signal: controller.signal,
    });

    const response = await fixture.app.fetch(request);
    expect(response.status).toBe(200);

    const reader = response.body?.getReader();
    await reader?.read();
    controller.abort();
    await reader?.cancel();

    await new Promise((resolve) => setTimeout(resolve, 20));

    const listResponse = await jsonRequest(
      fixture.app,
      '/admin/requests',
      'GET',
      undefined,
      fixture.adminHeaders
    );
    const listBody = (await listResponse.json()) as {
      requests: Array<{ id: string }>;
    };

    const detailResponse = await jsonRequest(
      fixture.app,
      `/admin/requests/${listBody.requests[0]!.id}`,
      'GET',
      undefined,
      fixture.adminHeaders
    );
    const detailBody = (await detailResponse.json()) as {
      request: {
        status: string;
      };
    };

    expect(detailBody.request.status).toBe('aborted');
  });
});

function createAbortableStream(
  signal: AbortSignal,
  message: BaseAssistantMessage<'openai'>
): AsyncIterable<BaseAssistantEvent<'openai'>> & {
  result: () => Promise<BaseAssistantMessage<'openai'>>;
} {
  return {
    async *[Symbol.asyncIterator]() {
      yield {
        type: 'start',
        message,
      };
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
      throw new Error('aborted');
    },
    async result() {
      return message;
    },
  };
}

function formRequest(
  app: Parameters<typeof jsonRequest>[0],
  path: string,
  body: Record<string, string>,
  headers: Record<string, string> = {}
): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
}

function createAssistantMessage<TApi extends 'openai' | 'azure-openai'>(
  api = 'openai' as TApi,
  modelId = 'gpt-5.4-mini'
): BaseAssistantMessage<TApi> {
  return {
    role: 'assistant',
    api,
    id: 'assistant-1',
    model: createModel(api, modelId),
    message: {} as BaseAssistantMessage<TApi>['message'],
    timestamp: 1,
    duration: 1,
    stopReason: 'stop',
    content: [
      {
        type: 'response',
        response: [{ type: 'text', content: 'Hello world' }],
      },
    ],
    usage: {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      cost: {
        input: 0.1,
        output: 0.2,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0.3,
      },
    },
  };
}

function createImageModel(api: 'openai', id: string) {
  return {
    api,
    id,
    name: id,
    baseUrl: `https://${api}.example.com`,
    input: ['text', 'image'],
    output: ['image'],
    cost: {
      inputText: 0,
      inputImage: 0,
      outputText: 0,
      outputImage: 0,
      reasoning: 0,
    },
  };
}

function createImageResult(): BaseImageResult<'openai'> {
  const model = createImageModel('openai', 'gpt-image-1.5');
  const image = createGeneratedImage('generated-image');

  return {
    id: 'image-result-1',
    api: 'openai',
    model,
    response: { ok: true } as BaseImageResult<'openai'>['response'],
    content: [image],
    images: [image],
    usage: {
      input: 2,
      inputText: 1,
      inputImage: 1,
      output: 3,
      outputText: 0,
      outputImage: 3,
      reasoning: 0,
      totalTokens: 5,
      cost: {
        inputText: 0.1,
        inputImage: 0.2,
        outputText: 0,
        outputImage: 0.4,
        reasoning: 0,
        total: 0.7,
      },
    },
    timestamp: 1,
    duration: 1,
  };
}

function createGeneratedImage(data: string): ImageContent {
  return {
    type: 'image',
    data: Buffer.from(data).toString('base64'),
    mimeType: 'image/png',
  };
}

function createModel<TApi extends 'openai' | 'azure-openai'>(api: TApi, id: string): Model<TApi> {
  return {
    api,
    id,
    name: id,
    input: ['text'],
    output: ['text'],
    contextWindow: 128_000,
    maxOutput: 4096,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
  };
}

function createStream<TApi extends 'openai' | 'azure-openai'>(
  events: BaseAssistantEvent<TApi>[],
  finalMessage: BaseAssistantMessage<TApi>
) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
    async result() {
      return finalMessage;
    },
  };
}
