import { mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { GoogleGenAI } from '@google/genai';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  calculateVideoCost,
  generateImage,
  generateVideo,
  getImageModel,
  getVideoModel,
} from '../../../src/index.js';
import { describeIfAvailable, getIntegrationEnv } from '../helpers/live.js';

import type {
  BaseVideoResult,
  ImageContent,
  ImageModel,
  VideoModel,
  VideoResolution,
} from '../../../src/types/index.js';

const apiKey = getIntegrationEnv('GEMINI_API_KEY')!;
const describeIfGoogle = describeIfAvailable(Boolean(apiKey));
const artifactsDir = resolve(process.cwd(), 'tests/integration/.artifacts/google-videos');
const pollIntervalMs = 5_000;

describeIfGoogle('Google Video Integration', () => {
  let imageModel: ImageModel<'google'>;
  let standardModel: VideoModel<'google'>;
  let fastModel: VideoModel<'google'>;
  let liteModel: VideoModel<'google'>;
  let googleClient: GoogleGenAI;
  let robotReferenceImage: ImageContent;
  let dawnGardenImage: ImageContent;
  let lanternGardenImage: ImageContent;

  beforeAll(async () => {
    mkdirSync(artifactsDir, { recursive: true });

    const resolvedImageModel = getImageModel('google', 'gemini-3.1-flash-image-preview');
    const resolvedStandardModel = getVideoModel('google', 'veo-3.1-generate-preview');
    const resolvedFastModel = getVideoModel('google', 'veo-3.1-fast-generate-preview');
    const resolvedLiteModel = getVideoModel('google', 'veo-3.1-lite-generate-preview');

    if (!resolvedImageModel) {
      throw new Error('Test image model gemini-3.1-flash-image-preview not found');
    }

    if (!resolvedStandardModel) {
      throw new Error('Test video model veo-3.1-generate-preview not found');
    }

    if (!resolvedFastModel) {
      throw new Error('Test video model veo-3.1-fast-generate-preview not found');
    }

    if (!resolvedLiteModel) {
      throw new Error('Test video model veo-3.1-lite-generate-preview not found');
    }

    imageModel = resolvedImageModel;
    standardModel = resolvedStandardModel;
    fastModel = resolvedFastModel;
    liteModel = resolvedLiteModel;
    googleClient = new GoogleGenAI({ apiKey });

    robotReferenceImage = await generateSourceImage(
      imageModel,
      'Create a clean, high-detail illustration of a friendly brass wind-up robot mascot standing on a small stage, full body, soft studio lighting, no text.',
      'google-video-source-robot-1',
      '9:16'
    );
    dawnGardenImage = await generateSourceImage(
      imageModel,
      'A cinematic watercolor illustration of a quiet Japanese tea garden at sunrise, soft mist, warm gold light, wide composition, no text.',
      'google-video-source-garden-dawn-1',
      '16:9'
    );
    lanternGardenImage = await generateSourceImage(
      imageModel,
      'A cinematic watercolor illustration of the same Japanese tea garden at night, glowing lanterns, cool moonlight, wide composition, no text.',
      'google-video-source-garden-night-1',
      '16:9'
    );
  }, 420000);

  it('should generate a standard text-to-video clip and save it locally', async () => {
    const result = await generateVideo(
      standardModel,
      {
        prompt:
          'A slow cinematic reveal of a misty rainforest waterfall at sunrise, drifting fog, gentle camera glide, rich natural color, no text.',
      },
      {
        apiKey,
        aspectRatio: '16:9',
        durationSeconds: 4,
        pollIntervalMs,
        resolution: '720p',
      },
      'google-video-standard-text-1'
    );

    const savedPath = await saveGoogleVideo(result, 'veo-standard-text-waterfall.mp4');

    expectVideoResult(result, standardModel, 4, '720p', savedPath);
  }, 600000);

  it('should generate a fast reference-image video and save it locally', async () => {
    const result = await generateVideo(
      fastModel,
      {
        prompt:
          'The same brass wind-up robot mascot steps onto the stage, gives a courteous bow, then raises one arm in a cheerful wave as warm spotlights sweep across the curtains.',
        referenceImages: [
          {
            image: robotReferenceImage,
            referenceType: 'asset',
          },
        ],
      },
      {
        apiKey,
        aspectRatio: '9:16',
        durationSeconds: 8,
        pollIntervalMs,
        resolution: '720p',
      },
      'google-video-fast-reference-1'
    );

    const savedPath = await saveGoogleVideo(result, 'veo-fast-reference-robot.mp4');

    expectVideoResult(result, fastModel, 8, '720p', savedPath);
  }, 600000);

  it('should attempt fast first-and-last-frame interpolation and save it when supported', async () => {
    try {
      const result = await generateVideo(
        fastModel,
        {
          prompt:
            'A gentle cinematic transition through the tea garden as dawn becomes lantern-lit evening, leaves rustle softly, the camera glides forward.',
          image: dawnGardenImage,
          lastFrame: lanternGardenImage,
        },
        {
          apiKey,
          aspectRatio: '16:9',
          durationSeconds: 4,
          pollIntervalMs,
          resolution: '720p',
        },
        'google-video-fast-interpolation-1'
      );

      const savedPath = await saveGoogleVideo(result, 'veo-fast-interpolation-garden.mp4');

      expectVideoResult(result, fastModel, 4, '720p', savedPath);
    } catch (error) {
      expect(getGoogleErrorMessage(error)).toMatch(/use case is currently not supported/i);
    }
  }, 600000);

  it('should extend a fast Veo video and save both clips locally', async () => {
    const baseResult = await generateVideo(
      fastModel,
      {
        prompt:
          'An origami koi fish glides through a shallow reflective pool, the camera slowly tracking beside it as soft ripples fan outward.',
      },
      {
        apiKey,
        durationSeconds: 4,
        pollIntervalMs,
        resolution: '720p',
      },
      'google-video-fast-extension-base-1'
    );

    const baseSavedPath = await saveGoogleVideo(baseResult, 'veo-fast-extension-base-koi.mp4');
    expectVideoResult(baseResult, fastModel, 4, '720p', baseSavedPath);

    const sourceVideo = baseResult.videos[0];
    if (!sourceVideo) {
      throw new Error('Expected a generated base video for extension.');
    }

    const extensionResult = await generateVideo(
      fastModel,
      {
        prompt:
          'Continue tracking the origami koi as it circles a lily pad, pauses briefly near a reflected lantern, then swims onward while the water shimmers.',
        video: sourceVideo,
      },
      {
        apiKey,
        durationSeconds: 8,
        pollIntervalMs,
        resolution: '720p',
      },
      'google-video-fast-extension-1'
    );

    const extensionSavedPath = await saveGoogleVideo(
      extensionResult,
      'veo-fast-extension-koi-extended.mp4'
    );

    expectVideoResult(extensionResult, fastModel, 8, '720p', extensionSavedPath);
  }, 900000);

  it('should generate a lite image-to-video clip and save it locally', async () => {
    const result = await generateVideo(
      liteModel,
      {
        prompt:
          'The brass wind-up robot blinks, tilts its head, and spins a tiny umbrella while the camera eases closer, playful motion, no text.',
        image: robotReferenceImage,
      },
      {
        apiKey,
        aspectRatio: '9:16',
        durationSeconds: 4,
        pollIntervalMs,
        resolution: '720p',
      },
      'google-video-lite-image-to-video-1'
    );

    const savedPath = await saveGoogleVideo(result, 'veo-lite-image-to-video-robot.mp4');

    expectVideoResult(result, liteModel, 4, '720p', savedPath);
  }, 600000);

  async function saveGoogleVideo(
    result: BaseVideoResult<'google'>,
    fileName: string
  ): Promise<string> {
    const generatedVideo = result.response.generatedVideos?.[0]?.video;
    if (!generatedVideo) {
      throw new Error('Expected a generated video in the provider response.');
    }

    const downloadPath = resolve(artifactsDir, fileName);
    await googleClient.files.download({
      file: generatedVideo,
      downloadPath,
    });

    return downloadPath;
  }
});

