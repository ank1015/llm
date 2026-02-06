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

import { PathTraversalError } from '@ank1015/llm-types';

import type { KeysAdapter, Api } from '@ank1015/llm-types';

/** Directory for storing encrypted keys */
const DEFAULT_KEYS_DIR = join(homedir(), '.llm', 'global', 'keys');

/** Encryption algorithm */
const ALGORITHM = 'aes-256-gcm';

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

  async get(api: Api): Promise<string | undefined> {
    const keyPath = this.getKeyPath(api);
    if (!existsSync(keyPath)) {
      return undefined;
    }
    try {
      const encrypted = readFileSync(keyPath, 'utf8');
      return this.decrypt(encrypted);
    } catch {
      // If decryption fails, key file may be corrupted
      return undefined;
    }
  }

  async set(api: Api, key: string): Promise<void> {
    this.ensureKeysDir();
    const encrypted = this.encrypt(key);
    writeFileSync(this.getKeyPath(api), encrypted, 'utf8');
  }

  async delete(api: Api): Promise<boolean> {
    const keyPath = this.getKeyPath(api);
    if (!existsSync(keyPath)) {
      return false;
    }
    unlinkSync(keyPath);
    return true;
  }

  async list(): Promise<Api[]> {
    this.ensureKeysDir();
    const providers: Api[] = [];
    const knownApis: Api[] = ['openai', 'google', 'deepseek', 'anthropic', 'zai', 'kimi'];

    for (const api of knownApis) {
      if (existsSync(this.getKeyPath(api))) {
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
