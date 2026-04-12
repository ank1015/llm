import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { generateImage as coreGenerateImage, getImageModel } from '@ank1015/llm-core';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { WHITE_PNG_BASE64 } from '../../../core/tests/integration/helpers/image-fixtures.js';
import {
  describeIfAvailable,
  getIntegrationEnv,
} from '../../../core/tests/integration/helpers/live.js';
import { getSdkConfig } from '../../src/config.js';
import { image } from '../../src/index.js';
import { resolveProviderCredentials } from '../../src/keys.js';

import type { ImageResult } from '../../src/index.js';
import type { ImageModel } from '@ank1015/llm-core';

const googleApiKey = await resolveCentralGoogleApiKey();
const hasGoogleImageQuota = googleApiKey ? await canGenerateGoogleImage(googleApiKey) : false;
const describeIfGoogle = describeIfAvailable(Boolean(googleApiKey) && hasGoogleImageQuota);
const artifactsDir = resolve(process.cwd(), 'tests/integration/.artifacts/google-images');

describeIfGoogle('SDK image() Google integration', () => {
  let tempDirectory = '';
  let sourceImagePath = '';

  beforeAll(async () => {
    mkdirSync(artifactsDir, { recursive: true });

    tempDirectory = await mkdtemp(join(tmpdir(), 'llm-sdk-image-google-'));
    sourceImagePath = join(tempDirectory, 'reference.png');

    writeFileSync(sourceImagePath, Buffer.from(WHITE_PNG_BASE64, 'base64'));
  });

  afterAll(async () => {
    if (tempDirectory) {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it('supports reference-image generation with nano-banana and local image paths', async () => {
    const result = await image({
      model: 'nano-banana',
      prompt:
        'Use this plain square as a starting point and transform it into a cinematic emerald badge icon with soft highlights, no text.',
      output: resolve(artifactsDir, 'sdk-google-nano-banana-reference.png'),
      imagePaths: [sourceImagePath],
      settings: {
        aspectRatio: '16:9',
        imageSize: '1K',
        googleSearch: true,
        includeText: false,
      },
    });

    expect(result.model).toBe('nano-banana');
    expect(result.api).toBe('google');
    expect(result.providerModelId).toBe('gemini-3.1-flash-image-preview');
    expect(result.path).toBe(
      buildExpectedSingleImagePath(result, 'sdk-google-nano-banana-reference')
    );
    expect(result.paths).toEqual([result.path!]);
    expect(result.result.images.length).toBeGreaterThan(0);

    expectSavedImages(result);
    expect(result.usage.inputImage).toBeGreaterThan(0);
    expect(result.usage.cost.inputImage).toBeGreaterThan(0);
    expect(result.usage.cost.total).toBeGreaterThan(0);
  }, 180000);

  it('generates a nano-banana-pro image and preserves provider text when returned', async () => {
    const result = await image({
      model: 'nano-banana-pro',
      prompt:
        'Create a premium editorial-style poster of a moonlit greenhouse filled with brass instruments, crisp typography, and luxury brand art direction.',
      output: resolve(artifactsDir, 'sdk-google-nano-banana-pro.png'),
      settings: {
        aspectRatio: '1:1',
        imageSize: '1K',
      },
    });

    expect(result.model).toBe('nano-banana-pro');
    expect(result.api).toBe('google');
    expect(result.providerModelId).toBe('gemini-3-pro-image-preview');
    expect(result.path).toBe(buildExpectedSingleImagePath(result, 'sdk-google-nano-banana-pro'));
    expect(result.paths).toEqual([result.path!]);
    expect(result.result.images.length).toBeGreaterThan(0);
    expect(typeof result.text).toBe('string');

    expectSavedImages(result);
    expect(result.usage.outputImage).toBeGreaterThan(0);
    expect(result.usage.cost.total).toBeGreaterThan(0);
  }, 180000);
});

function expectSavedImages(
  result: ImageResult<'google', 'nano-banana'> | ImageResult<'google', 'nano-banana-pro'>
): void {
  for (const savedPath of result.paths) {
    expect(statSync(savedPath).size).toBeGreaterThan(0);
  }
}

function buildExpectedSingleImagePath(
  result: ImageResult<'google', 'nano-banana'> | ImageResult<'google', 'nano-banana-pro'>,
  baseName: string
): string {
  const image = result.result.images[0];
  if (!image) {
    throw new Error('Expected a generated image.');
  }

  return resolve(artifactsDir, `${baseName}.${getFileExtensionForMimeType(image.mimeType)}`);
}

function getFileExtensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/png':
    default:
      return 'png';
  }
}

async function canGenerateGoogleImage(apiKey: string): Promise<boolean> {
  try {
    const model = getImageModel('google', 'gemini-3.1-flash-image-preview');
    if (!model) {
      return false;
    }

    const result = await coreGenerateImage(
      model as ImageModel<'google'>,
      {
        prompt: 'Create a simple blue square on a white background. No text.',
      },
      {
        apiKey,
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: '1:1',
          imageSize: '1K',
        },
      },
      'sdk-google-image-quota-check'
    );

    return result.images.length > 0;
  } catch (error) {
    return !isGoogleQuotaError(error) ? false : false;
  }
}

function isGoogleQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message =
    'message' in error && typeof error.message === 'string' ? error.message : String(error);

  return message.includes('RESOURCE_EXHAUSTED') || message.includes('"code":429');
}

async function resolveCentralGoogleApiKey(): Promise<string | undefined> {
  const fallback = getIntegrationEnv('GEMINI_API_KEY');
  const result = await resolveProviderCredentials(getSdkConfig().keysFilePath, 'google');

  if (result.ok) {
    return result.credentials.apiKey;
  }

  return fallback;
}
