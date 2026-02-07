/**
 * In-memory Keys Adapter
 *
 * Simple Map-based implementation for testing. No persistence, no encryption.
 */

import type { KeysAdapter, Api } from '@ank1015/llm-types';

function normalizeCredentials(
  api: Api,
  credentials: Record<string, string>
): Record<string, string> {
  const normalized = { ...credentials };

  if (api === 'codex') {
    const accountId =
      normalized['chatgpt-account-id'] ??
      normalized.chatgptAccountId ??
      normalized.accountId ??
      normalized.account_id;
    if (accountId) {
      normalized['chatgpt-account-id'] = accountId;
    }

    const apiKey = normalized.apiKey ?? normalized.access_token ?? normalized.accessToken;
    if (apiKey) {
      normalized.apiKey = apiKey;
    }

    delete normalized.chatgptAccountId;
    delete normalized.accountId;
    delete normalized.account_id;
    delete normalized.access_token;
    delete normalized.accessToken;
  }

  return normalized;
}

/**
 * In-memory implementation of KeysAdapter for testing.
 */
export class InMemoryKeysAdapter implements KeysAdapter {
  private credentials = new Map<Api, Record<string, string>>();

  async get(api: Api): Promise<string | undefined> {
    return this.credentials.get(api)?.apiKey;
  }

  async getCredentials(api: Api): Promise<Record<string, string> | undefined> {
    const credentials = this.credentials.get(api);
    return credentials ? normalizeCredentials(api, credentials) : undefined;
  }

  async set(api: Api, key: string): Promise<void> {
    const existing = this.credentials.get(api) ?? {};
    this.credentials.set(api, { ...existing, apiKey: key });
  }

  async setCredentials(api: Api, credentials: Record<string, string>): Promise<void> {
    this.credentials.set(api, normalizeCredentials(api, credentials));
  }

  async delete(api: Api): Promise<boolean> {
    return this.credentials.delete(api);
  }

  async deleteCredentials(api: Api): Promise<boolean> {
    return this.credentials.delete(api);
  }

  async list(): Promise<Api[]> {
    return [...this.credentials.keys()];
  }
}
