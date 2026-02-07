/**
 * File-based Keys Adapter
 *
 * Stores encrypted API keys in ~/.llm/global/keys/
 * Uses AES-256-GCM encryption with machine-specific key derivation.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { KnownApis, PathTraversalError } from '@ank1015/llm-types';

import type { KeysAdapter, Api } from '@ank1015/llm-types';

/** Directory for storing encrypted keys */
const DEFAULT_KEYS_DIR = join(homedir(), '.llm', 'global', 'keys');

/** Encryption algorithm */
const ALGORITHM = 'aes-256-gcm';

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
 * File-based implementation of KeysAdapter.
 * Stores encrypted API keys in the filesystem.
 */
export class FileKeysAdapter implements KeysAdapter {
  private keysDir: string;
  private saltFile: string;

  constructor(keysDir: string = DEFAULT_KEYS_DIR) {
    this.keysDir = keysDir;
    this.saltFile = join(keysDir, '.salt');
  }

  /**
   * Ensure the keys directory exists.
   */
  private ensureKeysDir(): void {
    if (!existsSync(this.keysDir)) {
      mkdirSync(this.keysDir, { recursive: true });
    }
  }

  /**
   * Get or create the encryption salt.
   */
  private getSalt(): Buffer {
    this.ensureKeysDir();
    if (existsSync(this.saltFile)) {
      return readFileSync(this.saltFile);
    }
    const salt = randomBytes(32);
    writeFileSync(this.saltFile, salt);
    return salt;
  }

  /**
   * Derive encryption key from machine-specific data.
   */
  private deriveKey(): Buffer {
    const salt = this.getSalt();
    const machineId = `${homedir()}-llm-keys`;
    return scryptSync(machineId, salt, 32);
  }

  /**
   * Encrypt a string value.
   */
  private encrypt(plaintext: string): string {
    const key = this.deriveKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a string value.
   */
  private decrypt(ciphertext: string): string {
    const key = this.deriveKey();
    const parts = ciphertext.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivHex, authTagHex, encrypted] = parts as [string, string, string];
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Get the file path for a provider's key.
   */
  private getKeyPath(api: Api): string {
    const apiStr = String(api);
    if (apiStr.includes('..') || apiStr.includes('/') || apiStr.includes('\\')) {
      throw new PathTraversalError(apiStr);
    }
    return join(this.keysDir, `${apiStr}.key`);
  }

  /**
   * Get the file path for a provider's credential bundle.
   */
  private getCredentialsPath(api: Api): string {
    const apiStr = String(api);
    if (apiStr.includes('..') || apiStr.includes('/') || apiStr.includes('\\')) {
      throw new PathTraversalError(apiStr);
    }
    return join(this.keysDir, `${apiStr}.credentials`);
  }

  /**
   * Read an encrypted string file and decrypt it.
   */
  private readDecryptedFile(path: string): string | undefined {
    if (!existsSync(path)) return undefined;

    try {
      const encrypted = readFileSync(path, 'utf8');
      return this.decrypt(encrypted);
    } catch {
      return undefined;
    }
  }

  /**
   * Write encrypted string data to disk.
   */
  private writeEncryptedFile(path: string, plaintext: string): void {
    this.ensureKeysDir();
    const encrypted = this.encrypt(plaintext);
    writeFileSync(path, encrypted, 'utf8');
  }

  async get(api: Api): Promise<string | undefined> {
    // Prefer apiKey from credentials bundle when present.
    const credentials = await this.getCredentials(api);
    const bundledApiKey = credentials?.apiKey;
    if (bundledApiKey) {
      return bundledApiKey;
    }

    // Fallback to legacy single-key storage.
    return this.readDecryptedFile(this.getKeyPath(api));
  }

  async getCredentials(api: Api): Promise<Record<string, string> | undefined> {
    const credentialsRaw = this.readDecryptedFile(this.getCredentialsPath(api));
    if (credentialsRaw) {
      try {
        const parsed = JSON.parse(credentialsRaw);
        if (!parsed || typeof parsed !== 'object') return undefined;
        const credentials = {} as Record<string, string>;
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === 'string' && value) {
            credentials[key] = value;
          }
        }
        const normalized = normalizeCredentials(api, credentials);
        return Object.keys(normalized).length > 0 ? normalized : undefined;
      } catch {
        // Corrupted credentials bundle
        return undefined;
      }
    }

    // Backwards-compatible fallback for legacy single-key storage.
    const apiKey = this.readDecryptedFile(this.getKeyPath(api));
    if (!apiKey) return undefined;
    return { apiKey };
  }

  async set(api: Api, key: string): Promise<void> {
    // Keep legacy path for compatibility with existing consumers/tools.
    this.writeEncryptedFile(this.getKeyPath(api), key);

    // Keep credentials bundle in sync when present.
    const existing = (await this.getCredentials(api)) ?? {};
    const updated = { ...existing, apiKey: key };
    this.writeEncryptedFile(this.getCredentialsPath(api), JSON.stringify(updated));
  }

  async setCredentials(api: Api, credentials: Record<string, string>): Promise<void> {
    const normalized = normalizeCredentials(api, credentials);
    this.writeEncryptedFile(this.getCredentialsPath(api), JSON.stringify(normalized));

    // Keep legacy single-key path in sync when apiKey is provided.
    if (normalized.apiKey !== undefined) {
      this.writeEncryptedFile(this.getKeyPath(api), normalized.apiKey);
    }
  }

  async delete(api: Api): Promise<boolean> {
    const keyPath = this.getKeyPath(api);
    const credentialsPath = this.getCredentialsPath(api);
    let deleted = false;

    if (existsSync(keyPath)) {
      unlinkSync(keyPath);
      deleted = true;
    }
    if (existsSync(credentialsPath)) {
      unlinkSync(credentialsPath);
      deleted = true;
    }

    return deleted;
  }

  async deleteCredentials(api: Api): Promise<boolean> {
    return this.delete(api);
  }

  async list(): Promise<Api[]> {
    this.ensureKeysDir();
    const providers: Api[] = [];

    for (const api of KnownApis) {
      if (existsSync(this.getKeyPath(api)) || existsSync(this.getCredentialsPath(api))) {
        providers.push(api);
      }
    }

    return providers;
  }

  /**
   * Get the keys directory path.
   */
  getKeysDir(): string {
    return this.keysDir;
  }
}

/**
 * Create a FileKeysAdapter with the default directory.
 */
export function createFileKeysAdapter(keysDir?: string): FileKeysAdapter {
  return new FileKeysAdapter(keysDir);
}
