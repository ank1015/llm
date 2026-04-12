import { KnownMusicApis } from '../../types/index.js';

import { MUSIC_MODELS } from './index.js';

import type { MusicApi, MusicModel, MusicUsage } from '../../types/index.js';

type MusicModelIdsForApi<TApi extends MusicApi> = TApi extends keyof typeof MUSIC_MODELS
  ? keyof (typeof MUSIC_MODELS)[TApi]
  : never;

export function getMusicProviders(): MusicApi[] {
  return [...KnownMusicApis];
}

export function getMusicModel<TApi extends MusicApi>(
  api: TApi,
  modelId: MusicModelIdsForApi<TApi>
): MusicModel<TApi> | undefined {
  const modelsForApi = MUSIC_MODELS[api as keyof typeof MUSIC_MODELS];
  if (!modelsForApi) return undefined;

  return modelsForApi[modelId as keyof typeof modelsForApi] as MusicModel<TApi> | undefined;
}

export function getMusicModels<TApi extends MusicApi>(api: TApi): MusicModel<TApi>[] {
  const modelsForApi = MUSIC_MODELS[api as keyof typeof MUSIC_MODELS];
  if (!modelsForApi) return [];

  return Object.values(modelsForApi) as MusicModel<TApi>[];
}

export function calculateMusicCost<TApi extends MusicApi>(
  model: MusicModel<TApi>,
  requests = 1
): MusicUsage['cost'] {
  return {
    request: model.cost.request,
    total: model.cost.request * requests,
  };
}
