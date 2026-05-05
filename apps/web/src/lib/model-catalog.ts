'use client';

import type { Api, CuratedModelId, ReasoningEffort } from '@ank1015/llm-sdk';

export const CURATED_MODEL_IDS = [
  'azure-openai/gpt-5.5',
] as const satisfies readonly CuratedModelId[];

export const REASONING_EFFORTS = [
  'low',
  'medium',
  'high',
  'xhigh',
] as const satisfies readonly ReasoningEffort[];

export const PROVIDER_LABELS: Partial<Record<Api, string>> = {
  'azure-openai': 'Azure OpenAI',
};

export function getApiForModelId(modelId: CuratedModelId): Api {
  const [provider] = modelId.split('/');
  return provider as Api;
}

export function getShortModelId(modelId: CuratedModelId): string {
  return modelId.split('/')[1] ?? modelId;
}

export function formatChatModelLabel(modelId: CuratedModelId): string {
  const api = getApiForModelId(modelId);
  return `${PROVIDER_LABELS[api] ?? api} / ${getShortModelId(modelId)}`;
}
