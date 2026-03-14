import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { complete } from '../../../src/llm/complete.js';
import { streamOpenAI } from '../../../src/providers/openai/stream.js';

import type {
  BaseAssistantEvent,
  BaseAssistantMessage,
  ImageContent,
  Model,
} from '@ank1015/llm-types';

const apiKey = process.env.OPENAI_API_KEY;
const describeIfOpenAI = apiKey ? describe : describe.skip;
const TEST_IMAGE_BASE64 = readFileSync(new URL('../../utils/test.jpg', import.meta.url)).toString(
  'base64'
);

function getImages(message: BaseAssistantMessage<'openai'>): ImageContent[] {
  return message.content.flatMap((block) =>
    block.type === 'response'
      ? block.content.filter((content): content is ImageContent => content.type === 'image')
      : []
  );
}

describeIfOpenAI('OpenAI Image Integration', () => {
  const completeModel: Model<'openai'> = {
    id: 'gpt-5',
    name: 'GPT-5',
    api: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    reasoning: true,
    input: ['text', 'image', 'file'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 400000,
    maxTokens: 128000,
    tools: ['function_calling'],
  };

  const streamingModel: Model<'openai'> = {
    id: 'gpt-5',
    name: 'GPT-5',
    api: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    reasoning: true,
    input: ['text', 'image', 'file'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 400000,
    maxTokens: 128000,
    tools: ['function_calling'],
  };

  beforeAll(() => {
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required for integration tests');
    }
  });

  it('returns generated images through complete()', async () => {
    const result = await complete(
      completeModel,
      {
        messages: [
          {
            role: 'user',
            id: 'openai-image-user-1',
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
        tools: [{ type: 'image_generation' }],
      },
      'openai-image-complete-1'
    );

    const images = getImages(result);

    expect(images.length).toBeGreaterThan(0);
    expect(images[0].data.length).toBeGreaterThan(100);
    expect(images[0].mimeType).toBe('image/png');
    expect(images[0].metadata?.generationStage).toBe('final');
    expect(result.message.output.some((item) => item.type === 'image_generation_call')).toBe(true);
  }, 120000);

  it('supports image editing with a real JPEG input', async () => {
    const result = await complete(
      completeModel,
      {
        messages: [
          {
            role: 'user',
            id: 'openai-image-user-3',
            content: [
              {
                type: 'text',
                content:
                  'Edit this image into a clean blue square icon on a white background. Keep the result minimal.',
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
        tools: [
          {
            type: 'image_generation',
            action: 'edit',
          },
        ],
      },
      'openai-image-complete-2'
    );

    const images = getImages(result);
    const generatedImageCall = result.message.output.find(
      (item) => item.type === 'image_generation_call'
    );

    expect(images.length).toBeGreaterThan(0);
    expect(images[0].data.length).toBeGreaterThan(100);
    expect(images[0].metadata?.generationStage).toBe('final');
    expect(images[0].metadata?.generationAction).toBe('edit');
    expect(generatedImageCall?.type).toBe('image_generation_call');
  }, 120000);

  it('emits partial image frames while streaming', async () => {
    const stream = streamOpenAI(
      streamingModel,
      {
        messages: [
          {
            role: 'user',
            id: 'openai-image-user-2',
            content: [
              {
                type: 'text',
                content:
                  'Draw a gorgeous image of a river made of white owl feathers, snaking its way through a serene winter landscape.',
              },
            ],
          },
        ],
      },
      {
        apiKey,
        tools: [
          {
            type: 'image_generation',
            partial_images: 2,
          },
        ],
      },
      'openai-image-stream-1'
    );

    const events: BaseAssistantEvent<'openai'>[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    const result = await stream.result();
    const images = getImages(result);

    expect(events.some((event) => event.type === 'image_start')).toBe(true);
    expect(events.some((event) => event.type === 'image_frame')).toBe(true);
    expect(events.some((event) => event.type === 'image_end')).toBe(true);
    expect(images.length).toBeGreaterThan(0);
    expect(images[0].data.length).toBeGreaterThan(100);
    expect(images[0].metadata?.generationStage).toBe('final');
  }, 120000);
});
