import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Context, Model } from '@ank1015/llm-types';

const googleMocks = vi.hoisted(() => ({
  buildParams: vi.fn(),
  createClient: vi.fn(),
  generateContentStream: vi.fn(),
  mapStopReason: vi.fn(),
}));

vi.mock('../../../src/providers/google/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/providers/google/utils.js')>();

  return {
    ...actual,
    buildParams: googleMocks.buildParams,
    createClient: googleMocks.createClient,
    mapStopReason: googleMocks.mapStopReason,
  };
});

async function* chunkStream(chunks: unknown[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe('Google Stream', () => {
  let streamGoogle: typeof import('../../../src/providers/google/stream.js').streamGoogle;

  const mockModel: Model<'google'> = {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Flash Image Preview',
    api: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0.3, output: 2.5, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 32768,
    tools: [],
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    googleMocks.buildParams.mockReturnValue({ model: mockModel.id });
    googleMocks.createClient.mockReturnValue({
      models: {
        generateContentStream: googleMocks.generateContentStream,
      },
    });
    googleMocks.mapStopReason.mockReturnValue('stop');
  });

  beforeEach(async () => {
    streamGoogle = (await import('../../../src/providers/google/stream.js')).streamGoogle;
  });

  it('normalizes generated inlineData images and preserves candidate metadata', async () => {
    googleMocks.generateContentStream.mockResolvedValue(
      chunkStream([
        {
          candidates: [
            {
              finishReason: 'STOP',
              groundingMetadata: {
                searchEntryPoint: { renderedContent: '<div>search</div>' },
              },
              content: {
                role: 'model',
                parts: [{ inlineData: { mimeType: 'image/png', data: 'imgdata' } }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            cachedContentTokenCount: 0,
            candidatesTokenCount: 20,
            thoughtsTokenCount: 0,
            totalTokenCount: 30,
          },
        },
      ])
    );

    const context: Context = { messages: [] };
    const stream = streamGoogle(mockModel, context, { apiKey: 'test-key' }, 'google-img-1');

    const events: Array<{ type: string }> = [];
    for await (const event of stream) {
      events.push(event);
    }

    const result = await stream.result();

    expect(events.map((event) => event.type)).toEqual([
      'start',
      'image_start',
      'image_frame',
      'image_end',
      'done',
    ]);
    expect(result.content).toEqual([
      {
        type: 'response',
        content: [
          {
            type: 'image',
            data: 'imgdata',
            mimeType: 'image/png',
            metadata: {
              generationStage: 'final',
              generationProvider: 'google',
            },
          },
        ],
      },
    ]);
    expect(result.message.candidates?.[0].groundingMetadata).toEqual({
      searchEntryPoint: { renderedContent: '<div>search</div>' },
    });
    expect(result.message.candidates?.[0].content?.parts).toEqual([
      { inlineData: { mimeType: 'image/png', data: 'imgdata' } },
    ]);
  });

  it('marks Google thought images with the thought stage', async () => {
    googleMocks.generateContentStream.mockResolvedValue(
      chunkStream([
        {
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                role: 'model',
                parts: [
                  {
                    inlineData: { mimeType: 'image/png', data: 'thoughtimg' },
                    thought: true,
                  },
                ],
              },
            },
          ],
        },
      ])
    );

    const context: Context = { messages: [] };
    const stream = streamGoogle(mockModel, context, { apiKey: 'test-key' }, 'google-img-2');

    let imageStartEvent: { metadata?: { generationStage?: string } } | undefined;
    for await (const event of stream) {
      if (event.type === 'image_start') {
        imageStartEvent = event;
      }
    }

    const result = await stream.result();
    const responseBlock = result.content[0];

    expect(imageStartEvent?.metadata?.generationStage).toBe('thought');
    expect(responseBlock).toEqual({
      type: 'response',
      content: [
        {
          type: 'image',
          data: 'thoughtimg',
          mimeType: 'image/png',
          metadata: {
            generationStage: 'thought',
            generationProvider: 'google',
          },
        },
      ],
    });
  });
});
