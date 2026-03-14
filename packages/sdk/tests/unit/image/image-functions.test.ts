import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { createImage, editImage } from '../../../src/index.js';
import { stream as sdkStream } from '../../../src/llm/stream.js';

import type { AssistantMessageEventStream } from '@ank1015/llm-core';
import type {
  BaseAssistantEvent,
  BaseAssistantMessage,
  ImageContent,
  KeysAdapter,
} from '@ank1015/llm-types';

vi.mock('../../../src/llm/stream.js', () => ({
  stream: vi.fn(),
}));

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function createImageContent(
  stage: 'partial' | 'thought' | 'final',
  data: Buffer,
  mimeType = 'image/png'
): ImageContent {
  return {
    type: 'image',
    data: data.toString('base64'),
    mimeType,
    metadata: {
      generationStage: stage,
      generationProvider: 'openai',
    },
  };
}

function createAssistantMessage<TApi extends 'openai' | 'google'>(
  api: TApi,
  images: ImageContent[]
): BaseAssistantMessage<TApi> {
  return {
    role: 'assistant',
    api,
    id: `${api}-assistant`,
    model: {
      id: api === 'openai' ? 'gpt-5.4' : 'gemini-3-pro-image-preview',
      name: api === 'openai' ? 'GPT-5.4' : 'Gemini 3 Pro Image Preview',
      api,
      baseUrl: '',
      reasoning: true,
      input: ['text', 'image'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 1000,
      maxTokens: 1000,
      tools: api === 'openai' ? ['function_calling'] : [],
    } as BaseAssistantMessage<TApi>['model'],
    timestamp: Date.now(),
    duration: 10,
    stopReason: 'stop',
    message: {} as BaseAssistantMessage<TApi>['message'],
    content: [
      {
        type: 'response',
        content: images,
      },
    ],
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

function createEventStream<TApi extends 'openai' | 'google'>(
  events: BaseAssistantEvent<TApi>[],
  result: BaseAssistantMessage<TApi>
): AssistantMessageEventStream<TApi> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) {
        yield event;
      }
    },
    result: vi.fn().mockResolvedValue(result),
  } as unknown as AssistantMessageEventStream<TApi>;
}

function createKeysAdapter(): KeysAdapter {
  return {
    get: vi.fn().mockResolvedValue('adapter-key'),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
    list: vi.fn().mockResolvedValue([]),
  };
}

function createOpenAIProvider() {
  return {
    model: 'gpt-5.4' as const,
  };
}

function createGoogleProvider(
  model: 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview'
) {
  return {
    model,
  };
}

