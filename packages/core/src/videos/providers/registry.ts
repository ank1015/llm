import type {
  BaseVideoResult,
  VideoApi,
  VideoGenerationContext,
  VideoModel,
  VideoOptionsForApi,
} from '../../types/index.js';

export type VideoGenerateFunction<TApi extends VideoApi> = (
  model: VideoModel<TApi>,
  context: VideoGenerationContext,
  options: VideoOptionsForApi<TApi>,
  id: string
) => Promise<BaseVideoResult<TApi>>;

export interface VideoProviderRegistration {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generate: VideoGenerateFunction<any>;
}

const registry = new Map<string, VideoProviderRegistration>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getVideoProviderGenerate(api: string): VideoGenerateFunction<any> | undefined {
  return registry.get(api)?.generate;
}

export function registerVideoProvider<TApi extends VideoApi>(
  api: TApi | (string & {}),
  registration: VideoProviderRegistration | VideoGenerateFunction<TApi>
): void {
  if (typeof registration === 'function') {
    registry.set(api, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      generate: registration as VideoGenerateFunction<any>,
    });
    return;
  }

  registry.set(api, registration);
}
