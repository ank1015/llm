import { generateUUID } from '../utils/uuid.js';

import { getImageProviderGenerate } from './providers/registry.js';

import type {
  BaseImageResult,
  ImageApi,
  ImageGenerationContext,
  ImageModel,
  ImageOptionsForApi,
} from '../types/index.js';

export async function generateImage<TApi extends ImageApi>(
  model: ImageModel<TApi>,
  context: ImageGenerationContext,
  options: ImageOptionsForApi<TApi>,
  id?: string
): Promise<BaseImageResult<TApi>> {
  const providerGenerate = getImageProviderGenerate(model.api);
  if (!providerGenerate) {
    throw new Error(
      `Unsupported image API: ${model.api}. Use registerImageProvider() to add custom image providers.`
    );
  }

  return providerGenerate(model, context, options, id ?? generateUUID()) as Promise<
    BaseImageResult<TApi>
  >;
}
