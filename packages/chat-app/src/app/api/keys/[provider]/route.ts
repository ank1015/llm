import { parseApi, createKeysAdapter } from '@/lib/api/keys';
import { apiError } from '@/lib/api/response';

type KeysRouteContext = {
  params: Promise<{
    provider: string;
  }>;
};

type PutBody = {
  key: string;
};

export const runtime = 'nodejs';

function parsePutBody(value: unknown): PutBody | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const key = (value as { key?: unknown }).key;
  if (typeof key !== 'string' || key.trim().length === 0) {
    return undefined;
  }

  return { key: key.trim() };
}

export async function PUT(request: Request, context: KeysRouteContext): Promise<Response> {
  const { provider: providerParam } = await context.params;
  const provider = parseApi(providerParam);

  if (!provider) {
    return apiError(400, {
      code: 'INVALID_PROVIDER',
      message: `Unsupported provider: ${providerParam}`,
    });
  }

  const requestBody = await request.json().catch(() => undefined);
  const body = parsePutBody(requestBody);

  if (!body) {
    return apiError(400, {
      code: 'INVALID_BODY',
      message: 'Request body must be valid JSON with a non-empty "key" string.',
    });
  }

  try {
    const keysAdapter = createKeysAdapter();
    await keysAdapter.set(provider, body.key);

    return Response.json({
      ok: true,
      provider,
    });
  } catch {
    return apiError(500, {
      code: 'KEY_SAVE_FAILED',
      message: 'Failed to save API key.',
    });
  }
}

export async function DELETE(_request: Request, context: KeysRouteContext): Promise<Response> {
  const { provider: providerParam } = await context.params;
  const provider = parseApi(providerParam);

  if (!provider) {
    return apiError(400, {
      code: 'INVALID_PROVIDER',
      message: `Unsupported provider: ${providerParam}`,
    });
  }

  try {
    const keysAdapter = createKeysAdapter();
    const deleted = await keysAdapter.delete(provider);

    if (!deleted) {
      return apiError(404, {
        code: 'KEY_NOT_FOUND',
        message: `No API key found for provider: ${provider}`,
      });
    }

    return Response.json({
      ok: true,
      provider,
      deleted,
    });
  } catch {
    return apiError(500, {
      code: 'KEY_DELETE_FAILED',
      message: 'Failed to delete API key.',
    });
  }
}
