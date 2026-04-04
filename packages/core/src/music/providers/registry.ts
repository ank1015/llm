import type {
  BaseMusicResult,
  MusicApi,
  MusicGenerationContext,
  MusicModel,
  MusicOptionsForApi,
} from '../../types/index.js';

export type MusicGenerateFunction<TApi extends MusicApi> = (
  model: MusicModel<TApi>,
  context: MusicGenerationContext,
  options: MusicOptionsForApi<TApi>,
  id: string
) => Promise<BaseMusicResult<TApi>>;

export interface MusicProviderRegistration {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generate: MusicGenerateFunction<any>;
}

const registry = new Map<string, MusicProviderRegistration>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMusicProviderGenerate(api: string): MusicGenerateFunction<any> | undefined {
  return registry.get(api)?.generate;
}

export function registerMusicProvider<TApi extends MusicApi>(
  api: TApi | (string & {}),
  registration: MusicProviderRegistration | MusicGenerateFunction<TApi>
): void {
  if (typeof registration === 'function') {
    registry.set(api, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      generate: registration as MusicGenerateFunction<any>,
    });
    return;
  }

  registry.set(api, registration);
}
