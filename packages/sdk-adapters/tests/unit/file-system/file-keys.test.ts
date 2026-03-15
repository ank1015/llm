/**
 * Unit tests for FileKeysAdapter
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileKeysAdapter, createFileKeysAdapter } from '../../../src/file-system/file-keys.js';

describe('FileKeysAdapter', () => {
  let testDir: string;
  let adapter: FileKeysAdapter;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `llm-keys-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    adapter = new FileKeysAdapter(testDir);
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('set() and get()', () => {
    it('should store and retrieve an API key', async () => {
      const testKey = 'sk-test-key-12345';

      await adapter.set('anthropic', testKey);
      const retrieved = await adapter.get('anthropic');

      expect(retrieved).toBe(testKey);
    });

    it('should store keys for different providers independently', async () => {
      await adapter.set('anthropic', 'anthropic-key');
      await adapter.set('openai', 'openai-key');
      await adapter.set('google', 'google-key');

      expect(await adapter.get('anthropic')).toBe('anthropic-key');
      expect(await adapter.get('openai')).toBe('openai-key');
      expect(await adapter.get('google')).toBe('google-key');
    });

    it('should overwrite existing key when set again', async () => {
      await adapter.set('anthropic', 'old-key');
      await adapter.set('anthropic', 'new-key');

      expect(await adapter.get('anthropic')).toBe('new-key');
    });

    it('should return undefined for non-existent key', async () => {
      const result = await adapter.get('anthropic');
      expect(result).toBeUndefined();
    });

    it('should handle keys with special characters', async () => {
      const specialKey = 'sk-test_key.with!special@chars#123$%^&*()';

      await adapter.set('anthropic', specialKey);
      const retrieved = await adapter.get('anthropic');

      expect(retrieved).toBe(specialKey);
    });

    it('should handle empty string key', async () => {
      await adapter.set('anthropic', '');
      const retrieved = await adapter.get('anthropic');

      expect(retrieved).toBe('');
    });

    it('should handle very long keys', async () => {
      const longKey = 'sk-' + 'a'.repeat(1000);

      await adapter.set('anthropic', longKey);
      const retrieved = await adapter.get('anthropic');

      expect(retrieved).toBe(longKey);
    });
  });

  describe('setCredentials() and getCredentials()', () => {
    it('should store and retrieve multi-field credentials', async () => {
      await adapter.setCredentials?.('claude-code', {
        oauthToken: 'oauth-token',
        betaFlag: 'flag-a,flag-b',
        billingHeader: 'x-anthropic-billing-header: cc_version=test;',
      });

      const credentials = await adapter.getCredentials?.('claude-code');
      expect(credentials).toEqual({
        oauthToken: 'oauth-token',
        betaFlag: 'flag-a,flag-b',
        billingHeader: 'x-anthropic-billing-header: cc_version=test;',
      });
    });

    it('should keep legacy get()/set() compatible when credentials bundle exists', async () => {
      await adapter.setCredentials?.('anthropic', { apiKey: 'bundle-key' });
      expect(await adapter.get('anthropic')).toBe('bundle-key');

      await adapter.set('anthropic', 'legacy-overwrite');
      expect(await adapter.get('anthropic')).toBe('legacy-overwrite');
      expect((await adapter.getCredentials?.('anthropic'))?.apiKey).toBe('legacy-overwrite');
    });

    it('should normalize codex account aliases in credentials', async () => {
      await adapter.setCredentials?.('codex', {
        apiKey: 'access-token',
        account_id: 'acc-123',
      });

      expect(await adapter.get('codex')).toBe('access-token');
      expect(await adapter.getCredentials?.('codex')).toEqual({
        apiKey: 'access-token',
        'chatgpt-account-id': 'acc-123',
      });
    });

    it('should preserve codex chatgpt-account-id when apiKey is updated via set()', async () => {
      await adapter.setCredentials?.('codex', {
        apiKey: 'old-token',
        'chatgpt-account-id': 'acc-123',
      });

      await adapter.set('codex', 'new-token');

      expect(await adapter.get('codex')).toBe('new-token');
      expect(await adapter.getCredentials?.('codex')).toEqual({
        apiKey: 'new-token',
        'chatgpt-account-id': 'acc-123',
      });
    });
  });

  describe('delete()', () => {
    it('should delete an existing key', async () => {
      await adapter.set('anthropic', 'test-key');

      const deleted = await adapter.delete('anthropic');

      expect(deleted).toBe(true);
      expect(await adapter.get('anthropic')).toBeUndefined();
    });

    it('should return false when deleting non-existent key', async () => {
      const deleted = await adapter.delete('anthropic');
      expect(deleted).toBe(false);
    });

    it('should not affect other keys when deleting one', async () => {
      await adapter.set('anthropic', 'anthropic-key');
      await adapter.set('openai', 'openai-key');

      await adapter.delete('anthropic');

      expect(await adapter.get('anthropic')).toBeUndefined();
      expect(await adapter.get('openai')).toBe('openai-key');
    });
  });

  describe('list()', () => {
    it('should return empty array when no keys stored', async () => {
      const providers = await adapter.list();
      expect(providers).toEqual([]);
    });

    it('should return all providers with stored keys', async () => {
      await adapter.set('anthropic', 'key1');
      await adapter.set('openai', 'key2');
      await adapter.set('google', 'key3');

      const providers = await adapter.list();

      expect(providers).toHaveLength(3);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toContain('google');
    });

    it('should not include deleted keys', async () => {
      await adapter.set('anthropic', 'key1');
      await adapter.set('openai', 'key2');
      await adapter.delete('anthropic');

      const providers = await adapter.list();

      expect(providers).toHaveLength(1);
      expect(providers).toContain('openai');
      expect(providers).not.toContain('anthropic');
    });

    it('should include provider with stored credential bundle', async () => {
      await adapter.setCredentials?.('claude-code', {
        oauthToken: 'oauth-token',
        betaFlag: 'flag-a,flag-b',
        billingHeader: 'x-anthropic-billing-header: cc_version=test;',
      });

      const providers = await adapter.list();
      expect(providers).toContain('claude-code');
    });
  });

  describe('encryption', () => {
    it('should store keys in encrypted format', async () => {
      const testKey = 'sk-plaintext-key';
      await adapter.set('anthropic', testKey);

      // Read the raw file content
      const keyPath = join(testDir, 'anthropic.key');
      expect(existsSync(keyPath)).toBe(true);

      const { readFileSync } = await import('node:fs');
      const fileContent = readFileSync(keyPath, 'utf8');

      // Content should not contain the plaintext key
      expect(fileContent).not.toContain(testKey);
      // Content should be in the expected format (iv:authTag:encrypted)
      expect(fileContent.split(':')).toHaveLength(3);
    });

    it('should return undefined for corrupted key file', async () => {
      // Write a corrupted file directly
      const keyPath = join(testDir, 'anthropic.key');
      writeFileSync(keyPath, 'not-valid-encrypted-data', 'utf8');

      const result = await adapter.get('anthropic');
      expect(result).toBeUndefined();
    });

    it('should return undefined for invalid format', async () => {
      const keyPath = join(testDir, 'anthropic.key');
      writeFileSync(keyPath, 'only:two:parts:here', 'utf8');

      const result = await adapter.get('anthropic');
      expect(result).toBeUndefined();
    });
  });

  describe('getKeysDir()', () => {
    it('should return the configured keys directory', () => {
      expect(adapter.getKeysDir()).toBe(testDir);
    });
  });

  describe('createFileKeysAdapter()', () => {
    it('should create adapter with custom directory', () => {
      const customAdapter = createFileKeysAdapter(testDir);
      expect(customAdapter.getKeysDir()).toBe(testDir);
    });

    it('should create adapter with default directory when not specified', () => {
      const defaultAdapter = createFileKeysAdapter();
      expect(defaultAdapter.getKeysDir()).toContain('.llm');
      expect(defaultAdapter.getKeysDir()).toContain('keys');
    });
  });

  describe('directory handling', () => {
    it('should create keys directory if it does not exist', async () => {
      const newDir = join(testDir, 'nested', 'keys', 'dir');
      const newAdapter = new FileKeysAdapter(newDir);

      await newAdapter.set('anthropic', 'test-key');

      expect(existsSync(newDir)).toBe(true);
      expect(await newAdapter.get('anthropic')).toBe('test-key');
    });
  });

  describe('salt handling', () => {
    it('should persist salt across adapter instances', async () => {
      // Set a key with first adapter
      await adapter.set('anthropic', 'test-key');

      // Create a new adapter instance with same directory
      const adapter2 = new FileKeysAdapter(testDir);

      // Should be able to read the key with the new instance
      const retrieved = await adapter2.get('anthropic');
      expect(retrieved).toBe('test-key');
    });
  });
});
