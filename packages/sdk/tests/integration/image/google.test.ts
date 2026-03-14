import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { InMemoryKeysAdapter } from '@ank1015/llm-sdk-adapters';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createImage, editImage } from '../../../src/index.js';

const apiKey = process.env.GEMINI_API_KEY;
const TEST_IMAGE_PATH = new URL('../../../../core/tests/utils/test.jpg', import.meta.url);
const describeIfGoogle = apiKey ? describe : describe.skip;

describeIfGoogle('createImage/editImage Google integration', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `llm-sdk-google-image-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('creates an image with gemini-3.1-flash-image-preview using keysAdapter auth', async () => {
    const keysAdapter = new InMemoryKeysAdapter();
    await keysAdapter.set('google', apiKey!);

    const result = await createImage({
      provider: {
        model: 'gemini-3.1-flash-image-preview',
        imageOptions: {
          aspectRatio: '16:9',
          imageSize: '1K',
        },
      },
      prompt:
        'Generate a minimal flat icon of a red square on a white background. Keep it simple and centered.',
      outputDir: testDir,
      outputName: 'google-flash-create',
      keysAdapter,
    });

    expect(existsSync(result.path)).toBe(true);
    expect(statSync(result.path).size).toBeGreaterThan(100);
    expect(
      readdirSync(join(testDir, 'google-flash-create__updates')).some((file) =>
        file.startsWith('final-')
      )
    ).toBe(true);
  }, 240000);

  it('edits a real local JPEG input with gemini-3-pro-image-preview and saves update artifacts', async () => {
    const updates: string[] = [];

    const result = await editImage({
      provider: {
        model: 'gemini-3-pro-image-preview',
        apiKey,
        imageOptions: {
          aspectRatio: '4:3',
          imageSize: '1K',
        },
      },
      prompt:
        'Edit this image into a clean blue square icon on a white background. Keep the result minimal.',
      outputDir: testDir,
      outputName: 'google-pro-edit',
      images: TEST_IMAGE_PATH.pathname,
      onUpdate: async (update) => {
        updates.push(`${update.stage}:${update.path}`);
      },
    });

    expect(existsSync(result.path)).toBe(true);
    expect(statSync(result.path).size).toBeGreaterThan(100);
    expect(updates.some((update) => update.startsWith('final:'))).toBe(true);
    expect(
      readdirSync(join(testDir, 'google-pro-edit__updates')).some((file) =>
        file.startsWith('final-')
      )
    ).toBe(true);
  }, 240000);
});
