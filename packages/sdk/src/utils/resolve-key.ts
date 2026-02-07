/**
 * Shared API key resolution utility.
 *
 * Centralizes the key lookup logic used by complete(), stream(), and Conversation.
 */

import { ApiKeyNotFoundError } from '@ank1015/llm-types';

import type { KeysAdapter } from '../adapters/index.js';
import type { Api } from '@ank1015/llm-types';

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
  if (providerOptions && 'apiKey' in providerOptions && providerOptions.apiKey) {
    return providerOptions.apiKey as string;
  }
  if (keysAdapter) {
    const key = await keysAdapter.get(api);
    if (key) return key;
  }
  throw new ApiKeyNotFoundError(api);
}