describe('image functions', () => {
  let testDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    testDir = join(
      tmpdir(),
      `llm-sdk-image-functions-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('rejects unsupported model IDs', async () => {
    await expect(
      createImage({
        provider: {
          model: 'gpt-4o' as never,
        },
        prompt: 'Generate an image.',
        outputDir: testDir,
      })
    ).rejects.toThrow('Unsupported image model');
  });

  it('passes direct apiKey and keysAdapter through to sdkStream', async () => {
    const assistant = createAssistantMessage('openai', [createImageContent('final', PNG_BYTES)]);
    vi.mocked(sdkStream).mockResolvedValue(createEventStream([], assistant));

    const keysAdapter = createKeysAdapter();

    await createImage({
      provider: {
        ...createOpenAIProvider(),
        apiKey: 'direct-key',
      },
      prompt: 'Generate an image.',
      outputDir: testDir,
      keysAdapter,
    });

    expect(sdkStream).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'gpt-5.4', api: 'openai' }),
      expect.any(Object),
      expect.objectContaining({
        providerOptions: expect.objectContaining({ apiKey: 'direct-key' }),
        keysAdapter,
      })
    );
  });

  it('loads local image paths and includes them in the request', async () => {
    const localImagePath = join(testDir, 'horse.jpg');
    writeFileSync(localImagePath, JPEG_BYTES);

    const assistant = createAssistantMessage('openai', [createImageContent('final', PNG_BYTES)]);
    vi.mocked(sdkStream).mockResolvedValue(createEventStream([], assistant));

    await createImage({
      provider: {
        ...createOpenAIProvider(),
        apiKey: 'test-key',
      },
      prompt: 'Use this as a reference.',
      outputDir: testDir,
      images: localImagePath,
    });

    expect(sdkStream).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'text', content: 'Use this as a reference.' }),
              expect.objectContaining({
                type: 'image',
                mimeType: 'image/jpeg',
                data: JPEG_BYTES.toString('base64'),
              }),
            ]),
          }),
        ],
      }),
      expect.any(Object)
    );
  });

  it('loads remote image URLs and uses response content-type', async () => {
    const assistant = createAssistantMessage('openai', [createImageContent('final', PNG_BYTES)]);
    vi.mocked(sdkStream).mockResolvedValue(createEventStream([], assistant));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(PNG_BYTES, {
          status: 200,
          headers: {
            'content-type': 'image/png',
          },
        })
      )
    );

    await editImage({
      provider: {
        ...createOpenAIProvider(),
        apiKey: 'test-key',
      },
      prompt: 'Edit this image.',
      outputDir: testDir,
      images: 'https://example.com/reference',
    });

    expect(sdkStream).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'image',
                mimeType: 'image/png',
                data: PNG_BYTES.toString('base64'),
              }),
            ]),
          }),
        ],
      }),
      expect.any(Object)
    );
  });

  it('requires at least one image for editImage()', async () => {
    await expect(
      editImage({
        provider: createOpenAIProvider(),
        prompt: 'Edit the image.',
        outputDir: testDir,
        images: [],
      })
    ).rejects.toThrow('editImage() requires at least one image source.');
  });

  it('writes the final file and a final update artifact', async () => {
    const finalImage = createImageContent('final', PNG_BYTES);
    const assistant = createAssistantMessage('openai', [finalImage]);
    vi.mocked(sdkStream).mockResolvedValue(createEventStream([], assistant));

    const result = await createImage({
      provider: {
        ...createOpenAIProvider(),
        apiKey: 'test-key',
      },
      prompt: 'Generate an image.',
      outputDir: testDir,
      outputName: 'horse',
    });

    const updatesDir = join(testDir, 'horse__updates');

    expect(result.path).toBe(join(testDir, 'horse.png'));
    expect(existsSync(result.path)).toBe(true);
    expect(readFileSync(result.path)).toEqual(PNG_BYTES);
    expect(readdirSync(updatesDir)).toContain('final-001.png');
  });

  it('only saves the first final image when multiple final images exist', async () => {
    const firstFinal = createImageContent('final', PNG_BYTES);
    const secondFinal = createImageContent('final', Buffer.from('second-final'));
    const assistant = createAssistantMessage('openai', [firstFinal, secondFinal]);
    vi.mocked(sdkStream).mockResolvedValue(createEventStream([], assistant));

    const result = await createImage({
      provider: {
        ...createOpenAIProvider(),
        apiKey: 'test-key',
      },
      prompt: 'Generate images.',
      outputDir: testDir,
      outputName: 'multi',
    });

    expect(readFileSync(result.path)).toEqual(PNG_BYTES);
    expect(
      readdirSync(join(testDir, 'multi__updates')).filter((name) => name.startsWith('final-'))
    ).toEqual(['final-001.png']);
  });

  it('saves partial and final updates and reports local paths through onUpdate', async () => {
    const partialImage = createImageContent('partial', Buffer.from('partial-preview'));
    const finalImage = createImageContent('final', PNG_BYTES);
    const assistant = createAssistantMessage('openai', [finalImage]);
    const partialEvent: BaseAssistantEvent<'openai'> = {
      type: 'image_frame',
      contentIndex: 0,
      image: partialImage,
      message: assistant,
    };
    const finalEvent: BaseAssistantEvent<'openai'> = {
      type: 'image_end',
      contentIndex: 0,
      image: finalImage,
      message: assistant,
    };
    vi.mocked(sdkStream).mockResolvedValue(
      createEventStream([partialEvent, finalEvent], assistant)
    );

    const updates: Array<{
      stage: string;
      path: string;
      index: number;
      mimeType: string;
      model: string;
    }> = [];

    const result = await createImage({
      provider: {
        ...createOpenAIProvider(),
        apiKey: 'test-key',
      },
      prompt: 'Generate an image.',
      outputDir: testDir,
      outputName: 'streamed',
      onUpdate: async (update) => {
        updates.push(update);
      },
    });

    expect(result.path).toBe(join(testDir, 'streamed.png'));
    expect(updates).toEqual([
      {
        stage: 'partial',
        path: join(testDir, 'streamed__updates', 'partial-001.png'),
        mimeType: 'image/png',
        index: 1,
        model: 'gpt-5.4',
      },
      {
        stage: 'final',
        path: join(testDir, 'streamed__updates', 'final-001.png'),
        mimeType: 'image/png',
        index: 1,
        model: 'gpt-5.4',
      },
    ]);
    expect(existsSync(updates[0]!.path)).toBe(true);
    expect(existsSync(updates[1]!.path)).toBe(true);
  });

  it('rejects unsupported option combinations before streaming', async () => {
    await expect(
      createImage({
        provider: {
          ...createGoogleProvider('gemini-3-pro-image-preview'),
          apiKey: 'test-key',
          imageOptions: {
            format: 'png',
          } as never,
        },
        prompt: 'Generate an image.',
        outputDir: testDir,
      })
    ).rejects.toThrow('provider.imageOptions.format is only supported for OpenAI image models.');

    await expect(
      createImage({
        provider: {
          ...createOpenAIProvider(),
          apiKey: 'test-key',
          imageOptions: {
            aspectRatio: '1:1',
          } as never,
        },
        prompt: 'Generate an image.',
        outputDir: testDir,
      })
    ).rejects.toThrow(
      'provider.imageOptions.aspectRatio is only supported for Google image models.'
    );

    await expect(
      createImage({
        provider: {
          ...createGoogleProvider('gemini-3-pro-image-preview'),
          apiKey: 'test-key',
          imageOptions: {
            aspectRatio: '1:8',
          } as never,
        },
        prompt: 'Generate an image.',
        outputDir: testDir,
      })
    ).rejects.toThrow(
      'provider.imageOptions.aspectRatio must be one of: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9.'
    );

    await expect(
      createImage({
        provider: {
          ...createGoogleProvider('gemini-3.1-flash-image-preview'),
          apiKey: 'test-key',
          imageOptions: {
            imageSize: '8K',
          } as never,
        },
        prompt: 'Generate an image.',
        outputDir: testDir,
      })
    ).rejects.toThrow('provider.imageOptions.imageSize must be one of: 1K, 2K, 4K.');

    expect(sdkStream).not.toHaveBeenCalled();
  });

  it('maps Google aspectRatio and imageSize into imageConfig', async () => {
    const assistant = createAssistantMessage('google', [createImageContent('final', PNG_BYTES)]);
    vi.mocked(sdkStream).mockResolvedValue(createEventStream([], assistant));

    await createImage({
      provider: {
        ...createGoogleProvider('gemini-3.1-flash-image-preview'),
        apiKey: 'test-key',
        imageOptions: {
          aspectRatio: '1:8',
          imageSize: '2K',
        },
      },
      prompt: 'Generate an image.',
      outputDir: testDir,
    });

    expect(sdkStream).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'gemini-3.1-flash-image-preview', api: 'google' }),
      expect.any(Object),
      expect.objectContaining({
        providerOptions: expect.objectContaining({
          apiKey: 'test-key',
          imageConfig: {
            aspectRatio: '1:8',
            imageSize: '2K',
          },
        }),
      })
    );
  });

  it('uses keysAdapter-only auth when apiKey is omitted', async () => {
    const assistant = createAssistantMessage('google', [createImageContent('final', PNG_BYTES)]);
    vi.mocked(sdkStream).mockResolvedValue(createEventStream([], assistant));

    const keysAdapter = createKeysAdapter();

    await createImage({
      provider: createGoogleProvider('gemini-3-pro-image-preview'),
      prompt: 'Generate an image.',
      outputDir: testDir,
      keysAdapter,
    });

    expect(sdkStream).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'gemini-3-pro-image-preview', api: 'google' }),
      expect.any(Object),
      expect.objectContaining({
        providerOptions: expect.not.objectContaining({ apiKey: expect.anything() }),
        keysAdapter,
      })
    );
  });
});
