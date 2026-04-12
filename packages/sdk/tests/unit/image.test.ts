import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImageInputError, image } from '../../src/image.js';
import { resolveProviderCredentials } from '../../src/keys.js';

import type { BaseImageResult, ImageContent, ImageModel } from '@ank1015/llm-core';

vi.mock('../../src/keys.js', () => ({
  resolveProviderCredentials: vi.fn(),
}));

vi.mock('@ank1015/llm-core', () => ({
  generateImage: vi.fn(),
  getImageModel: vi.fn(),
}));

const mockedResolveProviderCredentials = vi.mocked(resolveProviderCredentials);

const { generateImage, getImageModel } = await import('@ank1015/llm-core');
const mockedCoreGenerateImage = vi.mocked(generateImage);
const mockedGetImageModel = vi.mocked(getImageModel);

const tempDirectories: string[] = [];

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'llm-sdk-image-'));
  tempDirectories.push(directory);
  return directory;
}

describe('image', () => {
  it('maps gpt-image to the OpenAI core model and saves the generated file using the real mime-type extension', async () => {
    const directory = await createTempDirectory();
    const model = createImageModel('openai', 'gpt-image-1.5');
    const imageBase64 = Buffer.from('openai-image').toString('base64');

    mockedResolveProviderCredentials.mockResolvedValue({
      ok: true,
      provider: 'openai',
      credentials: {
        apiKey: 'openai-key',
      },
    });
    mockedGetImageModel.mockReturnValue(model as never);
    mockedCoreGenerateImage.mockResolvedValue(
      createImageResult('openai', model, {
        text: '',
        images: [
          {
            type: 'image',
            data: imageBase64,
            mimeType: 'image/webp',
            metadata: {
              generationProvider: 'openai',
            },
          },
        ],
      }) as never
    );

    const result = await image({
      model: 'gpt-image',
      prompt: 'Draw a glossy otter sticker',
      output: join(directory, 'otter.png'),
      keysFilePath: '/tmp/openai-keys.env',
      settings: {
        background: 'transparent',
        compression: 55,
        count: 1,
        format: 'webp',
        moderation: 'low',
        quality: 'high',
        size: '1024x1024',
      },
    });

    expect(mockedResolveProviderCredentials).toHaveBeenCalledWith('/tmp/openai-keys.env', 'openai');
    expect(mockedGetImageModel).toHaveBeenCalledWith('openai', 'gpt-image-1.5');
    expect(mockedCoreGenerateImage).toHaveBeenCalledWith(
      model,
      { prompt: 'Draw a glossy otter sticker' },
      {
        apiKey: 'openai-key',
        background: 'transparent',
        output_compression: 55,
        n: 1,
        output_format: 'webp',
        moderation: 'low',
        quality: 'high',
        size: '1024x1024',
      },
      undefined
    );

    const expectedPath = join(directory, 'otter.webp');
    expect(result).toEqual(
      expect.objectContaining({
        model: 'gpt-image',
        api: 'openai',
        providerModelId: 'gpt-image-1.5',
        path: expectedPath,
        paths: [expectedPath],
        text: '',
      })
    );
    await expect(readFile(expectedPath)).resolves.toEqual(Buffer.from('openai-image'));
  });

  it('adds numeric suffixes when the provider returns multiple images', async () => {
    const directory = await createTempDirectory();
    const model = createImageModel('openai', 'gpt-image-1.5');

    mockedResolveProviderCredentials.mockResolvedValue({
      ok: true,
      provider: 'openai',
      credentials: {
        apiKey: 'openai-key',
      },
    });
    mockedGetImageModel.mockReturnValue(model as never);
    mockedCoreGenerateImage.mockResolvedValue(
      createImageResult('openai', model, {
        text: '',
        images: [
          createGeneratedImage('image-1', 'image/png'),
          createGeneratedImage('image-2', 'image/jpeg'),
        ],
      }) as never
    );

    const result = await image({
      model: 'gpt-image',
      prompt: 'Create two icons',
      output: join(directory, 'icons.webp'),
      keysFilePath: '/tmp/openai-keys.env',
      settings: {
        count: 2,
      },
    });

    const firstPath = join(directory, 'icons-1.png');
    const secondPath = join(directory, 'icons-2.jpg');

    expect(result.path).toBeUndefined();
    expect(result.paths).toEqual([firstPath, secondPath]);
    await expect(readFile(firstPath)).resolves.toEqual(Buffer.from('image-1'));
    await expect(readFile(secondPath)).resolves.toEqual(Buffer.from('image-2'));
  });

  it('maps nano-banana settings to the Google image runtime and reads reference images from local paths', async () => {
    const directory = await createTempDirectory();
    const inputPath = join(directory, 'reference.png');
    const inputBytes = Buffer.from('reference-image');
    const model = createImageModel('google', 'gemini-3.1-flash-image-preview');

    await writeFile(inputPath, inputBytes);

    mockedResolveProviderCredentials.mockResolvedValue({
      ok: true,
      provider: 'google',
      credentials: {
        apiKey: 'google-key',
      },
    });
    mockedGetImageModel.mockReturnValue(model as never);
    mockedCoreGenerateImage.mockResolvedValue(
      createImageResult('google', model, {
        text: 'Generated with a bright accent color.',
        images: [createGeneratedImage('google-image', 'image/png')],
      }) as never
    );

    const result = await image({
      model: 'nano-banana',
      prompt: 'Turn this into an emerald badge',
      output: join(directory, 'badge'),
      imagePaths: [inputPath],
      keysFilePath: '/tmp/google-keys.env',
      settings: {
        aspectRatio: '16:9',
        imageSize: '2K',
        googleSearch: true,
        includeText: false,
      },
    });

    expect(mockedResolveProviderCredentials).toHaveBeenCalledWith('/tmp/google-keys.env', 'google');
    expect(mockedGetImageModel).toHaveBeenCalledWith('google', 'gemini-3.1-flash-image-preview');
    expect(mockedCoreGenerateImage).toHaveBeenCalledWith(
      model,
      {
        prompt: 'Turn this into an emerald badge',
        images: [
          {
            type: 'image',
            data: inputBytes.toString('base64'),
            mimeType: 'image/png',
            metadata: {
              fileName: 'reference.png',
              path: inputPath,
            },
          },
        ],
      },
      {
        apiKey: 'google-key',
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: '16:9',
          imageSize: '2K',
        },
        tools: [{ googleSearch: {} }],
      },
      undefined
    );

    expect(result.path).toBe(join(directory, 'badge.png'));
    expect(result.text).toBe('Generated with a bright accent color.');
    await expect(readFile(join(directory, 'badge.png'))).resolves.toEqual(
      Buffer.from('google-image')
    );
  });

  it('throws ImageInputError when provider credentials are unavailable', async () => {
    const model = createImageModel('openai', 'gpt-image-1.5');

    mockedGetImageModel.mockReturnValue(model as never);
    mockedResolveProviderCredentials.mockResolvedValue({
      ok: false,
      provider: 'openai',
      error: {
        code: 'missing_provider_credentials',
        message: 'Missing credentials for provider openai: OPENAI_API_KEY',
        provider: 'openai',
        path: '/tmp/openai-keys.env',
        missing: [
          {
            option: 'apiKey',
            env: 'OPENAI_API_KEY',
            aliases: [],
          },
        ],
      },
    });

    await expect(
      image({
        model: 'gpt-image',
        prompt: 'Draw a ship',
        output: '/tmp/ship.png',
        keysFilePath: '/tmp/openai-keys.env',
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'ImageInputError',
        code: 'missing_provider_credentials',
        model: 'gpt-image',
        keysFilePath: '/tmp/openai-keys.env',
      })
    );

    await expect(
      image({
        model: 'gpt-image',
        prompt: 'Draw a ship',
        output: '/tmp/ship.png',
        keysFilePath: '/tmp/openai-keys.env',
      })
    ).rejects.toBeInstanceOf(ImageInputError);
    expect(mockedCoreGenerateImage).not.toHaveBeenCalled();
  });
});

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
