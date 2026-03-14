import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createImage, editImage } from '../../../src/index.js';

const apiKey = process.env.OPENAI_API_KEY;
const TEST_IMAGE_PATH = new URL('../../../../core/tests/utils/test.jpg', import.meta.url);
const hasOpenAIModelAccess = apiKey
  ? await fetch('https://api.openai.com/v1/models/gpt-5.4', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
      .then((response) => response.ok)
      .catch(() => false)
  : false;
const describeIfOpenAI = apiKey && hasOpenAIModelAccess ? describe : describe.skip;

describeIfOpenAI('createImage/editImage OpenAI integration', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `llm-sdk-openai-image-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('creates an image and saves it to disk', async () => {
    const result = await createImage({
      provider: {
        model: 'gpt-5.4',
        apiKey,
      },
      prompt:
        'Generate a minimal flat icon of a red square on a white background. Keep it simple and centered.',
      outputDir: testDir,
      outputName: 'openai-create',
    });

    expect(result.path).toBe(join(testDir, 'openai-create.png'));
    expect(existsSync(result.path)).toBe(true);
    expect(statSync(result.path).size).toBeGreaterThan(100);
    expect(readdirSync(join(testDir, 'openai-create__updates'))).toContain('final-001.png');
  }, 240000);

  it('edits a real local JPEG input and saves the output', async () => {
    const result = await editImage({
      provider: {
        model: 'gpt-5.4',
        apiKey,
      },
      prompt: 'Edit this image into a clean blue square icon on a white background.',
      outputDir: testDir,
      outputName: 'openai-edit',
      images: TEST_IMAGE_PATH.pathname,
    });

    expect(result.path).toBe(join(testDir, 'openai-edit.png'));
    expect(existsSync(result.path)).toBe(true);
    expect(statSync(result.path).size).toBeGreaterThan(100);
  }, 240000);

  it('saves partial updates and reports them through onUpdate', async () => {
    const updates: string[] = [];

    const result = await createImage({
      provider: {
        model: 'gpt-5.4',
        apiKey,
        imageOptions: {
          partialImages: 2,
          format: 'png',
        },
      },
      prompt: 'Draw a serene winter river made of white owl feathers in a painterly style.',
      outputDir: testDir,
      outputName: 'openai-stream',
      onUpdate: async (update) => {
        updates.push(`${update.stage}:${update.path}`);
      },
    });

    const updateFiles = readdirSync(join(testDir, 'openai-stream__updates'));

    expect(result.path).toBe(join(testDir, 'openai-stream.png'));
    expect(existsSync(result.path)).toBe(true);
    expect(updates.some((update) => update.startsWith('partial:'))).toBe(true);
    expect(updates.some((update) => update.startsWith('final:'))).toBe(true);
    expect(updateFiles.some((file) => file.startsWith('partial-'))).toBe(true);
    expect(updateFiles).toContain('final-001.png');
  }, 240000);
});
