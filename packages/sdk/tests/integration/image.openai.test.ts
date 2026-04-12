import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, expect, it } from 'vitest';

import {
  TRANSPARENT_MASK_PNG_BASE64,
  WHITE_PNG_BASE64,
} from '../../../core/tests/integration/helpers/image-fixtures.js';
import {
  describeIfAvailable,
  getIntegrationEnv,
} from '../../../core/tests/integration/helpers/live.js';
import { getSdkConfig } from '../../src/config.js';
import { image } from '../../src/index.js';
import { resolveProviderCredentials } from '../../src/keys.js';

import type { ImageResult } from '../../src/index.js';

const openAiApiKey = await resolveCentralOpenAIApiKey();
const hasOpenAIImageModelAccess = openAiApiKey
  ? await hasListedOpenAIModel(openAiApiKey, 'gpt-image-1.5')
  : false;
const describeIfOpenAI = describeIfAvailable(Boolean(openAiApiKey) && hasOpenAIImageModelAccess);
const artifactsDir = resolve(process.cwd(), 'tests/integration/.artifacts/openai-images');

describeIfOpenAI('SDK image() OpenAI integration', () => {
  let tempDirectory = '';
  let sourceImagePath = '';
  let maskImagePath = '';

  beforeAll(async () => {
    mkdirSync(artifactsDir, { recursive: true });

    tempDirectory = await mkdtemp(join(tmpdir(), 'llm-sdk-image-openai-'));
    sourceImagePath = join(tempDirectory, 'source.png');
    maskImagePath = join(tempDirectory, 'mask.png');

    writeFileSync(sourceImagePath, Buffer.from(WHITE_PNG_BASE64, 'base64'));
    writeFileSync(maskImagePath, Buffer.from(TRANSPARENT_MASK_PNG_BASE64, 'base64'));
  });

  afterAll(async () => {
    if (tempDirectory) {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it('generates multiple images, saves suffixed files, and preserves output settings', async () => {
    const result = await image({
      model: 'gpt-image',
      prompt:
        'Create two clean product-icon renderings of a cobalt kite and a coral paper boat on a transparent background. No text.',
      output: resolve(artifactsDir, 'sdk-openai-kite-boat.png'),
      settings: {
        background: 'transparent',
        compression: 60,
        count: 2,
        format: 'webp',
        moderation: 'low',
        quality: 'low',
        size: '1024x1024',
      },
    });

    expect(result.model).toBe('gpt-image');
    expect(result.api).toBe('openai');
    expect(result.providerModelId).toBe('gpt-image-1.5');
    expect(result.path).toBeUndefined();
    expect(result.paths).toEqual([
      resolve(artifactsDir, 'sdk-openai-kite-boat-1.webp'),
      resolve(artifactsDir, 'sdk-openai-kite-boat-2.webp'),
    ]);
    expect(result.result.images).toHaveLength(2);
    expect(result.result.response.data).toHaveLength(2);
    expect(
      result.result.images.every((generatedImage) => generatedImage.mimeType === 'image/webp')
    ).toBe(true);

    expectSavedImages(result);
    expect(result.usage.input).toBeGreaterThan(0);
    expect(result.usage.output).toBeGreaterThan(0);
    expect(result.usage.outputImage).toBeGreaterThan(0);
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(result.usage.cost.total).toBeGreaterThan(0);
  }, 180000);

  it('edits an input image with a mask and saves a single output path', async () => {
    const result = await image({
      model: 'gpt-image',
      prompt:
        'Transform this plain square into a simple green approval badge with a centered white checkmark, transparent background, no text.',
      output: resolve(artifactsDir, 'sdk-openai-approval-badge.png'),
      imagePaths: [sourceImagePath],
      maskPath: maskImagePath,
      settings: {
        background: 'transparent',
        fidelity: 'high',
        format: 'png',
        quality: 'low',
        size: '1024x1024',
      },
    });

    expect(result.model).toBe('gpt-image');
    expect(result.api).toBe('openai');
    expect(result.providerModelId).toBe('gpt-image-1.5');
    expect(result.path).toBe(resolve(artifactsDir, 'sdk-openai-approval-badge.png'));
    expect(result.paths).toEqual([resolve(artifactsDir, 'sdk-openai-approval-badge.png')]);
    expect(result.result.images.length).toBeGreaterThan(0);
    expect(
      result.result.images.every((generatedImage) => generatedImage.mimeType === 'image/png')
    ).toBe(true);

    expectSavedImages(result);
    expect(result.usage.inputImage).toBeGreaterThan(0);
    expect(result.usage.cost.inputImage).toBeGreaterThan(0);
    expect(result.usage.cost.total).toBeGreaterThan(0);
  }, 180000);
});

function expectSavedImages(result: ImageResult<'openai', 'gpt-image'>): void {
  for (const savedPath of result.paths) {
    expect(statSync(savedPath).size).toBeGreaterThan(0);
  }
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

async function resolveCentralOpenAIApiKey(): Promise<string | undefined> {
  const fallback = getIntegrationEnv('OPENAI_API_KEY');
  const result = await resolveProviderCredentials(getSdkConfig().keysFilePath, 'openai');

  if (result.ok) {
    return result.credentials.apiKey;
  }

  return fallback;
}
