import { KnownApis } from '@ank1015/llm-types';

import { MODELS } from './index.js';

import type { Api, Model, Usage } from '@ank1015/llm-types';

// Extract valid model IDs for a specific API
type ModelIdsForApi<TApi extends Api> = TApi extends keyof typeof MODELS
  ? keyof (typeof MODELS)[TApi]
  : never;

export function getProviders(): Api[] {
  return [...KnownApis];
}

export function getModel<TApi extends Api>(
  api: TApi,
  modelId: ModelIdsForApi<TApi>
): Model<TApi> | undefined {
  const modelsForApi = MODELS[api as keyof typeof MODELS];
  if (!modelsForApi) return undefined;

  // Safe cast: ModelIdsForApi<TApi> guarantees modelId is a valid key for this API's models
  return modelsForApi[modelId as keyof typeof modelsForApi] as Model<TApi> | undefined;
}

export function getModels<TApi extends Api>(api: TApi): Model<TApi>[] {
  const modelsForApi = MODELS[api as keyof typeof MODELS];
  if (!modelsForApi) return [];
  return Object.values(modelsForApi) as Model<TApi>[];
}

/**
 * Calculate cost based on model pricing and token usage.
 * Returns a new cost object without mutating the input.
 */
export function calculateCost<TApi extends Api>(model: Model<TApi>, usage: Usage): Usage['cost'] {
  const input = (model.cost.input / 1000000) * usage.input;
  const output = (model.cost.output / 1000000) * usage.output;
  const cacheRead = (model.cost.cacheRead / 1000000) * usage.cacheRead;
  const cacheWrite = (model.cost.cacheWrite / 1000000) * usage.cacheWrite;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    total: input + output + cacheRead + cacheWrite,
  };
}
