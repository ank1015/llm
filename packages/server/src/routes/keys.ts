import { getSdkConfig } from '@ank1015/llm-sdk/config';
import {
  getProviderCredentialSpec,
  KnownKeyProviders,
  readKeysFile,
  resolveProviderCredentials,
  setProviderCredentials,
  writeKeysFile,
} from '@ank1015/llm-sdk/keys';
import { Hono } from 'hono';

import {
  RELOADABLE_CREDENTIAL_APIS,
  reloadCredentials as reloadProviderCredentials,
} from '../core/session/credential-utils.js';
import {
  SetKeyRequestSchema,
} from '../contracts/index.js';
import { readJsonBody, validateSchema } from '../http/validation.js';

import type {
  DeleteKeyResponse,
  KeyProviderDetailsResponse,
  KeysListResponse,
  ReloadKeyResponse,
  SetKeyRequest,
  SetKeyResponse,
} from '../contracts/index.js';
import type {
  KeyProvider,
  KeysFileValues,
  ProviderCredentials,
} from '@ank1015/llm-sdk/keys';
import type { Context } from 'hono';

const INVALID_REQUEST_BODY_MESSAGE = 'Invalid request body';
const KEYS_PROVIDER_ROUTE = '/keys/:provider';
const KEYS_RELOAD_ROUTE = '/keys/:provider/reload';
const RELOAD_NOT_SUPPORTED_PREFIX = 'Reload not supported for';
const UNKNOWN_PROVIDER_PREFIX = 'Unknown provider:';

type ReloadableKeyProvider = Extract<KeyProvider, 'codex' | 'claude-code'>;

type KeyRouteDependencies = {
  keysFilePath: string;
  reloadCredentials: (provider: ReloadableKeyProvider) => Promise<Record<string, string>>;
};

const RELOADABLE_KEY_PROVIDERS = new Set<ReloadableKeyProvider>(
  [...RELOADABLE_CREDENTIAL_APIS].filter(
    (provider): provider is ReloadableKeyProvider =>
      provider === 'codex' || provider === 'claude-code'
  )
);

function isKnownKeyProvider(value: string): value is KeyProvider {
  return KnownKeyProviders.includes(value as KeyProvider);
}

function isReloadableKeyProvider(value: KeyProvider): value is ReloadableKeyProvider {
  return RELOADABLE_KEY_PROVIDERS.has(value as ReloadableKeyProvider);
}

