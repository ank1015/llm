import { getModels, getProviders } from '@ank1015/llm-sdk';

import { createKeysAdapter } from '@/lib/api/keys';
import { apiError } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const providers = getProviders();
    const keysAdapter = createKeysAdapter();
    const providersWithKeys = new Set(await keysAdapter.list());

    const data = providers.map((api) => {
      const models = getModels(api);
      const supportedInputs = Array.from(new Set(models.flatMap((model) => model.input)));

      return {
        api,
        hasKey: providersWithKeys.has(api),
        modelCount: models.length,
        available: models.length > 0,
        supportsReasoning: models.some((model) => model.reasoning),
        supportsTools: models.some((model) => model.tools.length > 0),
        supportedInputs,
      };
    });

    return Response.json({
      ok: true,
      providers: data,
    });
  } catch {
    return apiError(500, {
      code: 'PROVIDERS_LIST_FAILED',
      message: 'Failed to load providers.',
    });
  }
}
