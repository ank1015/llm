import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createKeyRoutes } = await import('../../../src/routes/keys.js');

let tempDir: string;
let keysFilePath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'llm-server-keys-'));
  keysFilePath = join(tempDir, 'keys.env');
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function jsonRequest(
  route: { request: (input: string, init?: RequestInit) => Promise<Response> },
  path: string,
  method: string,
  body?: unknown
): Promise<Response> {
  return route.request(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('key routes', () => {
  it('lists, sets, gets, and deletes provider credentials', async () => {
    const keyRoutes = createKeyRoutes({ keysFilePath });

    const initialListResponse = await jsonRequest(keyRoutes, '/keys', 'GET');
    expect(initialListResponse.status).toBe(200);
    const initialList = (await initialListResponse.json()) as {
      providers: Array<Record<string, unknown>>;
    };
    expect(initialList.providers.find((provider) => provider.provider === 'openai')).toMatchObject({
      provider: 'openai',
      hasKey: false,
    });

    const setResponse = await jsonRequest(keyRoutes, '/keys/openai', 'PUT', {
      credentials: {
        apiKey: 'sk-openai-secret-1234',
      },
    });
    expect(setResponse.status).toBe(200);
    expect(await setResponse.json()).toEqual({ ok: true });

    const listResponse = await jsonRequest(keyRoutes, '/keys', 'GET');
    const listed = (await listResponse.json()) as {
      providers: Array<Record<string, unknown>>;
    };
    expect(listed.providers.find((provider) => provider.provider === 'openai')).toMatchObject({
      provider: 'openai',
      hasKey: true,
      credentials: {
        apiKey: 'sk-o****1234',
      },
    });

    const detailsResponse = await jsonRequest(keyRoutes, '/keys/openai', 'GET');
    expect(detailsResponse.status).toBe(200);
    expect(await detailsResponse.json()).toEqual({
      provider: 'openai',
      credentials: {
        apiKey: 'sk-openai-secret-1234',
      },
      fields: [
        {
          option: 'apiKey',
          env: 'OPENAI_API_KEY',
          aliases: [],
        },
      ],
    });

    const deleteResponse = await jsonRequest(keyRoutes, '/keys/openai', 'DELETE');
    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toEqual({ deleted: true });

    const afterDeleteResponse = await jsonRequest(keyRoutes, '/keys/openai', 'GET');
    expect(afterDeleteResponse.status).toBe(200);
    expect(await afterDeleteResponse.json()).toEqual({
      provider: 'openai',
      credentials: {},
      fields: [
        {
          option: 'apiKey',
          env: 'OPENAI_API_KEY',
          aliases: [],
        },
      ],
    });
  });

  it('handles unknown providers and reload support', async () => {
    const reloadCredentials = vi.fn().mockResolvedValue({
      apiKey: 'codex-token-1234567890',
      'chatgpt-account-id': 'acct-1234',
    });
    const keyRoutes = createKeyRoutes({ keysFilePath, reloadCredentials });

    const unknownResponse = await jsonRequest(keyRoutes, '/keys/not-a-provider', 'GET');
    expect(unknownResponse.status).toBe(400);
    expect(await unknownResponse.json()).toEqual({
      error: 'Unknown provider: not-a-provider',
    });

    const reloadUnsupportedResponse = await jsonRequest(keyRoutes, '/keys/openai/reload', 'POST');
    expect(reloadUnsupportedResponse.status).toBe(400);
    expect(await reloadUnsupportedResponse.json()).toEqual({
      error: 'Reload not supported for openai',
    });

    const reloadSupportedResponse = await jsonRequest(keyRoutes, '/keys/codex/reload', 'POST');
    expect(reloadSupportedResponse.status).toBe(200);
    expect(await reloadSupportedResponse.json()).toEqual({ ok: true });
    expect(reloadCredentials).toHaveBeenCalledWith('codex');

    const detailsResponse = await jsonRequest(keyRoutes, '/keys/codex', 'GET');
    expect(detailsResponse.status).toBe(200);
    expect(await detailsResponse.json()).toEqual({
      provider: 'codex',
      credentials: {
        apiKey: 'codex-token-1234567890',
        'chatgpt-account-id': 'acct-1234',
      },
      fields: [
        {
          option: 'apiKey',
          env: 'CODEX_API_KEY',
          aliases: [],
        },
        {
          option: 'chatgpt-account-id',
          env: 'CODEX_CHATGPT_ACCOUNT_ID',
          aliases: ['CHATGPT_ACCOUNT_ID'],
        },
      ],
    });
  });
});
