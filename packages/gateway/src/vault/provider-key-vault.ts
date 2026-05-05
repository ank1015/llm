import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { GatewayConfig } from '../config.js';
import type { GatewayDatabase } from '../db/index.js';

export const SupportedGatewayApis = [
  'openai',
  'azure-openai',
  'google',
  'deepseek',
  'anthropic',
  'zai',
  'kimi',
  'minimax',
  'cerebras',
  'openrouter',
] as const;

export const SupportedGatewayImageApis = ['azure-openai'] as const;

export type GatewayApi = (typeof SupportedGatewayApis)[number];
export type GatewayImageApi = (typeof SupportedGatewayImageApis)[number];

export interface AzureOpenAIProviderCredentials {
  apiKey: string;
  azureDeploymentUrl: string;
  azureDeploymentName?: string;
}

interface ApiKeyProviderCredentials {
  apiKey: string;
}

export type GatewayProviderCredentials = ApiKeyProviderCredentials | AzureOpenAIProviderCredentials;

export interface ProviderKeyVault {
  getApiKey(api: GatewayApi): string | undefined;
  getProviderCredentials(api: GatewayApi): GatewayProviderCredentials | undefined;
  listConfiguredApis(): GatewayApi[];
  removeApiKey(api: GatewayApi): boolean;
  setApiKey(api: GatewayApi, apiKey: string): void;
  setProviderCredentials(api: GatewayApi, credentials: GatewayProviderCredentials): void;
}

export function createProviderKeyVault(
  db: GatewayDatabase,
  config: GatewayConfig
): ProviderKeyVault {
  const cache = new Map<GatewayApi, GatewayProviderCredentials>();

  for (const row of db.listProviderKeys()) {
    if (!isGatewayApi(row.api)) {
      continue;
    }

    cache.set(row.api, decryptProviderCredentials(config, row));
  }

  return {
    getApiKey(api) {
      return cache.get(api)?.apiKey;
    },
    getProviderCredentials(api) {
      return cache.get(api);
    },
    listConfiguredApis() {
      return [...cache.keys()].sort();
    },
    removeApiKey(api) {
      const removed = db.deleteProviderKey(api);
      cache.delete(api);
      return removed;
    },
    setApiKey(api, apiKey) {
      this.setProviderCredentials(api, { apiKey });
    },
    setProviderCredentials(api, credentials) {
      const encrypted = encryptProviderCredentials(config.encryptionKey, credentials);
      db.upsertProviderKey({
        api,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        updatedAt: Date.now(),
      });
      cache.set(api, credentials);
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
  return encryptProviderCredentials(encryptionKey, { apiKey });
}

function encryptProviderCredentials(
  encryptionKey: Buffer,
  credentials: GatewayProviderCredentials
): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({ version: 1, credentials }), 'utf8'),
    cipher.final(),
  ]);
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
  return decryptProviderCredentialsValue(encryptionKey, iv, tag, ciphertext).apiKey;
}

function decryptProviderCredentials(
  config: GatewayConfig,
  row: { ciphertext: Buffer; iv: Buffer; tag: Buffer }
): GatewayProviderCredentials {
  return decryptProviderCredentialsValue(config.encryptionKey, row.iv, row.tag, row.ciphertext);
}

function decryptProviderCredentialsValue(
  encryptionKey: Buffer,
  iv: Buffer,
  tag: Buffer,
  ciphertext: Buffer
): GatewayProviderCredentials {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  const parsed = parseProviderCredentialsPayload(plaintext);
  return parsed ?? { apiKey: plaintext };
}

function parseProviderCredentialsPayload(value: string): GatewayProviderCredentials | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) {
      return undefined;
    }

    const credentials = parsed['credentials'];
    if (!isRecord(credentials) || typeof credentials['apiKey'] !== 'string') {
      return undefined;
    }

    if (typeof credentials['azureDeploymentUrl'] === 'string') {
      return {
        apiKey: credentials['apiKey'],
        azureDeploymentUrl: credentials['azureDeploymentUrl'],
        ...(typeof credentials['azureDeploymentName'] === 'string'
          ? { azureDeploymentName: credentials['azureDeploymentName'] }
          : {}),
      };
    }
    return { apiKey: credentials['apiKey'] };
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
