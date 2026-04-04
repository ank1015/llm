import { generateUUID } from '../utils/uuid.js';

import { getMusicProviderGenerate } from './providers/registry.js';

import type {
  BaseMusicResult,
  MusicApi,
  MusicGenerationContext,
  MusicModel,
  MusicOptionsForApi,
} from '../types/index.js';

export async function generateMusic<TApi extends MusicApi>(
  model: MusicModel<TApi>,
  context: MusicGenerationContext,
  options: MusicOptionsForApi<TApi>,
  id?: string
): Promise<BaseMusicResult<TApi>> {
  const providerGenerate = getMusicProviderGenerate(model.api);
  if (!providerGenerate) {
    throw new Error(
      `Unsupported music API: ${model.api}. Use registerMusicProvider() to add custom music providers.`
    );
  }

  return providerGenerate(model, context, options, id ?? generateUUID()) as Promise<
    BaseMusicResult<TApi>
  >;
}
