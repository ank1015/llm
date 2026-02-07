/**
 * In-memory Keys Adapter
 *
 * Simple Map-based implementation for testing. No persistence, no encryption.
 */

import type { KeysAdapter, Api } from '@ank1015/llm-types';

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
    return credentials ? { ...credentials } : undefined;
  }

  async set(api: Api, key: string): Promise<void> {
    const existing = this.credentials.get(api) ?? {};
    this.credentials.set(api, { ...existing, apiKey: key });
  }

  async setCredentials(api: Api, credentials: Record<string, string>): Promise<void> {
    this.credentials.set(api, { ...credentials });
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