async function generateSourceImage(
  model: ImageModel<'google'>,
  prompt: string,
  id: string,
  aspectRatio: '16:9' | '9:16'
): Promise<ImageContent> {
  const result = await generateImage(
    model,
    {
      prompt,
    },
    {
      apiKey,
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio,
        imageSize: '1K',
      },
    },
    id
  );

  const image = result.images[0];
  if (!image) {
    throw new Error(`Expected a generated source image for ${id}.`);
  }

  return image;
}

function expectVideoResult(
  result: BaseVideoResult<'google'>,
  model: VideoModel<'google'>,
  durationSeconds: number,
  resolution: VideoResolution,
  savedPath: string
): void {
  expect(result.api).toBe('google');
  expect(result.model).toBe(model);
  expect(result.operation.done).toBe(true);
  expect(result.videos.length).toBeGreaterThan(0);
  expect(result.duration).toBeGreaterThanOrEqual(0);

  const video = result.videos[0];
  expect(video).toBeDefined();
  if (video?.mimeType) {
    expect(video.mimeType.startsWith('video/')).toBe(true);
  }
  expect(Boolean(video?.uri || video?.data)).toBe(true);
  expect(video?.metadata?.generationProvider).toBe('google');
  expect(video?.metadata?.generationStage).toBe('final');
  expect(video?.metadata?.durationSeconds).toBe(durationSeconds);
  expect(video?.metadata?.resolution).toBe(resolution);

  expect(result.usage.available).toBe(true);
  expect(result.usage.source).toBe('estimated');
  expect(result.usage.durationSeconds).toBe(durationSeconds);
  expect(result.usage.billedSeconds).toBe(durationSeconds);
  expect(result.usage.numberOfVideos).toBe(1);
  expect(result.usage.resolution).toBe(resolution);
  expect(result.usage.cost).toEqual(
    calculateVideoCost(model, {
      billedSeconds: durationSeconds,
      resolution,
    })
  );
  expect(result.usage.cost?.total).toBeGreaterThan(0);

  expect(statSync(savedPath).size).toBeGreaterThan(0);
}

function getGoogleErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
