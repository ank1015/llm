import { CuratedModelIds, type CuratedModelId } from '@ank1015/llm-sdk';
import { Hono } from 'hono';

import type { ModelApi, ModelProviderDto, ModelsCatalogResponse } from '../contracts/index.js';

const API_LABELS: Record<ModelApi, string> = {
  openai: 'OpenAI',
  codex: 'Codex',
  anthropic: 'Claude',
  'claude-code': 'Claude Code',
  google: 'Gemini',
};

function getModelApi(modelId: CuratedModelId): ModelApi {
  return modelId.split('/')[0] as ModelApi;
}

function formatModelLabel(modelId: CuratedModelId): string {
  const shortModelId = modelId.split('/')[1] ?? modelId;

  if (shortModelId.startsWith('gpt-')) {
    return shortModelId
      .replace(/^gpt-/, 'GPT-')
      .replace(/-mini\b/g, ' Mini')
      .replace(/-nano\b/g, ' Nano')
      .replace(/-pro\b/g, ' Pro')
      .replace(/-codex\b/g, ' Codex')
      .replace(/-spark\b/g, ' Spark');
  }

  const normalized = shortModelId.replace(/-(\d+)-(\d+)$/, ' $1.$2');
  return normalized
    .split('-')
    .map((part, index) => {
      if (index === 0) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }

      if (/^\d+(?:\.\d+)?$/.test(part)) {
        return part;
      }

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

function buildProviders(): ModelProviderDto[] {
  const providers = new Map<ModelApi, ModelProviderDto>();

  for (const modelId of CuratedModelIds) {
    const api = getModelApi(modelId);
    const provider = providers.get(api);

    if (provider) {
      provider.models.push({
        modelId,
        label: formatModelLabel(modelId),
      });
      continue;
    }

    providers.set(api, {
      api,
      label: API_LABELS[api],
      models: [
        {
          modelId,
          label: formatModelLabel(modelId),
        },
      ],
    });
  }

  return Array.from(providers.values());
}

export const modelRoutes = new Hono();

modelRoutes.get('/models', (c) => {
  return c.json<ModelsCatalogResponse>({
    providers: buildProviders(),
  });
});
