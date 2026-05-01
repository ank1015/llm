import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createApp } = await import('../../../src/app.js');

let homeRoot: string;

beforeEach(async () => {
  homeRoot = await mkdtemp(join(tmpdir(), 'llm-server-gateway-home-'));
  vi.stubEnv('HOME', homeRoot);
  vi.stubEnv('LLM_GATEWAY_BASE_URL', 'https://gateway.example.test');
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(homeRoot, { recursive: true, force: true });
});

describe('gateway routes', () => {
  it('returns an anonymous session when gateway credentials are missing', async () => {
    const app = createApp();
    const response = await app.request('/api/gateway/session');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      authenticated: false,
      credentialsPath: join(homeRoot, '.llm', 'gateway.json'),
      gatewayBaseUrl: 'https://gateway.example.test',
    });
  });

  it('logs in through the hosted gateway and writes credentials without returning tokens', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        accessToken: 'access-token',
        accessTokenExpiresAt: 123,
        refreshToken: 'refresh-token',
        refreshTokenExpiresAt: 456,
        refreshTokenId: 'refresh-token-id',
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const app = createApp();
    const response = await app.request('/api/gateway/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ' alice ', password: 'secret' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      session: Record<string, unknown>;
    };
    expect(body).toMatchObject({
      ok: true,
      session: {
        authenticated: true,
        credentialsPath: join(homeRoot, '.llm', 'gateway.json'),
        gatewayBaseUrl: 'https://gateway.example.test',
        accessTokenExpiresAt: 123,
        refreshTokenExpiresAt: 456,
      },
    });
    expect(JSON.stringify(body)).not.toContain('access-token');
    expect(JSON.stringify(body)).not.toContain('refresh-token');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gateway.example.test/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'alice', password: 'secret' }),
      })
    );

    const saved = JSON.parse(await readFile(join(homeRoot, '.llm', 'gateway.json'), 'utf8')) as {
      accessToken: string;
      refreshToken: string;
      refreshTokenId: string;
      gatewayBaseUrl: string;
    };
    expect(saved).toMatchObject({
      gatewayBaseUrl: 'https://gateway.example.test',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      refreshTokenId: 'refresh-token-id',
    });
  });

  it('returns a login error and does not write credentials when gateway auth fails', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: 'Invalid login' }, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    await mkdir(join(homeRoot, '.llm'), { recursive: true });

    const app = createApp();
    const response = await app.request('/api/gateway/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'wrong' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      message: 'Invalid login',
      session: {
        authenticated: false,
        credentialsPath: join(homeRoot, '.llm', 'gateway.json'),
        gatewayBaseUrl: 'https://gateway.example.test',
      },
    });
    await expect(readFile(join(homeRoot, '.llm', 'gateway.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
