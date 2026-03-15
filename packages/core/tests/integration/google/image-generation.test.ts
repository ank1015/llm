import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { complete } from '../../../src/llm/complete.js';
import { getModel } from '../../../src/models/index.js';

import type { BaseAssistantMessage, ImageContent, Model } from '@ank1015/llm-types';

const apiKey = process.env.GEMINI_API_KEY;
const describeIfGemini = apiKey ? describe : describe.skip;
const TEST_IMAGE_BASE64 = readFileSync(new URL('../../utils/test.jpg', import.meta.url)).toString(
  'base64'
);

function getImages(message: BaseAssistantMessage<'google'>): ImageContent[] {
  return message.content.flatMap((block) =>
    block.type === 'response'
      ? block.content.filter((content): content is ImageContent => content.type === 'image')
      : []
  );
}

describeIfGemini('Google Image Integration', () => {
  let model: Model<'google'>;

  beforeAll(() => {
    const imageModel =
      getModel('google', 'gemini-3.1-flash-image-preview') ||
      getModel('google', 'gemini-3-pro-image-preview');

    if (!imageModel) {
      throw new Error('No Google image-capable test model found');
    }

    model = imageModel;
  });

  it('generates image output through complete()', async () => {
    const result = await complete(
      model,
      {
        messages: [
          {
            role: 'user',
            id: 'google-image-user-1',
            content: [
              {
                type: 'text',
                content:
                  'Generate a simple flat icon of a red square on a white background. Keep it minimal.',
              },
            ],
          },
        ],
      },
      {
        apiKey,
        responseModalities: ['TEXT', 'IMAGE'],
      },
      'google-image-complete-1'
    );

    const images = getImages(result);

    expect(images.length).toBeGreaterThan(0);
    expect(images[0].data.length).toBeGreaterThan(100);
    expect(images[0].mimeType.startsWith('image/')).toBe(true);
    expect(images[0].metadata?.generationStage).toBe('final');
    expect(result.message.candidates?.[0].content?.parts.some((part) => part.inlineData)).toBe(
      true
    );
  }, 120000);

  it('supports image editing with image input', async () => {
    const result = await complete(
      model,
      {
        messages: [
          {
            role: 'user',
            id: 'google-image-user-2',
            content: [
              {
                type: 'text',
                content:
                  'Edit this image into a simple blue square icon. Preserve a clean, minimal style.',
              },
              {
                type: 'image',
                data: TEST_IMAGE_BASE64,
                mimeType: 'image/jpeg',
              },
            ],
          },
        ],
      },
      {
        apiKey,
        responseModalities: ['TEXT', 'IMAGE'],
      },
      'google-image-complete-2'
    );

    const images = getImages(result);

    expect(images.length).toBeGreaterThan(0);
    expect(images[0].data.length).toBeGreaterThan(100);
    expect(images[0].metadata?.generationStage).toBe('final');
  }, 120000);
});
