import { KnownApis } from '@ank1015/llm-sdk';

import { createKeysAdapter } from '@/lib/api/keys';
import { apiError } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const keysAdapter = createKeysAdapter();
    const apisWithKeys = new Set(await keysAdapter.list());

    return Response.json({
      ok: true,
      providers: KnownApis.map((api) => ({
        api,
        hasKey: apisWithKeys.has(api),
      })),
    });
  } catch {
    return apiError(500, {
      code: 'KEYS_LIST_FAILED',
      message: 'Failed to load API key status.',
    });
  }
}
