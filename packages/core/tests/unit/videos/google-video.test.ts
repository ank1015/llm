import { describe, expect, it, vi } from 'vitest';

import {
  calculateVideoCost,
  getVideoModel,
  getVideoModels,
} from '../../../src/videos/models/index.js';
import {
  buildGoogleVideoParams,
  normalizeGoogleVideoResponse,
  waitForGoogleVideoOperation,
} from '../../../src/videos/providers/google/generate.js';

import type {
  GoogleVideoProviderOptions,
  VideoGenerationContext,
  VideoModel,
} from '../../../src/types/index.js';
import type { GenerateVideosOperation, GenerateVideosResponse } from '@google/genai';

const standardModel = getRequiredGoogleVideoModel('veo-3.1-generate-preview');
const fastModel = getRequiredGoogleVideoModel('veo-3.1-fast-generate-preview');
const liteModel = getRequiredGoogleVideoModel('veo-3.1-lite-generate-preview');

describe('google video provider', () => {
  it('registers the intended Google video models and pricing', () => {
    const models = getVideoModels('google');

    expect(models).toHaveLength(3);
    expect(models.map((model) => model.id)).toEqual([
      'veo-3.1-generate-preview',
      'veo-3.1-fast-generate-preview',
      'veo-3.1-lite-generate-preview',
    ]);
    expect(standardModel.cost['720p']).toBe(0.4);
    expect(fastModel.cost['4k']).toBe(0.35);
    expect(liteModel.cost['1080p']).toBe(0.08);
    expect(liteModel.cost['4k']).toBeUndefined();
  });

  it('calculates video cost from billed seconds and resolution', () => {
    expect(
      calculateVideoCost(fastModel, {
        billedSeconds: 8,
        resolution: '4k',
      })
    ).toEqual({
      resolution: '4k',
      ratePerSecond: 0.35,
      billedSeconds: 8,
      total: 2.8,
    });
  });

  it('builds text-to-video params with sanitized prompt, defaults, and config', () => {
    const context: VideoGenerationContext = {
      prompt: 'Create a cinematic waterfall reveal',
    };
    const options: GoogleVideoProviderOptions = {
      apiKey: 'test-key',
      aspectRatio: '9:16',
      generateAudio: true,
      negativePrompt: 'text overlay, subtitles',
    };

    const result = buildGoogleVideoParams(standardModel, context, options);

    expect(result).toEqual({
      model: 'veo-3.1-generate-preview',
      prompt: 'Create a cinematic waterfall reveal',
      config: {
        aspectRatio: '9:16',
        durationSeconds: 8,
        generateAudio: true,
        negativePrompt: 'text overlay, subtitles',
        numberOfVideos: 1,
        resolution: '720p',
      },
    });
  });

  it('builds image interpolation params with first and last frames', () => {
    const context: VideoGenerationContext = {
      prompt: 'Transition from sunrise to nightfall over the same skyline',
      image: {
        type: 'image',
        data: 'first-frame',
        mimeType: 'image/png',
      },
      lastFrame: {
        type: 'image',
        data: 'last-frame',
        mimeType: 'image/png',
      },
    };
    const options: GoogleVideoProviderOptions = {
      apiKey: 'test-key',
      durationSeconds: 6,
    };

    const result = buildGoogleVideoParams(standardModel, context, options);

    expect(result).toEqual({
      model: 'veo-3.1-generate-preview',
      prompt: 'Transition from sunrise to nightfall over the same skyline',
      image: {
        imageBytes: 'first-frame',
        mimeType: 'image/png',
      },
      config: {
        durationSeconds: 6,
        lastFrame: {
          imageBytes: 'last-frame',
          mimeType: 'image/png',
        },
        numberOfVideos: 1,
        resolution: '720p',
      },
    });
  });

  it('rejects incompatible reference-image combinations', () => {
    const context: VideoGenerationContext = {
      prompt: 'Animate this product shot',
      image: {
        type: 'image',
        data: 'primary-image',
        mimeType: 'image/png',
      },
      referenceImages: [
        {
          image: {
            type: 'image',
            data: 'reference-image',
            mimeType: 'image/png',
          },
          referenceType: 'asset',
        },
      ],
    };

    expect(() =>
      buildGoogleVideoParams(standardModel, context, {
        apiKey: 'test-key',
      })
    ).toThrow(/referenceImages/);
  });

  it('rejects lite model reference images', () => {
    const context: VideoGenerationContext = {
      prompt: 'Keep this toy robot recognizable as it waves hello',
      referenceImages: [
        {
          image: {
            type: 'image',
            data: 'reference-image',
            mimeType: 'image/png',
          },
          referenceType: 'asset',
        },
      ],
    };

    expect(() =>
      buildGoogleVideoParams(liteModel, context, {
        apiKey: 'test-key',
        durationSeconds: 8,
      })
    ).toThrow(/does not support referenceImages/);
  });

  it('rejects 1080p generation unless durationSeconds is 8', () => {
    const context: VideoGenerationContext = {
      prompt: 'A crane shot above a glowing city boulevard in rain',
    };

    expect(() =>
      buildGoogleVideoParams(standardModel, context, {
        apiKey: 'test-key',
        durationSeconds: 6,
        resolution: '1080p',
      })
    ).toThrow(/requires durationSeconds=8/);
  });

  it('rejects lite model video extension inputs', () => {
    const context: VideoGenerationContext = {
      prompt: 'Continue the camera drift into the forest',
      video: {
        type: 'video',
        uri: 'gs://veo/video.mp4',
        mimeType: 'video/mp4',
      },
    };

    expect(() =>
      buildGoogleVideoParams(liteModel, context, {
        apiKey: 'test-key',
        durationSeconds: 8,
      })
    ).toThrow(/does not support video extension/);
  });

  it('normalizes generated videos and computes estimated usage cost', () => {
    const response: GenerateVideosResponse = {
      generatedVideos: [
        {
          video: {
            videoBytes: 'video-data-1',
            mimeType: 'video/mp4',
          },
        },
        {
          video: {
            uri: 'gs://videos/output-2.mp4',
            mimeType: 'video/mp4',
          },
        },
      ],
    };

    const result = normalizeGoogleVideoResponse(fastModel, response, {
      apiKey: 'test-key',
      durationSeconds: 8,
      resolution: '720p',
    });

    expect(result.videos).toEqual([
      {
        type: 'video',
        data: 'video-data-1',
        mimeType: 'video/mp4',
        metadata: {
          videoIndex: 0,
          generationProvider: 'google',
          generationStage: 'final',
          durationSeconds: 8,
          resolution: '720p',
        },
      },
      {
        type: 'video',
        mimeType: 'video/mp4',
        uri: 'gs://videos/output-2.mp4',
        metadata: {
          videoIndex: 1,
          generationProvider: 'google',
          generationStage: 'final',
          durationSeconds: 8,
          resolution: '720p',
        },
      },
    ]);
    expect(result.usage).toEqual({
      available: true,
      source: 'estimated',
      reason: 'Estimated from Google Veo model pricing and request settings.',
      durationSeconds: 8,
      billedSeconds: 8,
      numberOfVideos: 1,
      resolution: '720p',
      cost: {
        resolution: '720p',
        ratePerSecond: 0.15,
        billedSeconds: 8,
        total: 1.2,
      },
    });
  });

  it('polls until the Google video operation completes', async () => {
    const getVideosOperation = vi
      .fn()
      .mockResolvedValueOnce({
        name: 'operations/veo-op',
        done: false,
      } satisfies GenerateVideosOperation)
      .mockResolvedValueOnce({
        name: 'operations/veo-op',
        done: true,
        response: {
          generatedVideos: [],
        },
      } satisfies GenerateVideosOperation);

    const operation = await waitForGoogleVideoOperation(
      {
        operations: {
          getVideosOperation,
        },
      } as any,
      {
        name: 'operations/veo-op',
        done: false,
      },
      {
        apiKey: 'test-key',
        pollIntervalMs: 0,
        timeoutMs: 100,
      }
    );

    expect(getVideosOperation).toHaveBeenCalledTimes(2);
    expect(operation.done).toBe(true);
  });
});

function getRequiredGoogleVideoModel(modelId: string): VideoModel<'google'> {
  const model = getVideoModel('google', modelId as any);
  if (!model) {
    throw new Error(`Test model ${modelId} not found`);
  }

  return model;
}
