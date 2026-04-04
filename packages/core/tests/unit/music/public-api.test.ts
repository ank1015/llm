import { describe, expect, it, vi } from 'vitest';

import { calculateMusicCost, generateMusic, registerMusicProvider } from '../../../src/index.js';

import type { MusicGenerationContext, MusicModel } from '../../../src/types/index.js';

describe('music public api', () => {
  it('exports calculateMusicCost so callers can derive request-based music spend', () => {
    expect(
      calculateMusicCost({
        id: 'test-music-model',
        name: 'Test Music Model',
        api: 'google',
        baseUrl: 'https://music.example.com',
        input: ['text'],
        output: ['audio'],
        cost: {
          request: 0.08,
        },
        capabilities: {
          maxImages: 0,
          supportsPromptControlledDuration: true,
          defaultMimeType: 'audio/mpeg',
          supportedMimeTypes: ['audio/mpeg'],
        },
      })
    ).toEqual({
      request: 0.08,
      total: 0.08,
    });
  });

  it('exports registerMusicProvider so callers can extend the music registry', async () => {
    const customGenerate = vi.fn(async () => ({
      id: 'custom-music-request',
      api: 'custom-music-provider',
      model: {
        id: 'custom-music-model',
        name: 'Custom Music Model',
        api: 'custom-music-provider',
        baseUrl: 'https://music.example.com',
        input: ['text'],
        output: ['audio'],
        cost: {
          request: 0,
        },
        capabilities: {
          maxImages: 0,
          supportsPromptControlledDuration: true,
          defaultMimeType: 'audio/mpeg',
          supportedMimeTypes: ['audio/mpeg'],
        },
      },
      response: { ok: true },
      content: [],
      tracks: [],
      usage: {
        input: 0,
        inputText: 0,
        inputImage: 0,
        output: 0,
        outputText: 0,
        outputAudio: 0,
        reasoning: 0,
        requests: 1,
        totalTokens: 0,
        cost: {
          request: 0,
          total: 0,
        },
      },
      timestamp: Date.now(),
      duration: 0,
    }));

    registerMusicProvider('custom-music-provider', {
      generate: customGenerate as any,
    });

    const model = {
      id: 'custom-music-model',
      name: 'Custom Music Model',
      api: 'custom-music-provider',
      baseUrl: 'https://music.example.com',
      input: ['text'],
      output: ['audio'],
      cost: {
        request: 0,
      },
      capabilities: {
        maxImages: 0,
        supportsPromptControlledDuration: true,
        defaultMimeType: 'audio/mpeg',
        supportedMimeTypes: ['audio/mpeg'],
      },
    } as MusicModel<any>;

    const context: MusicGenerationContext = {
      prompt: 'Compose a gentle ambient piano loop',
    };

    await generateMusic(model, context, { apiKey: 'test-key' } as any, 'custom-music-request');

    expect(customGenerate).toHaveBeenCalledWith(
      model,
      context,
      { apiKey: 'test-key' },
      'custom-music-request'
    );
  });
});
