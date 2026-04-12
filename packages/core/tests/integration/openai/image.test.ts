import { beforeAll, describe, expect, it } from 'vitest';

import { calculateImageCost, generateImage, getImageModel } from '../../../src/index.js';
import { WHITE_PNG_BASE64, TRANSPARENT_MASK_PNG_BASE64 } from '../helpers/image-fixtures.js';
import { describeIfAvailable, getIntegrationEnv } from '../helpers/live.js';

import type { BaseImageResult, ImageModel } from '../../../src/types/index.js';

const apiKey = getIntegrationEnv('OPENAI_API_KEY')!;
const hasOpenAIImageModelAccess = apiKey
  ? await hasListedOpenAIModel(apiKey, 'gpt-image-1.5')
  : false;
const describeIfOpenAI = describeIfAvailable(Boolean(apiKey) && hasOpenAIImageModelAccess);

describeIfOpenAI('OpenAI Image Integration', () => {
  let model: ImageModel<'openai'>;

  beforeAll(() => {
    const testModel = getImageModel('openai', 'gpt-image-1.5');
    if (!testModel) {
      throw new Error('Test model gpt-image-1.5 not found');
    }

    model = testModel;
  });

  it('should generate multiple images with normalized usage and cost', async () => {
    const result = await generateImage(
      model,
      {
        prompt:
          'Create two clean product-icon renderings of a cobalt kite and a coral paper boat on a transparent background. No text.',
      },
      {
        apiKey,
        background: 'transparent',
        moderation: 'low',
        n: 2,
        output_compression: 60,
        output_format: 'webp',
        quality: 'low',
        size: '1024x1024',
        user: 'llm-core-openai-image-integration',
      },
      'openai-image-generate-1'
    );

    expect(result.id).toBe('openai-image-generate-1');
    expect(result.api).toBe('openai');
    expect(result.model).toBe(model);
    expect(result.images).toHaveLength(2);
    expect(result.content).toEqual(result.images);
    expect(result.response.data).toHaveLength(2);
    expect(result.images.every((image) => image.mimeType === 'image/webp')).toBe(true);

    expectImagePayloads(result);
    expectImageUsage(result);
    expectImageCost(model, result);
  }, 180000);

  it('should edit an image with a mask and preserve normalized image usage', async () => {
    const result = await generateImage(
      model,
      {
        prompt:
          'Transform this plain square into a simple green approval badge with a centered white checkmark, transparent background, no text.',
        images: [
          {
            type: 'image',
            data: WHITE_PNG_BASE64,
            mimeType: 'image/png',
            metadata: { fileName: 'source.png' },
          },
        ],
        mask: {
          type: 'image',
          data: TRANSPARENT_MASK_PNG_BASE64,
          mimeType: 'image/png',
          metadata: { fileName: 'mask.png' },
        },
      },
      {
        apiKey,
        background: 'transparent',
        input_fidelity: 'high',
        n: 1,
        output_format: 'png',
        quality: 'low',
        size: '1024x1024',
        user: 'llm-core-openai-image-edit-integration',
      },
      'openai-image-edit-1'
    );

    expect(result.id).toBe('openai-image-edit-1');
    expect(result.api).toBe('openai');
    expect(result.images.length).toBeGreaterThan(0);
    expect(result.images.every((image) => image.mimeType === 'image/png')).toBe(true);

    expectImagePayloads(result);
    expectImageUsage(result);
    expect(result.usage.inputImage).toBeGreaterThan(0);
    expect(result.usage.cost.inputImage).toBeGreaterThan(0);
    expectImageCost(model, result);
  }, 180000);
});

function expectImagePayloads(result: BaseImageResult<'openai'>): void {
  for (const image of result.images) {
    expect(Buffer.from(image.data, 'base64').byteLength).toBeGreaterThan(0);
    expect(image.metadata?.generationProvider).toBe('openai');
    expect(image.metadata?.generationStage).toBe('final');
  }
}

function expectImageUsage(result: BaseImageResult<'openai'>): void {
  expect(result.usage.input).toBeGreaterThan(0);
  expect(result.usage.output).toBeGreaterThan(0);
  expect(result.usage.outputImage).toBeGreaterThan(0);
  expect(result.usage.totalTokens).toBeGreaterThan(0);
  expect(result.duration).toBeGreaterThanOrEqual(0);
}

function expectImageCost(model: ImageModel<'openai'>, result: BaseImageResult<'openai'>): void {
  const { cost, ...usage } = result.usage;

  expect(cost).toEqual(calculateImageCost(model, usage));
  expect(cost.total).toBeGreaterThan(0);
}

async function hasListedOpenAIModel(apiKey: string, modelId: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string }>;
    };

    return Boolean(payload.data?.some((model) => model.id === modelId));
  } catch {
    return false;
  }
}
