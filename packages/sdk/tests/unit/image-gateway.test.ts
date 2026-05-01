import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetSdkConfig, setSdkConfig } from '../../src/config.js';
import { image } from '../../src/image.js';

import type { BaseImageResult, ImageContent, ImageModel } from '@ank1015/llm-core';

vi.mock('@ank1015/llm-core', () => ({
  generateImage: vi.fn(),
  getImageModel: vi.fn(),
}));

const { generateImage, getImageModel } = await import('@ank1015/llm-core');
const mockedCoreGenerateImage = vi.mocked(generateImage);
const mockedGetImageModel = vi.mocked(getImageModel);

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

describe('image gateway transport', () => {
  it('posts image payloads through the gateway and saves returned images locally', async () => {
    const directory = await createTempDirectory();
    const gatewayCredentialsPath = join(directory, 'gateway.json');
    const referencePath = join(directory, 'reference.png');
    const outputPath = join(directory, 'badge.png');
    const model = createImageModel('google', 'gemini-3.1-flash-image-preview');
    const generated = createGeneratedImage('generated-image', 'image/png');

    await writeFile(
      gatewayCredentialsPath,
      JSON.stringify({
        gatewayBaseUrl: 'https://gateway.example',
        accessToken: 'gateway-access-token',
        refreshToken: 'gateway-refresh-token',
        accessTokenExpiresAt: Date.now() + 900_000,
        refreshTokenExpiresAt: Date.now() + 30_000_000,
      }),
      'utf8'
    );
    await writeFile(referencePath, Buffer.from('reference-image'));
    setSdkConfig({ gatewayCredentialsPath });

    mockedGetImageModel.mockReturnValue(model as never);
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        result: createImageResult('google', model, {
          text: 'Generated badge',
          images: [generated],
        }),
      })
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await image({
      model: 'nano-banana',
      prompt: 'Turn this into a badge',
      output: outputPath,
      imagePaths: [referencePath],
      settings: {
        aspectRatio: '16:9',
        googleSearch: true,
        includeText: false,
      },
    });

    expect(mockedCoreGenerateImage).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    expect(body).toEqual({
      api: 'google',
      modelId: 'gemini-3.1-flash-image-preview',
      prompt: 'Turn this into a badge',
      images: [
        {
          type: 'image',
          data: Buffer.from('reference-image').toString('base64'),
          mimeType: 'image/png',
          metadata: {
            fileName: 'reference.png',
            path: referencePath,
          },
        },
      ],
      providerOptions: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: '16:9',
        },
        tools: [{ googleSearch: {} }],
      },
    });

    expect(result.path).toBe(outputPath);
    await expect(readFile(outputPath)).resolves.toEqual(Buffer.from('generated-image'));
  });
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'llm-sdk-image-gateway-'));
  tempDirectories.push(directory);
  return directory;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function createGeneratedImage(data: string, mimeType: string): ImageContent {
  return {
    type: 'image',
    data: Buffer.from(data).toString('base64'),
    mimeType,
  };
}

function createImageModel<TApi extends 'openai' | 'google'>(
  api: TApi,
  id: string
): ImageModel<TApi> {
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

function createImageResult<TApi extends 'openai' | 'google'>(
  api: TApi,
  model: ImageModel<TApi>,
  input: {
    text: string;
    images: ImageContent[];
  }
): BaseImageResult<TApi> {
  return {
    id: `${api}-image-result`,
    api,
    model,
    response: { ok: true } as BaseImageResult<TApi>['response'],
    content: [
      ...(input.text ? [{ type: 'text' as const, content: input.text }] : []),
      ...input.images,
    ],
    images: input.images,
    usage: {
      input: 1,
      inputText: 1,
      inputImage: 0,
      output: 1,
      outputText: 0,
      outputImage: 1,
      reasoning: 0,
      totalTokens: 2,
      cost: {
        inputText: 0,
        inputImage: 0,
        outputText: 0,
        outputImage: 0,
        reasoning: 0,
        total: 0,
      },
    },
    timestamp: 1,
    duration: 1,
  };
}
