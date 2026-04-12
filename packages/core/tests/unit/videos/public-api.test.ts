import { describe, expect, it, vi } from 'vitest';

import { generateVideo, registerVideoProvider } from '../../../src/index.js';

import type { VideoGenerationContext, VideoModel } from '../../../src/types/index.js';

describe('video public api', () => {
  it('exports registerVideoProvider so callers can extend the video registry', async () => {
    const customGenerate = vi.fn(async () => ({
      id: 'custom-video-request',
      api: 'custom-video-provider',
      model: {
        id: 'custom-video-model',
        name: 'Custom Video Model',
        api: 'custom-video-provider',
        baseUrl: 'https://video.example.com',
        input: ['text'],
        output: ['video'],
        cost: {
          '720p': 0.01,
        },
        capabilities: {
          interpolation: false,
          referenceImages: false,
          videoExtension: false,
          maxReferenceImages: 0,
          maxVideosPerRequest: 1,
          supportedAspectRatios: ['16:9'],
          supportedDurations: [4],
          supportedResolutions: ['720p'],
        },
      },
      operation: { done: true },
      response: { ok: true },
      videos: [],
      usage: {
        available: false,
        source: 'unavailable',
        reason: 'usage unavailable',
      },
      timestamp: Date.now(),
      duration: 0,
    }));

    registerVideoProvider('custom-video-provider', {
      generate: customGenerate as any,
    });

    const model = {
      id: 'custom-video-model',
      name: 'Custom Video Model',
      api: 'custom-video-provider',
      baseUrl: 'https://video.example.com',
      input: ['text'],
      output: ['video'],
      cost: {
        '720p': 0.01,
      },
      capabilities: {
        interpolation: false,
        referenceImages: false,
        videoExtension: false,
        maxReferenceImages: 0,
        maxVideosPerRequest: 1,
        supportedAspectRatios: ['16:9'],
        supportedDurations: [4],
        supportedResolutions: ['720p'],
      },
    } as VideoModel<any>;

    const context: VideoGenerationContext = {
      prompt: 'Animate a paper plane crossing the sky',
    };

    await generateVideo(model, context, { apiKey: 'test-key' } as any, 'custom-video-request');

    expect(customGenerate).toHaveBeenCalledWith(
      model,
      context,
      { apiKey: 'test-key' },
      'custom-video-request'
    );
  });
});
