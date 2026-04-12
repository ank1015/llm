import {
  type GenerateVideosOperation,
  type GenerateVideosParameters,
  type GenerateVideosResponse,
  GoogleGenAI,
  VideoGenerationReferenceType,
} from '@google/genai';

import { sanitizeSurrogates } from '../../../utils/sanitize-unicode.js';
import { calculateVideoCost, getVideoRatePerSecond } from '../../models/index.js';

import type {
  BaseVideoResult,
  GoogleVideoProviderOptions,
  ImageContent,
  VideoAsset,
  VideoAspectRatio,
  VideoDurationSeconds,
  VideoGenerationContext,
  VideoModel,
  VideoReferenceImage,
  VideoResolution,
  VideoUsage,
} from '../../../types/index.js';

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 6 * 60_000;
const DEFAULT_VIDEO_DURATION_SECONDS: VideoDurationSeconds = 8;
const DEFAULT_VIDEO_NUMBER_OF_VIDEOS = 1;
const DEFAULT_VIDEO_RESOLUTION: VideoResolution = '720p';

export function createGoogleVideoClient(model: VideoModel<'google'>, apiKey: string): GoogleGenAI {
  if (!apiKey) {
    throw new Error('Google API key is required.');
  }

  if (model.headers) {
    return new GoogleGenAI({
      apiKey,
      httpOptions: { headers: model.headers },
    });
  }

  return new GoogleGenAI({ apiKey });
}

export function buildGoogleVideoParams(
  model: VideoModel<'google'>,
  context: VideoGenerationContext,
  options: GoogleVideoProviderOptions
): GenerateVideosParameters {
  validateGoogleVideoRequest(model, context, options);

  const { apiKey, pollIntervalMs, signal, timeoutMs, ...nativeOptions } = options;

  void apiKey;
  void pollIntervalMs;
  void timeoutMs;

  const resolvedDurationSeconds = resolveGoogleVideoDurationSeconds(nativeOptions.durationSeconds);
  const resolvedNumberOfVideos = resolveGoogleVideoNumberOfVideos(nativeOptions.numberOfVideos);
  const resolvedResolution = resolveGoogleVideoResolution(nativeOptions.resolution);

  const config = {
    ...nativeOptions,
    durationSeconds: resolvedDurationSeconds,
    numberOfVideos: resolvedNumberOfVideos,
    resolution: resolvedResolution,
    ...(typeof nativeOptions.negativePrompt === 'string'
      ? { negativePrompt: sanitizeSurrogates(nativeOptions.negativePrompt) }
      : {}),
    ...(context.lastFrame ? { lastFrame: toGoogleVideoImage(context.lastFrame) } : {}),
    ...(context.referenceImages?.length
      ? {
          referenceImages: context.referenceImages.map((referenceImage) =>
            toGoogleVideoReferenceImage(referenceImage)
          ),
        }
      : {}),
    ...(signal ? { abortSignal: signal } : {}),
  };

  return {
    model: model.id,
    ...(context.prompt ? { prompt: sanitizeSurrogates(context.prompt) } : {}),
    ...(context.image ? { image: toGoogleVideoImage(context.image) } : {}),
    ...(context.video ? { video: toGoogleVideoInput(context.video) } : {}),
    config,
  };
}

