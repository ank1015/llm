import { KnownVideoApis } from '../../types/index.js';

import { VIDEO_MODELS } from './index.js';

import type { VideoApi, VideoModel, VideoResolution, VideoUsage } from '../../types/index.js';

type VideoModelIdsForApi<TApi extends VideoApi> = TApi extends keyof typeof VIDEO_MODELS
  ? keyof (typeof VIDEO_MODELS)[TApi]
  : never;

export function getVideoProviders(): VideoApi[] {
  return [...KnownVideoApis];
}

export function getVideoModel<TApi extends VideoApi>(
  api: TApi,
  modelId: VideoModelIdsForApi<TApi>
): VideoModel<TApi> | undefined {
  const modelsForApi = VIDEO_MODELS[api as keyof typeof VIDEO_MODELS];
  if (!modelsForApi) return undefined;

  return modelsForApi[modelId as keyof typeof modelsForApi] as VideoModel<TApi> | undefined;
}

export function getVideoModels<TApi extends VideoApi>(api: TApi): VideoModel<TApi>[] {
  const modelsForApi = VIDEO_MODELS[api as keyof typeof VIDEO_MODELS];
  if (!modelsForApi) return [];

  return Object.values(modelsForApi) as VideoModel<TApi>[];
}

export function getVideoRatePerSecond<TApi extends VideoApi>(
  model: VideoModel<TApi>,
  resolution: VideoResolution
): number | undefined {
  return model.cost[resolution];
}

export function calculateVideoCost<TApi extends VideoApi>(
  model: VideoModel<TApi>,
  usage: Pick<VideoUsage, 'billedSeconds' | 'resolution'>
): NonNullable<VideoUsage['cost']> {
  if (!usage.resolution) {
    throw new Error('Video resolution is required to calculate video cost.');
  }

  if (typeof usage.billedSeconds !== 'number' || usage.billedSeconds < 0) {
    throw new Error('Video billedSeconds must be a non-negative number.');
  }

  const ratePerSecond = getVideoRatePerSecond(model, usage.resolution);
  if (typeof ratePerSecond !== 'number') {
    throw new Error(
      `No video pricing configured for model ${model.id} at resolution ${usage.resolution}.`
    );
  }

  return {
    resolution: usage.resolution,
    ratePerSecond,
    billedSeconds: usage.billedSeconds,
    total: ratePerSecond * usage.billedSeconds,
  };
}
