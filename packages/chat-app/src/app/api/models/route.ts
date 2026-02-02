import { getModels, getProviders } from '@ank1015/llm-sdk';

import type { Api, Model } from '@ank1015/llm-sdk';

import { parseApi } from '@/lib/api/keys';
import { apiError } from '@/lib/api/response';

type ModelInput = 'text' | 'image' | 'file';

export const runtime = 'nodejs';

function parseBooleanParam(value: string | null): boolean | undefined {
  if (value === null) {
    return undefined;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return undefined;
}

function parseInputParam(value: string | null): ModelInput | undefined {
  if (value === null) {
    return undefined;
  }
  if (value === 'text' || value === 'image' || value === 'file') {
    return value;
  }
  return undefined;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const apiParam = url.searchParams.get('api') ?? url.searchParams.get('provider');
  const reasoningParam = url.searchParams.get('reasoning');
  const inputParam = url.searchParams.get('input');
  const toolParam = url.searchParams.get('tool');

  const api = apiParam ? parseApi(apiParam) : undefined;
  if (apiParam && !api) {
    return apiError(400, {
      code: 'INVALID_PROVIDER',
      message: `Unsupported provider: ${apiParam}`,
    });
  }

  const reasoning = parseBooleanParam(reasoningParam);
  if (reasoningParam !== null && reasoning === undefined) {
    return apiError(400, {
      code: 'INVALID_REASONING_FILTER',
      message: 'Query param "reasoning" must be "true" or "false".',
    });
  }

  const input = parseInputParam(inputParam);
  if (inputParam !== null && input === undefined) {
    return apiError(400, {
      code: 'INVALID_INPUT_FILTER',
      message: 'Query param "input" must be one of: text, image, file.',
    });
  }

  let models: Model<Api>[];
  if (api) {
    models = getModels(api) as Model<Api>[];
  } else {
    models = getProviders().flatMap((provider) => getModels(provider)) as Model<Api>[];
  }

  if (reasoning !== undefined) {
    models = models.filter((model) => model.reasoning === reasoning);
  }
  if (input) {
    models = models.filter((model) => model.input.includes(input));
  }
  if (toolParam) {
    models = models.filter((model) => model.tools.includes(toolParam));
  }

  return Response.json({
    ok: true,
    filters: {
      api: api ?? null,
      reasoning: reasoning ?? null,
      input: input ?? null,
      tool: toolParam ?? null,
    },
    count: models.length,
    models,
  });
}
