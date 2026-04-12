import { KnownImageApis } from '../../types/index.js';

import { IMAGE_MODELS } from './index.js';

import type { ImageApi, ImageModel, ImageUsage } from '../../types/index.js';

type ImageModelIdsForApi<TApi extends ImageApi> = TApi extends keyof typeof IMAGE_MODELS
  ? keyof (typeof IMAGE_MODELS)[TApi]
  : never;

export function getImageProviders(): ImageApi[] {
  return [...KnownImageApis];
}

export function getImageModel<TApi extends ImageApi>(
  api: TApi,
  modelId: ImageModelIdsForApi<TApi>
): ImageModel<TApi> | undefined {
  const modelsForApi = IMAGE_MODELS[api as keyof typeof IMAGE_MODELS];
  if (!modelsForApi) return undefined;

  return modelsForApi[modelId as keyof typeof modelsForApi] as ImageModel<TApi> | undefined;
}

export function getImageModels<TApi extends ImageApi>(api: TApi): ImageModel<TApi>[] {
  const modelsForApi = IMAGE_MODELS[api as keyof typeof IMAGE_MODELS];
  if (!modelsForApi) return [];

  return Object.values(modelsForApi) as ImageModel<TApi>[];
}

export function calculateImageCost<TApi extends ImageApi>(
  model: ImageModel<TApi>,
  usage: Omit<ImageUsage, 'cost'>
): ImageUsage['cost'] {
  const inputText = (model.cost.inputText / 1000000) * usage.inputText;
  const inputImage = (model.cost.inputImage / 1000000) * usage.inputImage;
  const outputText = (model.cost.outputText / 1000000) * usage.outputText;
  const outputImage = (model.cost.outputImage / 1000000) * usage.outputImage;
  const reasoning = (model.cost.reasoning / 1000000) * usage.reasoning;

  return {
    inputText,
    inputImage,
    outputText,
    outputImage,
    reasoning,
    total: inputText + inputImage + outputText + outputImage + reasoning,
  };
}
