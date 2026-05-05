import { describe, expect, it } from 'vitest';

import type { ImageInput } from '../../src/image.js';

const _imageInput: ImageInput = {
  prompt: 'Create an icon',
  output: './icon.png',
  inputImages: ['./source.png'],
  mask: './mask.png',
  format: 'webp',
  size: '1024x1024',
};

// @ts-expect-error callers should not pass a model/provider to image()
const _invalidModelInput: ImageInput = {
  model: 'gpt-image',
  prompt: 'Create an icon',
  output: './icon.png',
};

// @ts-expect-error settings are top-level on the image input
const _invalidNestedSettingsInput: ImageInput = {
  prompt: 'Create a sticker',
  output: './sticker.png',
  settings: {
    size: '1024x1024',
  },
};

describe('image typing', () => {
  it('keeps image input model-free with top-level settings', () => {
    expect(true).toBe(true);
  });
});
