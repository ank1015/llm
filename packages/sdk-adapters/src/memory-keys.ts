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
  private keys = new Map<Api, string>();

  async get(api: Api): Promise<string | undefined> {
    return this.keys.get(api);
  }

  async set(api: Api, key: string): Promise<void> {
    this.keys.set(api, key);
  }

  async delete(api: Api): Promise<boolean> {
    return this.keys.delete(api);
  }

  async list(): Promise<Api[]> {
    return [...this.keys.keys()];
  }
}
