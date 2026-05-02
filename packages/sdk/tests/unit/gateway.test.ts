import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetSdkConfig, setSdkConfig } from '../../src/config.js';
import {
  GatewayTransportError,
  getGatewayAccessCredentials,
  readGatewayCredentials,
  runGatewayImageRequest,
} from '../../src/gateway.js';

import type { GatewayCredentials } from '../../src/gateway.js';

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

describe('gateway credentials', () => {
  it('throws a stable error when the gateway credentials file is missing', async () => {
    const directory = await createTempDirectory();

    await expect(readGatewayCredentials(join(directory, 'missing.json'))).rejects.toMatchObject({
      name: 'GatewayTransportError',
      code: 'gateway_credentials_not_found',
    });
  });

  it('throws a stable error when the gateway credentials file is malformed', async () => {
    const filePath = await createGatewayFile('{');

    await expect(readGatewayCredentials(filePath)).rejects.toMatchObject({
      name: 'GatewayTransportError',
      code: 'gateway_credentials_invalid',
    });
  });

  it('refreshes expired access tokens and rewrites the rotated credentials', async () => {
    const filePath = await createGatewayFile(
      JSON.stringify(
        createCredentials({
          accessToken: 'old-access',
          refreshToken: 'old-refresh',
          accessTokenExpiresAt: Date.now() - 1_000,
        })
      )
    );

    const fetchMock = vi.fn(async () =>
      jsonResponse({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        accessTokenExpiresAt: Date.now() + 900_000,
        refreshTokenExpiresAt: Date.now() + 30_000_000,
        refreshTokenId: 'refresh-token-id',
      })
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const credentials = await getGatewayAccessCredentials({ path: filePath });

    expect(fetchMock).toHaveBeenCalledWith('https://gateway.example/v1/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: 'old-refresh' }),
    });
    expect(credentials.accessToken).toBe('new-access');

    const stored = JSON.parse(await readFile(filePath, 'utf8')) as GatewayCredentials;
    expect(stored).toEqual(
      expect.objectContaining({
        gatewayBaseUrl: 'https://gateway.example',
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        refreshTokenId: 'refresh-token-id',
      })
    );
  });

  it('refreshes once and retries a gateway request after a 401', async () => {
    const filePath = await createGatewayFile(
      JSON.stringify(
        createCredentials({
          accessToken: 'stale-access',
          refreshToken: 'refresh-token',
        })
      )
    );
    setSdkConfig({ gatewayCredentialsPath: filePath });

    const imageResult = {
      id: 'image-result',
      api: 'azure-openai',
      model: { api: 'azure-openai', id: 'gpt-image-2' },
      response: {},
      content: [],
      images: [],
      usage: emptyImageUsage(),
      timestamp: Date.now(),
      duration: 1,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Access token is invalid.' }, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          accessToken: 'fresh-access',
          refreshToken: 'fresh-refresh',
          accessTokenExpiresAt: Date.now() + 900_000,
          refreshTokenExpiresAt: Date.now() + 30_000_000,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ result: imageResult }));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      runGatewayImageRequest({
        api: 'azure-openai',
        modelId: 'gpt-image-2',
        context: { prompt: 'draw a tile' },
      })
    ).resolves.toEqual(imageResult);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://gateway.example/v1/image/generate',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer stale-access',
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://gateway.example/v1/image/generate',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-access',
        }),
      })
    );
  });
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'llm-sdk-gateway-'));
  tempDirectories.push(directory);
  return directory;
}

async function createGatewayFile(content: string): Promise<string> {
  const directory = await createTempDirectory();
  const filePath = join(directory, 'gateway.json');
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

function createCredentials(overrides: Partial<GatewayCredentials> = {}): GatewayCredentials {
  return {
    gatewayBaseUrl: 'https://gateway.example',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    accessTokenExpiresAt: Date.now() + 900_000,
    refreshTokenExpiresAt: Date.now() + 30_000_000,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function emptyImageUsage() {
  return {
    input: 0,
    inputText: 0,
    inputImage: 0,
    output: 0,
    outputText: 0,
    outputImage: 0,
    reasoning: 0,
    totalTokens: 0,
    cost: {
      inputText: 0,
      inputImage: 0,
      outputText: 0,
      outputImage: 0,
      reasoning: 0,
      total: 0,
    },
  };
}
