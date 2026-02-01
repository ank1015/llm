/**
 * API Key Management Service
 *
 * Manages encrypted API keys for different LLM providers.
 * Keys are stored in ~/.llm/global/keys/ in encrypted format.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { Api } from '@ank1015/llm-types';

/** Directory for storing encrypted keys */
const KEYS_DIR = join(homedir(), '.llm', 'global', 'keys');

/** Encryption algorithm */
const ALGORITHM = 'aes-256-gcm';

/** Key derivation salt (stored alongside keys) */
const SALT_FILE = join(KEYS_DIR, '.salt');

/**
 * Ensure the keys directory exists.
 */
function ensureKeysDir(): void {
  if (!existsSync(KEYS_DIR)) {
    mkdirSync(KEYS_DIR, { recursive: true });
  }
}

/**
 * Get or create the encryption salt.
 */
function getSalt(): Buffer {
  ensureKeysDir();
  if (existsSync(SALT_FILE)) {
    return readFileSync(SALT_FILE);
  }
  const salt = randomBytes(32);
  writeFileSync(SALT_FILE, salt);
  return salt;
}

/**
 * Derive encryption key from machine-specific data.
 * Uses a combination of username and hostname for key derivation.
 */
function deriveKey(): Buffer {
  const salt = getSalt();
  // Use machine-specific identifier for key derivation
  const machineId = `${homedir()}-llm-keys`;
  return scryptSync(machineId, salt, 32);
}

/**
 * Encrypt a string value.
 */
function encrypt(plaintext: string): string {
  const key = deriveKey();
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
function decrypt(ciphertext: string): string {
  const key = deriveKey();
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
function getKeyPath(provider: Api): string {
  return join(KEYS_DIR, `${provider}.key`);
}

/**
 * API Key Management Service
 */
export const KeyService = {
  /**
   * Add or update an API key for a provider.
   *
   * @param provider - The API provider
   * @param apiKey - The API key to store
   */
  setKey(provider: Api, apiKey: string): void {
    ensureKeysDir();
    const encrypted = encrypt(apiKey);
    writeFileSync(getKeyPath(provider), encrypted, 'utf8');
  },

  /**
   * Get the API key for a provider.
   *
   * @param provider - The API provider
   * @returns The decrypted API key, or undefined if not found
   */
  getKey(provider: Api): string | undefined {
    const keyPath = getKeyPath(provider);
    if (!existsSync(keyPath)) {
      return undefined;
    }
    try {
      const encrypted = readFileSync(keyPath, 'utf8');
      return decrypt(encrypted);
    } catch {
      // If decryption fails, key file may be corrupted
      return undefined;
    }
  },

  /**
   * Remove the API key for a provider.
   *
   * @param provider - The API provider
   * @returns true if key was removed, false if it didn't exist
   */
  removeKey(provider: Api): boolean {
    const keyPath = getKeyPath(provider);
    if (!existsSync(keyPath)) {
      return false;
    }
    unlinkSync(keyPath);
    return true;
  },

  /**
   * Check if a provider has a stored API key.
   *
   * @param provider - The API provider
   * @returns true if key exists
   */
  hasKey(provider: Api): boolean {
    return existsSync(getKeyPath(provider));
  },

  /**
   * List all providers with stored API keys.
   *
   * @returns Array of provider names with stored keys
   */
  listProviders(): Api[] {
    ensureKeysDir();
    const providers: Api[] = [];
    const knownApis: Api[] = ['openai', 'google', 'deepseek', 'anthropic', 'zai', 'kimi'];

    for (const api of knownApis) {
      if (existsSync(getKeyPath(api))) {
        providers.push(api);
      }
    }

    return providers;
  },

  /**
   * Get the keys directory path.
   */
  getKeysDir(): string {
    return KEYS_DIR;
  },
};
