import { describe, expect, it } from 'vitest';

import type { GptImageInput, NanoBananaInput } from '../../src/image.js';

const _nanoBananaInput: NanoBananaInput<'nano-banana'> = {
  model: 'nano-banana',
  prompt: 'Create a sticker',
  output: './sticker.png',
  settings: {
    aspectRatio: '1:1',
    googleSearch: true,
    imageSize: '2K',
  },
};

const _gptImageInput: GptImageInput = {
  model: 'gpt-image',
  prompt: 'Create an icon',
  output: './icon.png',
  maskPath: './mask.png',
  settings: {
    fidelity: 'high',
    format: 'webp',
    size: '1024x1024',
  },
};

// @ts-expect-error OpenAI image settings should not be accepted for nano-banana inputs
const _invalidNanoBananaInput: NanoBananaInput = {
  model: 'nano-banana',
  prompt: 'Create a sticker',
  output: './sticker.png',
  settings: {
    format: 'webp',
  },
};

// @ts-expect-error Google image settings should not be accepted for gpt-image inputs
const _invalidGptImageInput: GptImageInput = {
  model: 'gpt-image',
  prompt: 'Create an icon',
  output: './icon.png',
  settings: {
    aspectRatio: '16:9',
  },
};

describe('image typing', () => {
  it('keeps model-specific settings compile-safe', () => {
    expect(true).toBe(true);
  });
});
