/**
 * Shared provider-credential resolution utility.
 *
 * Centralizes credential lookup logic used by complete(), stream(), and Conversation.
 */

import { ApiKeyNotFoundError } from '@ank1015/llm-types';

import type { KeysAdapter } from '../adapters/index.js';
import type { Api } from '@ank1015/llm-types';

const REQUIRED_CREDENTIAL_FIELDS: Record<Api, readonly string[]> = {
  openai: ['apiKey'],
  google: ['apiKey'],
  deepseek: ['apiKey'],
  anthropic: ['apiKey'],
  'claude-code': ['oauthToken', 'betaFlag', 'billingHeader'],
  zai: ['apiKey'],
  kimi: ['apiKey'],
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function throwMissingCredentials(api: Api, missing: string[]): never {
  if (missing.length === 1 && missing[0] === 'apiKey') {
    throw new ApiKeyNotFoundError(api);
  }
  throw new Error(`Credentials not found for provider: ${api}. Missing: ${missing.join(', ')}`);
}

/**
 * Resolve provider credential fields from provider options or a KeysAdapter.
 *
 * Resolution order (per field):
 * 1. Use explicit value in providerOptions if present
 * 2. Use keysAdapter.getCredentials(api)?.[field] if available
 * 3. For apiKey only, fallback to keysAdapter.get(api)
 * 4. Throw if any required fields remain missing
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
export async function resolveProviderCredentials(
  api: Api,
  providerOptions?: Record<string, unknown>,
  keysAdapter?: KeysAdapter
): Promise<Record<string, string>> {
  const requiredFields = REQUIRED_CREDENTIAL_FIELDS[api] ?? ['apiKey'];
  const resolved = {} as Record<string, string>;

  for (const field of requiredFields) {
    const value = providerOptions?.[field];
    if (isNonEmptyString(value)) {
      resolved[field] = value;
    }
  }

  let missing = requiredFields.filter((field) => !resolved[field]);
  if (missing.length === 0) {
    return resolved;
  }

  if (keysAdapter?.getCredentials) {
    const storedCredentials = await keysAdapter.getCredentials(api);
    if (storedCredentials) {
      for (const field of missing) {
        const value = storedCredentials[field];
        if (isNonEmptyString(value)) {
          resolved[field] = value;
        }
      }
    }
  }

  missing = requiredFields.filter((field) => !resolved[field]);
  if (missing.includes('apiKey') && keysAdapter) {
    const key = await keysAdapter.get(api);
    if (isNonEmptyString(key)) {
      resolved.apiKey = key;
    }
  }

  missing = requiredFields.filter((field) => !resolved[field]);
  if (missing.length > 0) {
    throwMissingCredentials(api, missing);
  }

  return resolved;
}

/**
 * Resolve an API key from provider options or a KeysAdapter.
 *
 * Resolution order:
 * 1. If providerOptions contains a truthy apiKey, use it
 * 2. If keysAdapter is provided, look up the key for the given API
 * 3. Throw ApiKeyNotFoundError
 */
export async function resolveApiKey(
  api: Api,
  providerOptions?: Record<string, unknown>,
  keysAdapter?: KeysAdapter
): Promise<string> {
  const credentials = await resolveProviderCredentials(api, providerOptions, keysAdapter);
  const apiKey = credentials.apiKey;
  if (!apiKey) {
    throw new ApiKeyNotFoundError(api);
  }
  return apiKey;
}
