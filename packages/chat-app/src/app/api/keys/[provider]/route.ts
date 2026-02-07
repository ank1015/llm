import type { Api } from '@ank1015/llm-sdk';

import { parseApi, createKeysAdapter } from '@/lib/api/keys';
import { apiError } from '@/lib/api/response';

type KeysRouteContext = {
  params: Promise<{
    provider: string;
  }>;
};

type PutBody =
  | {
      kind: 'key';
      key: string;
    }
  | {
      kind: 'credentials';
      credentials: Record<string, string>;
    };

export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNonEmptyString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePutBody(provider: Api, value: unknown): PutBody | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const body = value as Record<string, unknown>;
  const credentialsSource = isRecord(body.credentials) ? body.credentials : undefined;

  if (provider === 'claude-code') {
    const oauthToken =
      getNonEmptyString(body, 'oauthToken') ??
      getNonEmptyString(credentialsSource ?? {}, 'oauthToken');
    const betaFlag =
      getNonEmptyString(body, 'betaFlag') ?? getNonEmptyString(credentialsSource ?? {}, 'betaFlag');
    const billingHeader =
      getNonEmptyString(body, 'billingHeader') ??
      getNonEmptyString(credentialsSource ?? {}, 'billingHeader');

    if (!oauthToken || !betaFlag || !billingHeader) {
      return undefined;
    }

    return {
      kind: 'credentials',
      credentials: {
        oauthToken,
        betaFlag,
        billingHeader,
      },
    };
  }

  if (provider === 'codex') {
    const apiKey =
      getNonEmptyString(body, 'apiKey') ??
      getNonEmptyString(body, 'key') ??
      getNonEmptyString(body, 'access_token') ??
      getNonEmptyString(body, 'accessToken') ??
      getNonEmptyString(body, 'token') ??
      getNonEmptyString(credentialsSource ?? {}, 'apiKey') ??
      getNonEmptyString(credentialsSource ?? {}, 'key') ??
      getNonEmptyString(credentialsSource ?? {}, 'access_token') ??
      getNonEmptyString(credentialsSource ?? {}, 'accessToken') ??
      getNonEmptyString(credentialsSource ?? {}, 'token');
    const accountId =
      getNonEmptyString(body, 'chatgpt-account-id') ??
      getNonEmptyString(body, 'chatgptAccountId') ??
      getNonEmptyString(body, 'accountId') ??
      getNonEmptyString(body, 'account_id') ??
      getNonEmptyString(credentialsSource ?? {}, 'chatgpt-account-id') ??
      getNonEmptyString(credentialsSource ?? {}, 'chatgptAccountId') ??
      getNonEmptyString(credentialsSource ?? {}, 'accountId') ??
      getNonEmptyString(credentialsSource ?? {}, 'account_id');

    if (!apiKey || !accountId) {
      return undefined;
    }

    return {
      kind: 'credentials',
      credentials: {
        apiKey,
        'chatgpt-account-id': accountId,
      },
    };
  }

  const key =
    getNonEmptyString(body, 'key') ??
    getNonEmptyString(body, 'apiKey') ??
    getNonEmptyString(credentialsSource ?? {}, 'key') ??
    getNonEmptyString(credentialsSource ?? {}, 'apiKey');

  if (!key) {
    return undefined;
  }

  return { kind: 'key', key };
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
  const body = parsePutBody(provider, requestBody);

  if (!body) {
    let message = 'Request body must be valid JSON with a non-empty "key" string.';
    if (provider === 'claude-code') {
      message =
        'Request body must include non-empty "oauthToken", "betaFlag", and "billingHeader" strings.';
    } else if (provider === 'codex') {
      message = 'Request body must include non-empty "apiKey" and "chatgpt-account-id" strings.';
    }
    return apiError(400, {
      code: 'INVALID_BODY',
      message,
    });
  }

  try {
    const keysAdapter = createKeysAdapter();
    if (body.kind === 'credentials') {
      if (typeof keysAdapter.setCredentials === 'function') {
        await keysAdapter.setCredentials(provider, body.credentials);
      } else {
        return apiError(500, {
          code: 'KEY_SAVE_FAILED',
          message: 'Credentials storage is not supported by the configured keys adapter.',
        });
      }
    } else {
      await keysAdapter.set(provider, body.key);
    }

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
