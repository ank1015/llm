import { existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { describeIfAvailable } from '../../../core/tests/integration/helpers/live.js';
import {
  DEFAULT_GATEWAY_CREDENTIALS_PATH,
  resetSdkConfig,
  setSdkConfig,
} from '../../src/config.js';
import { image } from '../../src/index.js';

import type { ImageResult } from '../../src/index.js';

const gatewayCredentialsPath =
  process.env['LLM_GATEWAY_CREDENTIALS_PATH']?.trim() || DEFAULT_GATEWAY_CREDENTIALS_PATH;
const shouldRunImageGatewayIntegration =
  process.env['LLM_SDK_IMAGE_GATEWAY_INTEGRATION']?.trim() === '1' &&
  existsSync(gatewayCredentialsPath);
const describeIfImageGateway = describeIfAvailable(shouldRunImageGatewayIntegration);
const artifactsDir = resolve(process.cwd(), 'tests/integration/.artifacts/azure-openai-images');

describeIfImageGateway('SDK image() gateway integration', () => {
  beforeAll(() => {
    setSdkConfig({
      gatewayCredentialsPath,
      modelTransport: 'gateway',
    });
    mkdirSync(artifactsDir, { recursive: true });
  });

  afterAll(() => {
    resetSdkConfig();
  });

  it('generates an image through the gateway', async () => {
    const result = await image({
      prompt: 'Create a clean product icon of a cobalt kite on a white background. No text.',
      output: resolve(artifactsDir, 'sdk-azure-openai-kite.png'),
      format: 'png',
      quality: 'low',
      size: '1024x1024',
      requestId: 'sdk-gateway-azure-image-live',
    });

    expect(result.path).toBe(resolve(artifactsDir, 'sdk-azure-openai-kite.png'));
    expect(result.paths).toEqual([resolve(artifactsDir, 'sdk-azure-openai-kite.png')]);
    expect(result.raw.images.length).toBeGreaterThan(0);
    expect(
      result.raw.images.every((generatedImage) => generatedImage.mimeType === 'image/png')
    ).toBe(true);

    expectSavedImages(result);
    expect(result.usage.input).toBeGreaterThan(0);
    expect(result.usage.output).toBeGreaterThan(0);
    expect(result.usage.outputImage).toBeGreaterThan(0);
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(result.usage.cost.total).toBeGreaterThan(0);
  }, 180000);
});

function expectSavedImages(result: ImageResult): void {
  for (const savedPath of result.paths) {
    expect(statSync(savedPath).size).toBeGreaterThan(0);
  }
}