function maskCredentialValue(value: string): string {
  if (value.length <= 10) {
    return '********';
  }

  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function isNodeErrorWithCode(
  error: unknown,
  code: string
): error is NodeJS.ErrnoException & { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

async function readExistingKeysFile(filePath: string): Promise<KeysFileValues> {
  try {
    return await readKeysFile(filePath);
  } catch (error) {
    if (isNodeErrorWithCode(error, 'ENOENT')) {
      return {};
    }

    throw error;
  }
}

function getStoredCredentials(values: KeysFileValues, provider: KeyProvider): Record<string, string> {
  const spec = getProviderCredentialSpec(provider);
  const credentials: Record<string, string> = {};

  for (const field of spec.fields) {
    const keys = [field.env, ...field.aliases];

    for (const key of keys) {
      const value = values[key];
      if (typeof value === 'string' && value.length > 0) {
        credentials[field.option] = value;
        break;
      }
    }
  }

  return credentials;
}

async function saveProviderCredentials<TProvider extends KeyProvider>(
  filePath: string,
  provider: TProvider,
  credentials: Record<string, string>
): Promise<void> {
  await setProviderCredentials(
    filePath,
    provider,
    credentials as Partial<ProviderCredentials<TProvider>>
  );
}

async function deleteProviderCredentials(filePath: string, provider: KeyProvider): Promise<boolean> {
  const values = await readExistingKeysFile(filePath);
  const nextValues: KeysFileValues = { ...values };
  let deleted = false;

  for (const field of getProviderCredentialSpec(provider).fields) {
    for (const key of [field.env, ...field.aliases]) {
      if (key in nextValues) {
        delete nextValues[key];
        deleted = true;
      }
    }
  }

  if (deleted) {
    await writeKeysFile(filePath, nextValues);
  }

  return deleted;
}

function createUnknownProviderResponse(c: Context, provider: string): Response {
  return c.json({ error: `${UNKNOWN_PROVIDER_PREFIX} ${provider}` }, 400);
}

export function createKeyRoutes(dependencies: Partial<KeyRouteDependencies> = {}): Hono {
  const keysFilePath = dependencies.keysFilePath ?? getSdkConfig().keysFilePath;
  const reloadCredentials =
    dependencies.reloadCredentials ??
    (reloadProviderCredentials as KeyRouteDependencies['reloadCredentials']);
  const keyRoutes = new Hono();

  keyRoutes.get('/keys', async (c) => {
    const values = await readExistingKeysFile(keysFilePath);
    const providers: KeysListResponse['providers'] = await Promise.all(
      KnownKeyProviders.map(async (provider) => {
        const credentials = getStoredCredentials(values, provider);
        const resolution = await resolveProviderCredentials(keysFilePath, provider);
        const hasKey = resolution.ok || Object.keys(credentials).length > 0;
        const maskedCredentials =
          Object.keys(credentials).length > 0
            ? Object.fromEntries(
                Object.entries(credentials).map(([key, value]) => [key, maskCredentialValue(value)])
              )
            : undefined;

        return {
          provider,
          hasKey,
          ...(maskedCredentials ? { credentials: maskedCredentials } : {}),
        };
      })
    );

    return c.json<KeysListResponse>({ providers });
  });

  keyRoutes.get(KEYS_PROVIDER_ROUTE, async (c) => {
    const { provider } = c.req.param();
    if (!isKnownKeyProvider(provider)) {
      return createUnknownProviderResponse(c, provider);
    }

    const values = await readExistingKeysFile(keysFilePath);
    await resolveProviderCredentials(keysFilePath, provider);

    return c.json<KeyProviderDetailsResponse>({
      provider,
      credentials: getStoredCredentials(values, provider),
      fields: getProviderCredentialSpec(provider).fields.map((field) => ({
        option: field.option,
        env: field.env,
        aliases: [...field.aliases],
      })),
    });
  });

  keyRoutes.put(KEYS_PROVIDER_ROUTE, async (c) => {
    const { provider } = c.req.param();
    if (!isKnownKeyProvider(provider)) {
      return createUnknownProviderResponse(c, provider);
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
    if (!body.credentials || Object.keys(body.credentials).length === 0) {
      return c.json({ error: 'Provide "credentials"' }, 400);
    }

    await saveProviderCredentials(keysFilePath, provider, body.credentials);

    return c.json<SetKeyResponse>({ ok: true });
  });

  keyRoutes.delete(KEYS_PROVIDER_ROUTE, async (c) => {
    const { provider } = c.req.param();
    if (!isKnownKeyProvider(provider)) {
      return createUnknownProviderResponse(c, provider);
    }

    const deleted = await deleteProviderCredentials(keysFilePath, provider);
    return c.json<DeleteKeyResponse>({ deleted });
  });

  keyRoutes.post(KEYS_RELOAD_ROUTE, async (c) => {
    const { provider } = c.req.param();
    if (!isKnownKeyProvider(provider)) {
      return createUnknownProviderResponse(c, provider);
    }

    if (!isReloadableKeyProvider(provider)) {
      return c.json({ error: `${RELOAD_NOT_SUPPORTED_PREFIX} ${provider}` }, 400);
    }

    const credentials = await reloadCredentials(provider);
    await saveProviderCredentials(keysFilePath, provider, credentials);

    return c.json<ReloadKeyResponse>({ ok: true });
  });

  return keyRoutes;
}

export const keyRoutes = createKeyRoutes();
