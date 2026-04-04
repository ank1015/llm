import { beforeAll, describe, expect, it } from 'vitest';

import { calculateImageCost, generateImage, getImageModel } from '../../../src/index.js';
import { WHITE_PNG_BASE64 } from '../helpers/image-fixtures.js';
import { describeIfAvailable, getIntegrationEnv } from '../helpers/live.js';

import type { BaseImageResult, ImageModel } from '../../../src/types/index.js';

const apiKey = getIntegrationEnv('GEMINI_API_KEY')!;
const describeIfGoogle = describeIfAvailable(Boolean(apiKey));

describeIfGoogle('Google Image Integration', () => {
  let flashModel: ImageModel<'google'>;
  let proModel: ImageModel<'google'>;

  beforeAll(() => {
    const flash = getImageModel('google', 'gemini-3.1-flash-image-preview');
    const pro = getImageModel('google', 'gemini-3-pro-image-preview');

    if (!flash) {
      throw new Error('Test model gemini-3.1-flash-image-preview not found');
    }

    if (!pro) {
      throw new Error('Test model gemini-3-pro-image-preview not found');
    }

    flashModel = flash;
    proModel = pro;
  });

  it('should generate an image with Gemini 3.1 Flash and force IMAGE output even when TEXT is requested', async () => {
    const result = await generateImage(
      flashModel,
      {
        prompt:
          'Create a polished travel-sticker illustration of a solar-powered tea cart in a city park. Include the readable headline "SUN TEA".',
      },
      {
        apiKey,
        responseModalities: ['TEXT'],
        imageConfig: {
          aspectRatio: '1:1',
          imageSize: '1K',
        },
      },
      'google-image-flash-generate-1'
    );

    expect(result.id).toBe('google-image-flash-generate-1');
    expect(result.api).toBe('google');
    expect(result.model).toBe(flashModel);
    expect(result.images.length).toBeGreaterThan(0);

    expectImagePayloads(result);
    expectImageUsage(result);
    expect(result.usage.outputImage).toBeGreaterThan(0);
    expectImageCost(flashModel, result);
  }, 180000);

  it('should accept reference images with Gemini 3.1 Flash image generation', async () => {
    const result = await generateImage(
      flashModel,
      {
        prompt:
          'Use this plain square as a starting point and transform it into a cinematic emerald badge icon with soft highlights, no text.',
        images: [
          {
            type: 'image',
            data: WHITE_PNG_BASE64,
            mimeType: 'image/png',
          },
        ],
      },
      {
        apiKey,
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: '16:9',
          imageSize: '1K',
        },
      },
      'google-image-flash-reference-1'
    );

    expect(result.id).toBe('google-image-flash-reference-1');
    expect(result.images.length).toBeGreaterThan(0);
    expect(result.usage.inputImage).toBeGreaterThan(0);
    expect(result.usage.cost.inputImage).toBeGreaterThan(0);

    expectImagePayloads(result);
    expectImageUsage(result);
    expectImageCost(flashModel, result);
  }, 180000);

  it('should generate an image with Gemini 3 Pro Image and compute cost from model pricing', async () => {
    const result = await generateImage(
      proModel,
      {
        prompt:
          'Create a premium editorial-style poster of a moonlit greenhouse filled with brass instruments, crisp typography, and luxury brand art direction.',
      },
      {
        apiKey,
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: '1:1',
          imageSize: '1K',
        },
      },
      'google-image-pro-generate-1'
    );

    expect(result.id).toBe('google-image-pro-generate-1');
    expect(result.api).toBe('google');
    expect(result.model).toBe(proModel);
    expect(result.images.length).toBeGreaterThan(0);

    expectImagePayloads(result);
    expectImageUsage(result);
    expect(result.usage.outputImage).toBeGreaterThan(0);
    expectImageCost(proModel, result);
  }, 180000);
});

function expectImagePayloads(result: BaseImageResult<'google'>): void {
  for (const image of result.images) {
    expect(Buffer.from(image.data, 'base64').byteLength).toBeGreaterThan(0);
    expect(image.mimeType.startsWith('image/')).toBe(true);
    expect(image.metadata?.generationProvider).toBe('google');
    expect(image.metadata?.generationStage).toBe('final');
  }
}

function expectImageUsage(result: BaseImageResult<'google'>): void {
  expect(result.usage.input).toBeGreaterThan(0);
  expect(result.usage.output).toBeGreaterThan(0);
  expect(result.usage.totalTokens).toBeGreaterThan(0);
  expect(result.duration).toBeGreaterThanOrEqual(0);
}

function expectImageCost(model: ImageModel<'google'>, result: BaseImageResult<'google'>): void {
  const { cost, ...usage } = result.usage;

  expect(cost).toEqual(calculateImageCost(model, usage));
  expect(cost.total).toBeGreaterThan(0);
}
