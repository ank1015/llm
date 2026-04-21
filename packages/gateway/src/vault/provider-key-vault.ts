import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { GatewayConfig } from '../config.js';
import type { GatewayDatabase } from '../db/index.js';

export const SupportedGatewayApis = [
  'openai',
  'google',
  'deepseek',
  'anthropic',
  'zai',
  'kimi',
  'minimax',
  'cerebras',
  'openrouter',
] as const;

export const SupportedGatewayImageApis = ['openai', 'google'] as const;

export type GatewayApi = (typeof SupportedGatewayApis)[number];
export type GatewayImageApi = (typeof SupportedGatewayImageApis)[number];

export interface ProviderKeyVault {
  getApiKey(api: GatewayApi): string | undefined;
  listConfiguredApis(): GatewayApi[];
  setApiKey(api: GatewayApi, apiKey: string): void;
}

export function createProviderKeyVault(
  db: GatewayDatabase,
  config: GatewayConfig
): ProviderKeyVault {
  const cache = new Map<GatewayApi, string>();

  for (const row of db.listProviderKeys()) {
    if (!isGatewayApi(row.api)) {
      continue;
    }

    cache.set(row.api, decryptApiKey(config.encryptionKey, row.iv, row.tag, row.ciphertext));
  }

  return {
    getApiKey(api) {
      return cache.get(api);
    },
    listConfiguredApis() {
      return [...cache.keys()].sort();
    },
    setApiKey(api, apiKey) {
      const encrypted = encryptApiKey(config.encryptionKey, apiKey);
      db.upsertProviderKey({
        api,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        updatedAt: Date.now(),
      });
      cache.set(api, apiKey);
    },
  };
}

export function isGatewayApi(value: string): value is GatewayApi {
  return SupportedGatewayApis.includes(value as GatewayApi);
}

export function isGatewayImageApi(value: string): value is GatewayImageApi {
  return SupportedGatewayImageApis.includes(value as GatewayImageApi);
}

export function encryptApiKey(
  encryptionKey: Buffer,
  apiKey: string
): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext,
    iv,
    tag,
  };
}

export function decryptApiKey(
  encryptionKey: Buffer,
  iv: Buffer,
  tag: Buffer,
  ciphertext: Buffer
): string {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
