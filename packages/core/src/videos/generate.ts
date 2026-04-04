import { generateUUID } from '../utils/uuid.js';

import { getVideoProviderGenerate } from './providers/registry.js';

import type {
  BaseVideoResult,
  VideoApi,
  VideoGenerationContext,
  VideoModel,
  VideoOptionsForApi,
} from '../types/index.js';

export async function generateVideo<TApi extends VideoApi>(
  model: VideoModel<TApi>,
  context: VideoGenerationContext,
  options: VideoOptionsForApi<TApi>,
  id?: string
): Promise<BaseVideoResult<TApi>> {
  const providerGenerate = getVideoProviderGenerate(model.api);
  if (!providerGenerate) {
    throw new Error(
      `Unsupported video API: ${model.api}. Use registerVideoProvider() to add custom video providers.`
    );
  }

  return providerGenerate(model, context, options, id ?? generateUUID()) as Promise<
    BaseVideoResult<TApi>
  >;
}
