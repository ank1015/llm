import { SetKeyRequestSchema } from '@ank1015/llm-app-contracts';
import { isValidApi, KnownApis } from '@ank1015/llm-sdk';
import { createFileKeysAdapter } from '@ank1015/llm-sdk-adapters';
import { Hono } from 'hono';

import {
  RELOADABLE_CREDENTIAL_APIS,
  reloadCredentials as reloadProviderCredentials,
} from '../core/session/credential-utils.js';
import { readJsonBody, validateSchema } from '../http/validation.js';

import type {
  DeleteKeyResponse,
  KeyProviderDetailsResponse,
  KeysListResponse,
  ReloadKeyResponse,
  SetKeyRequest,
  SetKeyResponse,
} from '@ank1015/llm-app-contracts';
import type { KeysAdapter, Api } from '@ank1015/llm-sdk';
import type { Context } from 'hono';

const INVALID_REQUEST_BODY_MESSAGE = 'Invalid request body';
const KEYS_PROVIDER_ROUTE = '/keys/:api';
const KEYS_RELOAD_ROUTE = '/keys/:api/reload';
const RELOAD_NOT_SUPPORTED_PREFIX = 'Reload not supported for';
const UNKNOWN_PROVIDER_PREFIX = 'Unknown provider:';

type KeyRouteDependencies = {
  keysAdapter: KeysAdapter;
  reloadCredentials: (api: Api) => Promise<Record<string, string>>;
};

function maskCredentialValue(value: string): string {
  if (value.length <= 10) {
    return '********';
  }

  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

async function getStoredCredentials(
  keysAdapter: KeysAdapter,
  api: Api
): Promise<Record<string, string> | undefined> {
  if (keysAdapter.getCredentials) {
    return keysAdapter.getCredentials(api);
  }

  const key = await keysAdapter.get(api);
  return key ? { apiKey: key } : undefined;
}

function createUnknownProviderResponse(c: Context, api: string): Response {
  return c.json({ error: `${UNKNOWN_PROVIDER_PREFIX} ${api}` }, 400);
}

export function createKeyRoutes(dependencies: Partial<KeyRouteDependencies> = {}): Hono {
  const keysAdapter = dependencies.keysAdapter ?? createFileKeysAdapter();
  const reloadCredentials = dependencies.reloadCredentials ?? reloadProviderCredentials;
  const keyRoutes = new Hono();

  keyRoutes.get('/keys', async (c) => {
    const storedApis = new Set(await keysAdapter.list());
    const providers: KeysListResponse['providers'] = await Promise.all(
      KnownApis.map(async (api) => {
        const hasKey = storedApis.has(api);
        const credentials = hasKey ? await getStoredCredentials(keysAdapter, api) : undefined;
        const maskedCredentials = credentials
          ? Object.fromEntries(
              Object.entries(credentials).map(([key, value]) => [key, maskCredentialValue(value)])
            )
          : undefined;

        return {
          api,
          hasKey,
          ...(maskedCredentials ? { credentials: maskedCredentials } : {}),
        };
      })
    );

    const body: KeysListResponse = { providers };
    return c.json(body);
  });

  keyRoutes.get(KEYS_PROVIDER_ROUTE, async (c) => {
    const { api } = c.req.param();
    if (!isValidApi(api)) {
      return createUnknownProviderResponse(c, api);
    }

    const credentials = (await getStoredCredentials(keysAdapter, api)) ?? {};
    const body: KeyProviderDetailsResponse = { credentials };
    return c.json(body);
  });

  keyRoutes.put(KEYS_PROVIDER_ROUTE, async (c) => {
    const { api } = c.req.param();
    if (!isValidApi(api)) {
      return createUnknownProviderResponse(c, api);
    }

    const rawBody = await readJsonBody(c);
    const validation = validateSchema(
      c,
      SetKeyRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }

    const body = validation.value as SetKeyRequest;
    if (body.credentials && Object.keys(body.credentials).length > 0) {
      if (keysAdapter.setCredentials) {
        await keysAdapter.setCredentials(api, body.credentials);
      } else if (typeof body.credentials.apiKey === 'string') {
        await keysAdapter.set(api, body.credentials.apiKey);
      } else {
        return c.json({ error: 'This provider does not support credential bundles' }, 400);
      }
    } else if (typeof body.key === 'string') {
      await keysAdapter.set(api, body.key);
    } else {
      return c.json({ error: 'Provide "key" or "credentials"' }, 400);
    }

    const response: SetKeyResponse = { ok: true };
    return c.json(response);
  });

  keyRoutes.delete(KEYS_PROVIDER_ROUTE, async (c) => {
    const { api } = c.req.param();
    if (!isValidApi(api)) {
      return createUnknownProviderResponse(c, api);
    }

    const deleted = keysAdapter.deleteCredentials
      ? await keysAdapter.deleteCredentials(api)
      : await keysAdapter.delete(api);
    const response: DeleteKeyResponse = { deleted };
    return c.json(response);
  });

  keyRoutes.post(KEYS_RELOAD_ROUTE, async (c) => {
    const { api } = c.req.param();
    if (!isValidApi(api)) {
      return createUnknownProviderResponse(c, api);
    }

    if (!RELOADABLE_CREDENTIAL_APIS.has(api)) {
      return c.json({ error: `${RELOAD_NOT_SUPPORTED_PREFIX} ${api}` }, 400);
    }

    const credentials = await reloadCredentials(api);
    if (keysAdapter.setCredentials) {
      await keysAdapter.setCredentials(api, credentials);
    } else if (typeof credentials.apiKey === 'string') {
      await keysAdapter.set(api, credentials.apiKey);
    } else {
      return c.json({ error: 'This provider does not support credential bundles' }, 400);
    }

    const response: ReloadKeyResponse = { ok: true };
    return c.json(response);
  });

  return keyRoutes;
}

export const keyRoutes = createKeyRoutes();
