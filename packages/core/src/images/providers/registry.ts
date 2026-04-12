import type {
  BaseImageResult,
  ImageApi,
  ImageGenerationContext,
  ImageModel,
  ImageOptionsForApi,
} from '../../types/index.js';

export type ImageGenerateFunction<TApi extends ImageApi> = (
  model: ImageModel<TApi>,
  context: ImageGenerationContext,
  options: ImageOptionsForApi<TApi>,
  id: string
) => Promise<BaseImageResult<TApi>>;

export interface ImageProviderRegistration {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generate: ImageGenerateFunction<any>;
}

const registry = new Map<string, ImageProviderRegistration>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getImageProviderGenerate(api: string): ImageGenerateFunction<any> | undefined {
  return registry.get(api)?.generate;
}

export function registerImageProvider<TApi extends ImageApi>(
  api: TApi | (string & {}),
  registration: ImageProviderRegistration | ImageGenerateFunction<TApi>
): void {
  if (typeof registration === 'function') {
    registry.set(api, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      generate: registration as ImageGenerateFunction<any>,
    });
    return;
  }

  registry.set(api, registration);
}
