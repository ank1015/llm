import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runGatewayImageRequest } from '../../src/gateway.js';
import { ImageInputError, image } from '../../src/image.js';

import type { BaseImageResult, ImageContent, ImageModel } from '@ank1015/llm-core';

vi.mock('../../src/gateway.js', () => ({
  runGatewayImageRequest: vi.fn(),
}));

const mockedRunGatewayImageRequest = vi.mocked(runGatewayImageRequest);
const tempDirectories: string[] = [];

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('image', () => {
  it('sends top-level image options through the gateway and saves the returned file', async () => {
    const directory = await createTempDirectory();
    const imageBase64 = Buffer.from('azure-image').toString('base64');

    mockedRunGatewayImageRequest.mockResolvedValue(
      createImageResult({
        images: [
          {
            type: 'image',
            data: imageBase64,
            mimeType: 'image/webp',
            metadata: {
              generationProvider: 'azure-openai',
            },
          },
        ],
      })
    );

    const result = await image({
      prompt: 'Draw a glossy otter sticker',
      output: join(directory, 'otter.png'),
      background: 'opaque',
      compression: 55,
      count: 1,
      format: 'webp',
      moderation: 'low',
      quality: 'high',
      size: '1024x1024',
      requestId: 'image-request-1',
    });

    expect(mockedRunGatewayImageRequest).toHaveBeenCalledWith({
      api: 'azure-openai',
      modelId: 'gpt-image-2',
      context: { prompt: 'Draw a glossy otter sticker' },
      providerOptions: {
        background: 'opaque',
        output_compression: 55,
        n: 1,
        output_format: 'webp',
        moderation: 'low',
        quality: 'high',
        size: '1024x1024',
      },
      requestId: 'image-request-1',
    });

    const expectedPath = join(directory, 'otter.webp');
    expect(result).toEqual(
      expect.objectContaining({
        path: expectedPath,
        paths: [expectedPath],
        text: '',
      })
    );
    await expect(readFile(expectedPath)).resolves.toEqual(Buffer.from('azure-image'));
  });

  it('adds numeric suffixes when the gateway returns multiple images', async () => {
    const directory = await createTempDirectory();

    mockedRunGatewayImageRequest.mockResolvedValue(
      createImageResult({
        images: [
          createGeneratedImage('image-1', 'image/png'),
          createGeneratedImage('image-2', 'image/jpeg'),
        ],
      })
    );

    const result = await image({
      prompt: 'Create two icons',
      output: join(directory, 'icons.webp'),
      count: 2,
    });

    const firstPath = join(directory, 'icons-1.png');
    const secondPath = join(directory, 'icons-2.jpg');

    expect(result.path).toBeUndefined();
    expect(result.paths).toEqual([firstPath, secondPath]);
    await expect(readFile(firstPath)).resolves.toEqual(Buffer.from('image-1'));
    await expect(readFile(secondPath)).resolves.toEqual(Buffer.from('image-2'));
  });

  it('reads reference and mask images from local paths', async () => {
    const directory = await createTempDirectory();
    const inputPath = join(directory, 'reference.png');
    const maskPath = join(directory, 'mask.png');
    const inputBytes = Buffer.from('reference-image');
    const maskBytes = Buffer.from('mask-image');

    await writeFile(inputPath, inputBytes);
    await writeFile(maskPath, maskBytes);
    mockedRunGatewayImageRequest.mockResolvedValue(
      createImageResult({
        images: [createGeneratedImage('edited-image', 'image/png')],
      })
    );

    const result = await image({
      prompt: 'Turn this into an emerald badge',
      output: join(directory, 'badge'),
      inputImages: [inputPath],
      mask: maskPath,
    });

    expect(mockedRunGatewayImageRequest).toHaveBeenCalledWith({
      api: 'azure-openai',
      modelId: 'gpt-image-2',
      context: {
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
        mask: {
          type: 'image',
          data: maskBytes.toString('base64'),
          mimeType: 'image/png',
          metadata: {
            fileName: 'mask.png',
            path: maskPath,
          },
        },
      },
      providerOptions: {},
    });

    expect(result.path).toBe(join(directory, 'badge.png'));
    await expect(readFile(join(directory, 'badge.png'))).resolves.toEqual(
      Buffer.from('edited-image')
    );
  });

  it('throws ImageInputError when mask is provided without inputImages', async () => {
    await expect(
      image({
        prompt: 'Edit this',
        output: '/tmp/edit.png',
        mask: '/tmp/mask.png',
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'ImageInputError',
        code: 'invalid_image_input',
      })
    );

    expect(mockedRunGatewayImageRequest).not.toHaveBeenCalled();
  });

  it('validates count and compression before sending the request', async () => {
    await expect(
      image({
        prompt: 'Create an icon',
        output: '/tmp/icon.png',
        count: 0,
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'ImageInputError',
        message: 'count must be a positive integer.',
      })
    );

    await expect(
      image({
        prompt: 'Create an icon',
        output: '/tmp/icon.png',
        compression: 50,
        format: 'png',
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'ImageInputError',
        message: 'compression can only be used with format: "jpeg" or "webp".',
      })
    );

    expect(mockedRunGatewayImageRequest).not.toHaveBeenCalled();
  });
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'llm-sdk-image-'));
  tempDirectories.push(directory);
  return directory;
}

function createGeneratedImage(data: string, mimeType: string): ImageContent {
  return {
    type: 'image',
    data: Buffer.from(data).toString('base64'),
    mimeType,
  };
}

function createImageModel(): ImageModel<'azure-openai'> {
  return {
    api: 'azure-openai',
    id: 'gpt-image-2',
    name: 'GPT Image 2',
    baseUrl: 'https://azure.example.com/openai',
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

function createImageResult(input: {
  text?: string;
  images: ImageContent[];
}): BaseImageResult<'azure-openai'> {
  return {
    id: 'azure-openai-image-result',
    api: 'azure-openai',
    model: createImageModel(),
    response: { ok: true } as BaseImageResult<'azure-openai'>['response'],
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