export function normalizeGoogleVideoResponse(
  model: VideoModel<'google'>,
  response: GenerateVideosResponse,
  options: GoogleVideoProviderOptions
): Pick<BaseVideoResult<'google'>, 'videos' | 'usage'> {
  const usage = estimateGoogleVideoUsage(model, options);
  const videos: VideoAsset[] = [];

  for (const [videoIndex, generatedVideo] of (response.generatedVideos || []).entries()) {
    const video = generatedVideo.video;
    if (!video?.videoBytes && !video?.uri) {
      continue;
    }

    const mimeType = video.mimeType ?? inferGoogleVideoMimeType(video.uri);

    videos.push({
      type: 'video',
      ...(video.videoBytes ? { data: video.videoBytes } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(video.uri ? { uri: video.uri } : {}),
      metadata: {
        videoIndex,
        generationProvider: 'google',
        generationStage: 'final',
        ...(usage.durationSeconds ? { durationSeconds: usage.durationSeconds } : {}),
        ...(usage.resolution ? { resolution: usage.resolution } : {}),
      },
    });
  }

  return { videos, usage };
}

export async function waitForGoogleVideoOperation(
  client: Pick<GoogleGenAI, 'operations'>,
  operation: GenerateVideosOperation,
  options: Pick<GoogleVideoProviderOptions, 'pollIntervalMs' | 'signal' | 'timeoutMs'>
): Promise<GenerateVideosOperation> {
  const pollIntervalMs = Math.max(options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS, 0);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();

  let currentOperation = operation;
  while (!currentOperation.done) {
    throwIfAborted(options.signal);

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Google video generation timed out after ${timeoutMs}ms.`);
    }

    await waitForPollInterval(pollIntervalMs, options.signal);
    currentOperation = await client.operations.getVideosOperation({
      operation: currentOperation,
      ...(options.signal ? { config: { abortSignal: options.signal } } : {}),
    });
  }

  throwIfAborted(options.signal);
  return currentOperation;
}

export async function generateGoogleVideo(
  model: VideoModel<'google'>,
  context: VideoGenerationContext,
  options: GoogleVideoProviderOptions,
  id: string
): Promise<BaseVideoResult<'google'>> {
  const startTimestamp = Date.now();
  const client = createGoogleVideoClient(model, options.apiKey);
  const initialOperation = await client.models.generateVideos(
    buildGoogleVideoParams(model, context, options)
  );
  const operation = await waitForGoogleVideoOperation(client, initialOperation, options);

  if (operation.error) {
    throw new Error(getGoogleVideoOperationErrorMessage(operation.error));
  }

  if (!operation.response) {
    throw new Error('Google video generation completed without a response.');
  }

  const normalized = normalizeGoogleVideoResponse(model, operation.response, options);

  if (normalized.videos.length === 0) {
    throw new Error(getGoogleVideoEmptyResponseMessage(operation.response));
  }

  return {
    id,
    api: 'google',
    model,
    operation,
    response: operation.response,
    videos: normalized.videos,
    usage: normalized.usage,
    timestamp: Date.now(),
    duration: Date.now() - startTimestamp,
  };
}

function validateGoogleVideoRequest(
  model: VideoModel<'google'>,
  context: VideoGenerationContext,
  options: GoogleVideoProviderOptions
): void {
  validateGoogleVideoContext(model, context);

  const durationSeconds = resolveGoogleVideoDurationSeconds(options.durationSeconds);
  const numberOfVideos = resolveGoogleVideoNumberOfVideos(options.numberOfVideos);
  const resolution = resolveGoogleVideoResolution(options.resolution);

  if (options.aspectRatio) {
    validateGoogleVideoAspectRatio(model, options.aspectRatio);
  }

  validateGoogleVideoModelCapabilities(model, context, durationSeconds, resolution, numberOfVideos);
  validateGoogleVideoReferenceMode(model, context, durationSeconds);
  validateGoogleVideoExtensionMode(model, context, durationSeconds, resolution);
}

function validateGoogleVideoContext(
  model: VideoModel<'google'>,
  context: VideoGenerationContext
): void {
  if (!context.prompt && !context.image && !context.video) {
    throw new Error('Google video generation requires at least one of prompt, image, or video.');
  }

  if (context.image && context.video) {
    throw new Error('Google video generation does not support image and video inputs together.');
  }

  if (context.lastFrame && !context.image) {
    throw new Error('Google video generation requires an input image when lastFrame is provided.');
  }

  if (context.referenceImages?.length && !context.prompt) {
    throw new Error('Google video generation requires a prompt when referenceImages are used.');
  }

  if (context.referenceImages?.length && (context.image || context.video || context.lastFrame)) {
    throw new Error(
      'Google video generation does not support referenceImages with image, video, or lastFrame inputs.'
    );
  }

  if (context.video && !model.capabilities.videoExtension) {
    throw new Error(`Model ${model.id} does not support video extension.`);
  }
}

function validateGoogleVideoAspectRatio(
  model: VideoModel<'google'>,
  aspectRatio: string
): asserts aspectRatio is VideoAspectRatio {
  if (aspectRatio !== '16:9' && aspectRatio !== '9:16') {
    throw new Error(`Unsupported Google video aspect ratio: ${aspectRatio}.`);
  }

  if (!model.capabilities.supportedAspectRatios.includes(aspectRatio)) {
    throw new Error(`Model ${model.id} does not support aspectRatio=${aspectRatio}.`);
  }
}

function validateGoogleVideoModelCapabilities(
  model: VideoModel<'google'>,
  context: VideoGenerationContext,
  durationSeconds: VideoDurationSeconds,
  resolution: VideoResolution,
  numberOfVideos: number
): void {
  if (!model.capabilities.supportedDurations.includes(durationSeconds)) {
    throw new Error(`Model ${model.id} does not support ${durationSeconds}s video duration.`);
  }

  if (!model.capabilities.supportedResolutions.includes(resolution)) {
    throw new Error(`Model ${model.id} does not support ${resolution} video output.`);
  }

  if (numberOfVideos > model.capabilities.maxVideosPerRequest) {
    throw new Error(
      `Model ${model.id} supports up to ${model.capabilities.maxVideosPerRequest} video per request.`
    );
  }

  if (context.image && !model.input.includes('image')) {
    throw new Error(`Model ${model.id} does not support image-to-video inputs.`);
  }

  if (context.video && !model.input.includes('video')) {
    throw new Error(`Model ${model.id} does not support video extension inputs.`);
  }

  if (context.lastFrame && !model.capabilities.interpolation) {
    throw new Error(`Model ${model.id} does not support first/last-frame interpolation.`);
  }

  if (resolution !== '720p' && durationSeconds !== 8) {
    throw new Error(`Model ${model.id} requires durationSeconds=8 for ${resolution} video output.`);
  }
}

function validateGoogleVideoReferenceMode(
  model: VideoModel<'google'>,
  context: VideoGenerationContext,
  durationSeconds: VideoDurationSeconds
): void {
  if (!context.referenceImages?.length) {
    return;
  }

  if (!model.capabilities.referenceImages) {
    throw new Error(`Model ${model.id} does not support referenceImages.`);
  }

  if (context.referenceImages.length > model.capabilities.maxReferenceImages) {
    throw new Error(
      `Model ${model.id} supports up to ${model.capabilities.maxReferenceImages} reference images.`
    );
  }

  if (durationSeconds !== 8) {
    throw new Error(`Model ${model.id} requires durationSeconds=8 with referenceImages.`);
  }
}

function validateGoogleVideoExtensionMode(
  model: VideoModel<'google'>,
  context: VideoGenerationContext,
  durationSeconds: VideoDurationSeconds,
  resolution: VideoResolution
): void {
  if (!context.video) {
    return;
  }

  if (!model.capabilities.videoExtension) {
    throw new Error(`Model ${model.id} does not support video extension.`);
  }

  if (durationSeconds !== 8) {
    throw new Error(`Model ${model.id} requires durationSeconds=8 when extending video.`);
  }

  if (resolution !== '720p') {
    throw new Error(`Model ${model.id} only supports 720p video extension output.`);
  }
}

function estimateGoogleVideoUsage(
  model: VideoModel<'google'>,
  options: GoogleVideoProviderOptions
): VideoUsage {
  const durationSeconds = resolveGoogleVideoDurationSeconds(options.durationSeconds);
  const numberOfVideos = resolveGoogleVideoNumberOfVideos(options.numberOfVideos);
  const resolution = resolveGoogleVideoResolution(options.resolution);
  const billedSeconds = durationSeconds * numberOfVideos;
  const ratePerSecond = getVideoRatePerSecond(model, resolution);

  if (typeof ratePerSecond !== 'number') {
    return {
      available: false,
      source: 'unavailable',
      reason: `No video pricing configured for model ${model.id} at resolution ${resolution}.`,
      durationSeconds,
      billedSeconds,
      numberOfVideos,
      resolution,
    };
  }

  return {
    available: true,
    source: 'estimated',
    reason: 'Estimated from Google Veo model pricing and request settings.',
    durationSeconds,
    billedSeconds,
    numberOfVideos,
    resolution,
    cost: calculateVideoCost(model, {
      billedSeconds,
      resolution,
    }),
  };
}

function resolveGoogleVideoDurationSeconds(durationSeconds?: number): VideoDurationSeconds {
  const resolvedDurationSeconds = durationSeconds ?? DEFAULT_VIDEO_DURATION_SECONDS;
  if (
    resolvedDurationSeconds !== 4 &&
    resolvedDurationSeconds !== 6 &&
    resolvedDurationSeconds !== 8
  ) {
    throw new Error(
      `Unsupported Google video durationSeconds: ${resolvedDurationSeconds}. Expected 4, 6, or 8.`
    );
  }

  return resolvedDurationSeconds;
}

function resolveGoogleVideoNumberOfVideos(numberOfVideos?: number): number {
  const resolvedNumberOfVideos = numberOfVideos ?? DEFAULT_VIDEO_NUMBER_OF_VIDEOS;
  if (!Number.isInteger(resolvedNumberOfVideos) || resolvedNumberOfVideos < 1) {
    throw new Error(
      `Unsupported Google video numberOfVideos: ${resolvedNumberOfVideos}. Expected a positive integer.`
    );
  }

  return resolvedNumberOfVideos;
}

function resolveGoogleVideoResolution(resolution?: string): VideoResolution {
  const resolvedResolution = resolution ?? DEFAULT_VIDEO_RESOLUTION;
  if (
    resolvedResolution !== '720p' &&
    resolvedResolution !== '1080p' &&
    resolvedResolution !== '4k'
  ) {
    throw new Error(
      `Unsupported Google video resolution: ${resolvedResolution}. Expected 720p, 1080p, or 4k.`
    );
  }

  return resolvedResolution;
}

function toGoogleVideoImage(image: ImageContent): { imageBytes: string; mimeType: string } {
  return {
    imageBytes: image.data,
    mimeType: image.mimeType,
  };
}

function toGoogleVideoInput(video: VideoAsset): {
  videoBytes?: string;
  mimeType?: string;
  uri?: string;
} {
  if (video.data) {
    return {
      videoBytes: video.data,
      ...(video.mimeType ? { mimeType: video.mimeType } : {}),
    };
  }

  if (video.uri) {
    return {
      uri: video.uri,
    };
  }

  return {};
}

function toGoogleVideoReferenceImage(referenceImage: VideoReferenceImage): {
  image: { imageBytes: string; mimeType: string };
  referenceType?: VideoGenerationReferenceType;
} {
  return {
    image: toGoogleVideoImage(referenceImage.image),
    ...(referenceImage.referenceType
      ? { referenceType: normalizeGoogleVideoReferenceType(referenceImage.referenceType) }
      : {}),
  };
}

function normalizeGoogleVideoReferenceType(
  referenceType: VideoReferenceImage['referenceType']
): VideoGenerationReferenceType {
  return referenceType === 'style'
    ? VideoGenerationReferenceType.STYLE
    : VideoGenerationReferenceType.ASSET;
}

function inferGoogleVideoMimeType(uri?: string): string | undefined {
  if (!uri) {
    return 'video/mp4';
  }

  if (uri.endsWith('.mov')) {
    return 'video/quicktime';
  }

  if (uri.endsWith('.webm')) {
    return 'video/webm';
  }

  return 'video/mp4';
}

function getGoogleVideoOperationErrorMessage(error: Record<string, unknown>): string {
  if (typeof error.message === 'string' && error.message.length > 0) {
    return `Google video generation failed: ${error.message}`;
  }

  return `Google video generation failed: ${JSON.stringify(error)}`;
}

function getGoogleVideoEmptyResponseMessage(response: GenerateVideosResponse): string {
  if (response.raiMediaFilteredReasons?.length) {
    return `Google video generation did not return videos. Filter reasons: ${response.raiMediaFilteredReasons.join(', ')}`;
  }

  return 'Google video generation did not return any videos.';
}

function waitForPollInterval(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) {
    throwIfAborted(signal);
    return Promise.resolve();
  }

  if (signal?.aborted) {
    return Promise.reject(getAbortError(signal));
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);

    const onAbort = (): void => {
      clearTimeout(timeout);
      cleanup();
      reject(getAbortError(signal));
    };

    const cleanup = (): void => {
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw getAbortError(signal);
  }
}

function getAbortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }

  return new Error('Request was aborted');
}
